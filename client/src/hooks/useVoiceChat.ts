import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { RemoteUser } from '../types';
import {
  PEER_RECOVERY_TIMEOUT_MS,
  isCurrentPeerConnection,
  shouldStartPeerRecovery,
  shouldTearDownPeer,
  shouldTearDownPeerAfterRecovery,
} from './voicePeerLifecycle';

interface UseVoiceChatProps {
  socket: Socket | null;
  currentUser: { id: string; name: string; color: string };
  roomId: string | null;
  users: Record<string, RemoteUser>;
  onNotification?: (text: string, type?: 'info' | 'success' | 'warning') => void;
}

const DEFAULT_STUN = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

function buildIceServerConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [...DEFAULT_STUN];

  const customStuns = (import.meta.env.VITE_STUN_URLS as string | undefined)
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (customStuns && customStuns.length > 0) {
    iceServers.push(...customStuns.map((urls) => ({ urls })));
  }

  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(',').map((s) => s.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_PASSWORD,
    });
  }

  return { iceServers };
}

const ICE_SERVERS: RTCConfiguration = buildIceServerConfig();

// Deterministic rule for initiator in WebRTC mesh to prevent offer collision (glare)
function shouldInitiateOffer(myId: string, otherId: string): boolean {
  return myId > otherId;
}

export function useVoiceChat({
  socket,
  currentUser,
  roomId,
  users,
  onNotification,
}: UseVoiceChatProps) {
  const [isVoiceConnected, setIsVoiceConnected] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDeafened, setIsDeafened] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.9);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(32));
  const [isSimulated, setIsSimulated] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isIframeRestricted, setIsIframeRestricted] = useState<boolean>(false);
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);

  // Synchronized ref for callback access without stale closures
  const isVoiceConnectedRef = useRef<boolean>(false);
  isVoiceConnectedRef.current = isVoiceConnected;
  const isMutedRef = useRef<boolean>(false);
  isMutedRef.current = isMuted;

  // Web Audio refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const freqDataBufferRef = useRef<Uint8Array>(new Uint8Array(32));

  // Simulation refs
  const simOscillatorRef = useRef<OscillatorNode | null>(null);
  const simGainRef = useRef<GainNode | null>(null);
  const simIntervalRef = useRef<number | null>(null);

  // WebRTC Audio refs
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const remoteAudioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  // ICE candidate queue to prevent "remote description was null" race condition
  const pendingCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  // Pending ICE-restart grace periods for transiently disconnected peers.
  const peerRecoveryTimersRef = useRef<Record<string, number>>({});

  const clearPeerRecoveryTimer = useCallback((targetUserId: string) => {
    const timer = peerRecoveryTimersRef.current[targetUserId];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete peerRecoveryTimersRef.current[targetUserId];
    }
  }, []);

  // Remove a connection from the registry before closing it so any synchronous
  // or late `closed` callback sees that it is no longer the active peer.
  const discardPeer = useCallback(
    (targetUserId: string, pc: RTCPeerConnection) => {
      if (!isCurrentPeerConnection(peerConnectionsRef.current, targetUserId, pc)) return false;
      clearPeerRecoveryTimer(targetUserId);
      delete peerConnectionsRef.current[targetUserId];
      delete pendingCandidatesRef.current[targetUserId];
      try {
        pc.close();
      } catch (_) {}
      return true;
    },
    [clearPeerRecoveryTimer]
  );

  const removePeerAudio = useCallback((targetUserId: string) => {
    setActiveSpeakers((prev) => prev.filter((id) => id !== targetUserId));
    const el = remoteAudioElementsRef.current[targetUserId];
    if (el) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch (_) {}
      delete remoteAudioElementsRef.current[targetUserId];
    }
  }, []);

  const teardownPeer = useCallback(
    (targetUserId: string, pc?: RTCPeerConnection) => {
      if (pc && !isCurrentPeerConnection(peerConnectionsRef.current, targetUserId, pc)) return;
      if (pc) discardPeer(targetUserId, pc);
      else clearPeerRecoveryTimer(targetUserId);
      removePeerAudio(targetUserId);
    },
    [discardPeer, clearPeerRecoveryTimer, removePeerAudio]
  );

  // Voice belongs to one room/socket. Track the active pair so a room switch
  // tears it down and an in-flight getUserMedia cannot resurrect it later.
  const voiceRoomRef = useRef<string | null>(roomId);
  const voiceSocketRef = useRef<Socket | null>(socket);
  const voiceEpochRef = useRef(0);
  /** Sockets we intentionally left; their `disconnect` event needs no cleanup. */
  const expectedDisconnectsRef = useRef<WeakSet<Socket>>(new WeakSet());

  // Notify peers on the socket we are leaving before switching/reconnecting.
  const announceVoiceLeft = useCallback((target: Socket | null) => {
    try {
      if (target?.connected) {
        target.emit('voice-status-update', { voiceConnected: false, isMuted: true });
      }
    } catch (_) {
      // Socket already torn down; nothing to announce.
    }
  }, []);

  // Helper to ensure an active AudioContext
  const getOrCreateAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioCtxClass();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // Update volume on master gain and remote elements
  useEffect(() => {
    const effectiveVol = isDeafened ? 0 : (isSimulated ? volume * 0.15 : volume);
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = effectiveVol;
    }
    Object.values(remoteAudioElementsRef.current).forEach((el) => {
      el.volume = effectiveVol;
    });
  }, [volume, isDeafened, isSimulated]);

  // Clean up all voice resources
  const cleanupAll = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }

    if (simOscillatorRef.current) {
      try {
        simOscillatorRef.current.stop();
        simOscillatorRef.current.disconnect();
      } catch (_) {}
      simOscillatorRef.current = null;
    }

    // Stop and close all peer connections. Discard them first so their late
    // `closed` callbacks cannot touch this room's replacement peers.
    Object.keys(peerConnectionsRef.current).forEach((userId) => {
      const pc = peerConnectionsRef.current[userId];
      if (pc) discardPeer(userId, pc);
    });
    Object.keys(peerRecoveryTimersRef.current).forEach((userId) => {
      clearPeerRecoveryTimer(userId);
    });
    peerConnectionsRef.current = {};
    pendingCandidatesRef.current = {};

    // Remove remote audio elements
    Object.keys(remoteAudioElementsRef.current).forEach((userId) => {
      try {
        const el = remoteAudioElementsRef.current[userId];
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch (_) {}
    });
    remoteAudioElementsRef.current = {};

    // Stop local mic tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch (_) {}
      sourceRef.current = null;
    }

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try {
        audioCtxRef.current.close();
      } catch (_) {}
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    masterGainRef.current = null;
    simGainRef.current = null;
    freqDataBufferRef.current = new Uint8Array(32);
    setFrequencyData(new Uint8Array(32));

    setIsVoiceConnected(false);
    isVoiceConnectedRef.current = false;
    setIsSimulated(false);
    setAudioLevel(0);
    setIsSpeaking(false);
    setActiveSpeakers([]);
  }, [discardPeer, clearPeerRecoveryTimer]);

  // A room change (or socket reconnect) invalidates every voice resource: the
  // mic, peers and "connected" UI state must never leak into the new room.
  // Layout effect so the notice reaches the old socket before useSocket's
  // passive cleanup disconnects it.
  useLayoutEffect(() => {
    const previousRoom = voiceRoomRef.current;
    const previousSocket = voiceSocketRef.current;
    const changed = previousRoom !== roomId || previousSocket !== socket;

    voiceRoomRef.current = roomId;
    voiceSocketRef.current = socket;

    if (!changed) return;

    voiceEpochRef.current += 1;
    announceVoiceLeft(previousSocket);
    if (previousSocket) expectedDisconnectsRef.current.add(previousSocket);
    cleanupAll();
    setError(null);
    setIsIframeRestricted(false);
  }, [roomId, socket, cleanupAll, announceVoiceLeft]);

  // Socket.IO reconnects in place and kick/delete handlers call disconnect()
  // without changing roomId or the socket object. Clean up voice on any real
  // disconnect too, ignoring the old socket we just left during a room switch.
  useEffect(() => {
    if (!socket) return;
    const handleDisconnect = () => {
      if (expectedDisconnectsRef.current.delete(socket)) return;
      voiceEpochRef.current += 1;
      cleanupAll();
      setError(null);
      setIsIframeRestricted(false);
    };
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, cleanupAll]);

  // Flush queued ICE candidates after remote description is set. Only remove
  // candidates that were applied successfully; keep failures for a retry.
  const flushPendingCandidates = useCallback(async (targetUserId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current[targetUserId];
    if (!pending || pending.length === 0) return;

    const attempted = new Set(pending);
    const failed: RTCIceCandidateInit[] = [];
    for (const candidate of Array.from(pending)) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('Failed to add buffered ICE candidate:', e);
        failed.push(candidate);
      }
    }

    // Preserve any candidates that arrived while the awaits were in flight.
    const current = pendingCandidatesRef.current[targetUserId] ?? [];
    const remaining = [...failed, ...current.filter((candidate) => !attempted.has(candidate))];
    if (remaining.length > 0) {
      pendingCandidatesRef.current[targetUserId] = remaining;
    } else {
      delete pendingCandidatesRef.current[targetUserId];
    }
  }, []);

  // WebRTC Peer Connection Helper
  const createPeerConnection = useCallback(
    (targetUserId: string, forceNew = false): RTCPeerConnection => {
      const existing = peerConnectionsRef.current[targetUserId];
      if (
        existing &&
        !forceNew &&
        existing.connectionState !== 'closed' &&
        existing.connectionState !== 'failed'
      ) {
        return existing;
      }

      if (existing) {
        // Discard the old peer before closing it. Its late `closed` callback
        // must not delete the replacement installed below.
        discardPeer(targetUserId, existing);
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[targetUserId] = pc;

      // Add local audio tracks if available
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          try {
            pc.addTrack(track, localStreamRef.current!);
          } catch (e) {
            console.warn('Error adding local audio track:', e);
          }
        });
      }

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (!isCurrentPeerConnection(peerConnectionsRef.current, targetUserId, pc)) return;
        if (event.candidate && socket) {
          socket.emit('voice-ice-candidate', {
            toUserId: targetUserId,
            candidate: event.candidate,
          });
        }
      };

      // Handle remote incoming audio track
      pc.ontrack = (event) => {
        if (!isCurrentPeerConnection(peerConnectionsRef.current, targetUserId, pc)) return;
        const stream =
          event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);

        let audioEl = remoteAudioElementsRef.current[targetUserId];
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          (audioEl as any).playsInline = true;
          audioEl.volume = isDeafened ? 0 : volume;
          document.body.appendChild(audioEl);
          remoteAudioElementsRef.current[targetUserId] = audioEl;
        }

        audioEl.srcObject = stream;
        audioEl.play().catch((e) => {
          console.warn('Auto-play blocked, will resume on user interaction:', e);
        });

        // Track active speaker state
        setActiveSpeakers((prev) => (prev.includes(targetUserId) ? prev : [...prev, targetUserId]));
      };

      pc.onconnectionstatechange = () => {
        // A replacement peer owns the shared state from now on.
        if (!isCurrentPeerConnection(peerConnectionsRef.current, targetUserId, pc)) return;

        const state = pc.connectionState;
        if (state === 'connected') {
          clearPeerRecoveryTimer(targetUserId);
          setActiveSpeakers((prev) => (prev.includes(targetUserId) ? prev : [...prev, targetUserId]));
          return;
        }

        if (shouldStartPeerRecovery(state)) {
          setActiveSpeakers((prev) => prev.filter((id) => id !== targetUserId));
          if (peerRecoveryTimersRef.current[targetUserId] !== undefined) return;

          try {
            const restartable = pc as RTCPeerConnection & { restartIce?: () => void };
            restartable.restartIce?.();
          } catch (e) {
            console.warn('ICE restart failed for voice peer:', targetUserId, e);
          }

          const timer = window.setTimeout(() => {
            delete peerRecoveryTimersRef.current[targetUserId];
            if (!isCurrentPeerConnection(peerConnectionsRef.current, targetUserId, pc)) return;
            if (!shouldTearDownPeerAfterRecovery(pc.connectionState)) return;
            teardownPeer(targetUserId, pc);
          }, PEER_RECOVERY_TIMEOUT_MS);
          peerRecoveryTimersRef.current[targetUserId] = timer;
          return;
        }

        if (shouldTearDownPeer(state, peerRecoveryTimersRef.current[targetUserId] !== undefined)) {
          teardownPeer(targetUserId, pc);
        }
      };

      return pc;
    },
    [socket, isDeafened, volume, discardPeer, clearPeerRecoveryTimer, teardownPeer]
  );

  // Send an SDP offer to a specific target user
  const initiateOfferToUser = useCallback(
    async (targetUserId: string) => {
      if (!socket || !localStreamRef.current) return;
      if (targetUserId === currentUser.id) return;

      try {
        const pc = createPeerConnection(targetUserId, true);
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
        });
        await pc.setLocalDescription(offer);
        socket.emit('voice-offer', {
          toUserId: targetUserId,
          offer,
        });
      } catch (err) {
        console.warn('Failed to create voice offer for user:', targetUserId, err);
      }
    },
    [socket, currentUser.id, createPeerConnection]
  );

  // Initiate WebRTC offers to all existing peers in the room who are in voice chat
  const initiatePeerConnections = useCallback(() => {
    if (!socket || !localStreamRef.current) return;

    Object.values(users).forEach((user) => {
      if (user.id === currentUser.id) return;
      // Connect to peers who have voiceConnected, using deterministic role to avoid glare
      if (user.voiceConnected && shouldInitiateOffer(currentUser.id, user.id)) {
        initiateOfferToUser(user.id);
      }
    });
  }, [socket, currentUser.id, users, initiateOfferToUser]);

  // A delayed solo→multiplayer start can capture the pre-conversion callback.
  // Keep the latest socket-backed version in a ref and call through it.
  const initiatePeerConnectionsRef = useRef(initiatePeerConnections);
  initiatePeerConnectionsRef.current = initiatePeerConnections;

  // Start real microphone voice chat
  const startVoiceChat = useCallback(async () => {
    // Read the room from a ref: the solo→multiplayer flow schedules this call
    // right after convertToMultiplayerRoom(), so the closure's roomId is stale.
    const activeRoom = voiceRoomRef.current;
    if (!activeRoom) {
      if (onNotification) onNotification('Please join or create a multiplayer room to use voice chat.', 'warning');
      return false;
    }

    // The solo→multiplayer flow may call a callback created before the new
    // socket existed; always use the current ones from refs.
    const activeSocket = voiceSocketRef.current;
    const startEpoch = voiceEpochRef.current;
    const startRoom = activeRoom;

    cleanupAll();
    setError(null);
    setIsIframeRestricted(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          throw new Error('Microphone requires HTTPS or localhost. On mobile LAN, please use HTTPS or test via Simulation mode.');
        }
        throw new Error('Microphone access is not supported by your browser.');
      }

      // Request microphone access with echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // The room/socket may have changed while the permission prompt was open.
      // Never attach a stream from the old room to the new one.
      if (voiceEpochRef.current !== startEpoch || voiceRoomRef.current !== startRoom) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }

      localStreamRef.current = stream;

      // Setup Web Audio Context for visualizer and volume
      const audioCtx = getOrCreateAudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      freqDataBufferRef.current = new Uint8Array(analyser.frequencyBinCount);

      setIsVoiceConnected(true);
      isVoiceConnectedRef.current = true;
      setIsMuted(false);
      setIsSimulated(false);

      if (activeSocket) {
        activeSocket.emit('voice-status-update', {
          voiceConnected: true,
          isMuted: false,
          isDeafened,
        });
      }

      // Initiate WebRTC mesh connections using the current room's callback.
      initiatePeerConnectionsRef.current();

      // Audio analysis loop
      let lastAudioEmit = 0;
      const updateAnalysis = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(freqDataBufferRef.current);
        setFrequencyData(new Uint8Array(freqDataBufferRef.current));

        let sum = 0;
        const len = freqDataBufferRef.current.length;
        for (let i = 0; i < len; i++) {
          sum += freqDataBufferRef.current[i];
        }
        const avg = sum / (len * 255);
        const normalized = Math.min(1, avg * 2.8);

        const speakingNow = normalized > 0.08 && !isMutedRef.current;
        setAudioLevel(normalized);
        setIsSpeaking(speakingNow);

        const now = Date.now();
        if (now - lastAudioEmit > 80 && activeSocket) {
          lastAudioEmit = now;
          activeSocket.emit('audio-level', {
            level: normalized,
            isSpeaking: speakingNow,
          });
        }

        animFrameRef.current = requestAnimationFrame(updateAnalysis);
      };

      updateAnalysis();
      onNotification?.('Voice Chat Connected! You are now live.', 'success');
      return true;
    } catch (err: any) {
      // Permission prompts outlive room switches. A late rejection must not
      // overwrite the new room's clean state or notify the new room.
      if (voiceEpochRef.current !== startEpoch || voiceRoomRef.current !== startRoom) {
        return false;
      }
      console.warn('Microphone activation failed:', err);
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        err?.message?.toLowerCase().includes('permission');

      const inIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (isDenied && inIframe) {
        setIsIframeRestricted(true);
        setError('Microphone permission is restricted inside preview iframe. Open in a new tab or use Voice Simulation.');
      } else if (isDenied) {
        setError('Microphone permission was denied in your browser settings.');
      } else {
        setError(err?.message || 'Unable to access microphone.');
      }

      onNotification?.(
        isDenied
          ? 'Microphone blocked by browser or iframe. Click "Open in New Tab" or use Simulation mode.'
          : err?.message || 'Could not activate microphone. Check browser permissions.',
        'warning'
      );

      return false;
    }
  }, [
    cleanupAll,
    getOrCreateAudioContext,
    socket,
    isDeafened,
    initiatePeerConnections,
    onNotification,
    roomId,
  ]);

  // Leave Voice Chat
  const leaveVoiceChat = useCallback(() => {
    cleanupAll();
    if (socket) {
      socket.emit('voice-status-update', {
        voiceConnected: false,
        isMuted: true,
      });
      socket.emit('audio-level', {
        level: 0,
        isSpeaking: false,
      });
    }
    onNotification?.('Disconnected from Voice Chat.', 'info');
  }, [cleanupAll, socket, onNotification]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (!isVoiceConnected) return;

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }

    if (socket) {
      socket.emit('voice-status-update', {
        isMuted: nextMuted,
      });
      if (nextMuted) {
        socket.emit('audio-level', {
          level: 0,
          isSpeaking: false,
        });
        setIsSpeaking(false);
        setAudioLevel(0);
      }
    }

    onNotification?.(nextMuted ? 'Microphone Muted' : 'Microphone Unmuted', 'info');
  }, [isVoiceConnected, isMuted, socket, onNotification]);

  // Toggle Deafen
  const toggleDeafen = useCallback(() => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);

    if (socket) {
      socket.emit('voice-status-update', {
        isDeafened: nextDeafened,
      });
    }

    onNotification?.(nextDeafened ? 'Deafened: All incoming audio muted' : 'Undeafened: Audio restored', 'info');
  }, [isDeafened, socket, onNotification]);

  // Interactive Voice Simulation (Audible Harmonic Chime + Waveform)
  const toggleSimulated = useCallback(() => {
    if (isSimulated) {
      cleanupAll();
      if (socket) {
        socket.emit('voice-status-update', {
          voiceConnected: false,
          isMuted: true,
          isDeafened,
        });
        socket.emit('audio-level', {
          level: 0,
          isSpeaking: false,
        });
      }
      onNotification?.('Voice Simulation stopped', 'info');
    } else {
      cleanupAll();
      setError(null);
      setIsSimulated(true);
      setIsMuted(false);
      setIsVoiceConnected(true);
      isVoiceConnectedRef.current = true;

      if (socket) {
        socket.emit('voice-status-update', {
          voiceConnected: true,
          isMuted: false,
          isDeafened,
        });
      }

      const audioCtx = getOrCreateAudioContext();

      const masterGain = audioCtx.createGain();
      masterGain.gain.value = isDeafened ? 0 : 0.15;
      masterGain.connect(audioCtx.destination);
      masterGainRef.current = masterGain;

      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);

      const oscGain = audioCtx.createGain();
      oscGain.gain.setValueAtTime(0, audioCtx.currentTime);

      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start();

      simOscillatorRef.current = osc;
      simGainRef.current = oscGain;

      let phase = 0;
      simIntervalRef.current = window.setInterval(() => {
        phase += 0.25;

        const voiceCadence = (Math.sin(phase) + Math.sin(phase * 1.5) + 2) / 4;
        const isCurrentlyTalking = voiceCadence > 0.45;
        const currentLevel = isCurrentlyTalking ? voiceCadence * 0.85 : 0.02;

        setAudioLevel(currentLevel);
        setIsSpeaking(isCurrentlyTalking);

        if (simGainRef.current && simOscillatorRef.current && audioCtx.state === 'running') {
          const targetGain = isCurrentlyTalking ? 0.2 : 0.01;
          simGainRef.current.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
          simOscillatorRef.current.frequency.setTargetAtTime(
            220 + Math.sin(phase * 3) * 60,
            audioCtx.currentTime,
            0.05
          );
        }

        const buf = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          const harmonic = Math.sin(phase * 2 + i * 0.4);
          buf[i] = Math.floor(currentLevel * 255 * (0.4 + 0.6 * Math.abs(harmonic)));
        }
        setFrequencyData(buf);

        if (socket) {
          socket.emit('audio-level', {
            level: currentLevel,
            isSpeaking: isCurrentlyTalking,
          });
        }
      }, 100);

      onNotification?.('Voice Simulation Active: Audio harmonics & wave broadcasting!', 'success');
    }
  }, [isSimulated, cleanupAll, getOrCreateAudioContext, isDeafened, socket, onNotification]);

  // Open Whiteboard in a new tab for unconstrained permissions
  const openInNewTab = useCallback(() => {
    const url = window.location.href;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  // Handle incoming Socket.io WebRTC signaling & dynamic voice peer lifecycle
  useEffect(() => {
    if (!socket) return;

    // Incoming WebRTC Offer
    const handleVoiceOffer = async (payload: { fromUserId: string; offer: any }) => {
      try {
        let pc: RTCPeerConnection | undefined = peerConnectionsRef.current[payload.fromUserId];
        // If connection exists in a non-stable state or has a collision,
        // recreate it through the helper so stale ICE candidates are discarded.
        if (pc && pc.signalingState !== 'stable') {
          pc = createPeerConnection(payload.fromUserId, true);
        }

        if (!pc) {
          pc = createPeerConnection(payload.fromUserId);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        await flushPendingCandidates(payload.fromUserId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('voice-answer', {
          toUserId: payload.fromUserId,
          answer,
        });
      } catch (err) {
        console.warn('Error handling incoming voice offer:', err);
      }
    };

    // Incoming WebRTC Answer
    const handleVoiceAnswer = async (payload: { fromUserId: string; answer: any }) => {
      try {
        const pc = peerConnectionsRef.current[payload.fromUserId];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          await flushPendingCandidates(payload.fromUserId, pc);
        }
      } catch (err) {
        console.warn('Error handling incoming voice answer:', err);
      }
    };

    // Incoming ICE Candidate
    const handleVoiceIceCandidate = async (payload: { fromUserId: string; candidate: any }) => {
      try {
        const pc = peerConnectionsRef.current[payload.fromUserId];
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } else {
          // Buffer candidate until remote description is applied
          if (!pendingCandidatesRef.current[payload.fromUserId]) {
            pendingCandidatesRef.current[payload.fromUserId] = [];
          }
          pendingCandidatesRef.current[payload.fromUserId].push(payload.candidate);
        }
      } catch (err) {
        console.warn('Error handling ICE candidate:', err);
      }
    };

    // Dynamic peer lifecycle: connect when a peer joins voice, disconnect when they leave
    const handleVoiceStatusUpdated = (data: {
      userId: string;
      isMuted?: boolean;
      isDeafened?: boolean;
      voiceConnected?: boolean;
    }) => {
      if (!data || data.userId === currentUser.id) return;

      if (data.voiceConnected) {
        // If we are currently connected to voice and are the designated initiator, send offer
        if (isVoiceConnectedRef.current && localStreamRef.current) {
          if (shouldInitiateOffer(currentUser.id, data.userId)) {
            initiateOfferToUser(data.userId);
          }
        }
      } else if (data.voiceConnected === false) {
        teardownPeer(data.userId, peerConnectionsRef.current[data.userId]);
      }
    };

    const handleUserLeft = (data: { userId: string }) => {
      if (!data || !data.userId) return;
      teardownPeer(data.userId, peerConnectionsRef.current[data.userId]);
    };

    socket.on('voice-offer', handleVoiceOffer);
    socket.on('voice-answer', handleVoiceAnswer);
    socket.on('voice-ice-candidate', handleVoiceIceCandidate);
    socket.on('voice-status-updated', handleVoiceStatusUpdated);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('voice-offer', handleVoiceOffer);
      socket.off('voice-answer', handleVoiceAnswer);
      socket.off('voice-ice-candidate', handleVoiceIceCandidate);
      socket.off('voice-status-updated', handleVoiceStatusUpdated);
      socket.off('user-left', handleUserLeft);
    };
  }, [
    socket,
    currentUser.id,
    createPeerConnection,
    flushPendingCandidates,
    initiateOfferToUser,
    teardownPeer,
  ]);

  // Browser Autoplay Policy Unlocker: Resume AudioContext and trigger play() on user interaction
  useEffect(() => {
    if (!isVoiceConnected) return;

    const unlockAudio = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      Object.values(remoteAudioElementsRef.current).forEach((el) => {
        if (el && el.paused) {
          el.play().catch(() => {});
        }
      });
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, [isVoiceConnected]);

  // Clean up when unmounting. Layout effect so the leave notice is emitted
  // before useSocket's passive cleanup disconnects the socket.
  useLayoutEffect(() => {
    return () => {
      announceVoiceLeft(voiceSocketRef.current);
      cleanupAll();
    };
  }, [cleanupAll, announceVoiceLeft]);

  return {
    isVoiceConnected,
    isMuted,
    isDeafened,
    volume,
    setVolume,
    audioLevel,
    isSpeaking,
    frequencyData,
    isSimulated,
    error,
    clearError: () => setError(null),
    isIframeRestricted,
    activeSpeakers,
    startVoiceChat,
    leaveVoiceChat,
    toggleMute,
    toggleDeafen,
    toggleSimulated,
    openInNewTab,
  };
}
