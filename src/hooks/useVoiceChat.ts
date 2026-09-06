import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { RemoteUser } from '../types';

interface UseVoiceChatProps {
  socket: Socket | null;
  currentUser: { id: string; name: string; color: string };
  roomId: string;
  users: Record<string, RemoteUser>;
  onNotification?: (text: string, type?: 'info' | 'success' | 'warning') => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

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

  // WebRTC & Audio Relay refs
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const remoteAudioElementsRef = useRef<Record<string, HTMLAudioElement>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const remoteAudioContextRef = useRef<AudioContext | null>(null);

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
    const effectiveVol = isDeafened ? 0 : volume;
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = effectiveVol;
    }
    (Object.values(remoteAudioElementsRef.current) as HTMLAudioElement[]).forEach((el) => {
      el.volume = effectiveVol;
    });
  }, [volume, isDeafened]);

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

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (_) {}
      mediaRecorderRef.current = null;
    }

    // Stop and close all peer connections
    Object.keys(peerConnectionsRef.current).forEach((userId) => {
      try {
        peerConnectionsRef.current[userId].close();
      } catch (_) {}
    });
    peerConnectionsRef.current = {};

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

    setIsVoiceConnected(false);
    setIsSimulated(false);
    setAudioLevel(0);
    setIsSpeaking(false);
    setActiveSpeakers([]);
  }, []);

  // WebRTC Peer Connection Helper
  const createPeerConnection = useCallback(
    (targetUserId: string) => {
      if (peerConnectionsRef.current[targetUserId]) {
        return peerConnectionsRef.current[targetUserId];
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[targetUserId] = pc;

      // Add local audio tracks if available
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('voice-ice-candidate', {
            toUserId: targetUserId,
            candidate: event.candidate,
          });
        }
      };

      // Handle remote incoming audio track
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (!remoteStream) return;

        let audioEl = remoteAudioElementsRef.current[targetUserId];
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.volume = isDeafened ? 0 : volume;
          document.body.appendChild(audioEl);
          remoteAudioElementsRef.current[targetUserId] = audioEl;
        }

        audioEl.srcObject = remoteStream;
        audioEl.play().catch((e) => {
          console.warn('Auto-play blocked, waiting for user interaction:', e);
        });

        // Track speaker state
        setActiveSpeakers((prev) => (prev.includes(targetUserId) ? prev : [...prev, targetUserId]));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          delete peerConnectionsRef.current[targetUserId];
          setActiveSpeakers((prev) => prev.filter((id) => id !== targetUserId));
        }
      };

      return pc;
    },
    [socket, isDeafened, volume]
  );

  // Initiate WebRTC offers to all existing peers in the room
  const initiatePeerConnections = useCallback(() => {
    if (!socket || !localStreamRef.current) return;

    Object.keys(users).forEach(async (targetUserId) => {
      if (targetUserId === currentUser.id) return;

      const pc = createPeerConnection(targetUserId);
      try {
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
    });
  }, [socket, currentUser.id, users, createPeerConnection]);

  // Setup MediaRecorder fallback relay
  const setupMediaRecorderRelay = useCallback(
    (stream: MediaStream) => {
      if (typeof MediaRecorder === 'undefined') return;

      try {
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/ogg;codecs=opus';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }

        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
          if (e.data && e.data.size > 0 && socket && !isMuted) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string)?.split(',')[1];
              if (base64) {
                socket.emit('voice-audio-chunk', {
                  chunk: base64,
                  mimeType: recorder.mimeType || 'audio/webm',
                });
              }
            };
            reader.readAsDataURL(e.data);
          }
        };

        recorder.start(250); // 250ms audio chunk slices
      } catch (err) {
        console.warn('MediaRecorder fallback setup failed:', err);
      }
    },
    [socket, isMuted]
  );

  // Start real microphone voice chat
  const startVoiceChat = useCallback(async () => {
    cleanupAll();
    setError(null);
    setIsIframeRestricted(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported by your browser.');
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

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
      setIsMuted(false);
      setIsSimulated(false);

      if (socket) {
        socket.emit('voice-status-update', {
          voiceConnected: true,
          isMuted: false,
          isDeafened,
        });
      }

      // Initiate WebRTC mesh connections
      initiatePeerConnections();

      // Setup WebSocket fallback recorder
      setupMediaRecorderRelay(stream);

      // Start dynamic audio analysis loop
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

        const speakingNow = normalized > 0.08 && !isMuted;
        setAudioLevel(normalized);
        setIsSpeaking(speakingNow);

        if (socket) {
          socket.emit('audio-level', {
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
      console.warn('Microphone activation failed:', err);
      const isDenied =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        err?.message?.toLowerCase().includes('permission');

      const inIframe = typeof window !== 'undefined' && window.self !== window.top;

      if (isDenied && inIframe) {
        setIsIframeRestricted(true);
        setError('Microphone permission is restricted inside the preview iframe. Open in a new tab or use Voice Simulation to test.');
      } else if (isDenied) {
        setError('Microphone permission was denied in your browser settings.');
      } else {
        setError(err?.message || 'Unable to access microphone.');
      }

      onNotification?.(
        isDenied
          ? 'Microphone blocked by browser or iframe. Click "Open in New Tab" or use Simulation mode.'
          : 'Could not activate microphone. Check browser permissions.',
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
    setupMediaRecorderRelay,
    isMuted,
    onNotification,
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

  // Toggle Mute (Mute local mic)
  const toggleMute = useCallback(() => {
    if (!isVoiceConnected) return;

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    // Disable audio tracks
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

  // Toggle Deafen (Mute incoming voices)
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
      onNotification?.('Voice Simulation stopped', 'info');
    } else {
      cleanupAll();
      setError(null);
      setIsSimulated(true);
      setIsVoiceConnected(true);

      const audioCtx = getOrCreateAudioContext();

      // Master Gain for pleasant volume
      const masterGain = audioCtx.createGain();
      masterGain.gain.value = isDeafened ? 0 : 0.15;
      masterGain.connect(audioCtx.destination);
      masterGainRef.current = masterGain;

      // Oscillator for gentle synthetic voice tone
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime); // Soft A3 pitch

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

        // Fluctuating vocal cadence
        const voiceCadence = (Math.sin(phase) + Math.sin(phase * 1.5) + 2) / 4;
        const isCurrentlyTalking = voiceCadence > 0.45;
        const currentLevel = isCurrentlyTalking ? voiceCadence * 0.85 : 0.02;

        setAudioLevel(currentLevel);
        setIsSpeaking(isCurrentlyTalking);

        // Modulate synth pitch and gain smoothly
        if (simGainRef.current && simOscillatorRef.current && audioCtx.state === 'running') {
          const targetGain = isCurrentlyTalking ? 0.2 : 0.01;
          simGainRef.current.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.05);
          simOscillatorRef.current.frequency.setTargetAtTime(
            220 + Math.sin(phase * 3) * 60,
            audioCtx.currentTime,
            0.05
          );
        }

        // Populate waveform data
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

  // Handle incoming Socket.io WebRTC signaling & Voice Chunks
  useEffect(() => {
    if (!socket) return;

    // Incoming WebRTC Offer
    const handleVoiceOffer = async (payload: { fromUserId: string; offer: any }) => {
      try {
        const pc = createPeerConnection(payload.fromUserId);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
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
        }
      } catch (err) {
        console.warn('Error handling incoming voice answer:', err);
      }
    };

    // Incoming ICE Candidate
    const handleVoiceIceCandidate = async (payload: { fromUserId: string; candidate: any }) => {
      try {
        const pc = peerConnectionsRef.current[payload.fromUserId];
        if (pc && payload.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (err) {
        console.warn('Error handling ICE candidate:', err);
      }
    };

    // Fallback Audio Chunk Relay from other users
    const handleVoiceAudioChunk = async (data: {
      userId: string;
      chunk: string;
      mimeType: string;
      timestamp: number;
    }) => {
      if (isDeafened) return;
      // If WebRTC is already streaming audio for this peer, skip fallback chunk to prevent echo
      if (peerConnectionsRef.current[data.userId]?.connectionState === 'connected') {
        return;
      }

      try {
        if (!remoteAudioContextRef.current || remoteAudioContextRef.current.state === 'closed') {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          remoteAudioContextRef.current = new AudioCtx();
        }
        const ctx = remoteAudioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const binary = atob(data.chunk);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        // Decode audio chunk buffer
        ctx.decodeAudioData(
          bytes.buffer.slice(0),
          (audioBuffer) => {
            const bufferSource = ctx.createBufferSource();
            bufferSource.buffer = audioBuffer;
            const gain = ctx.createGain();
            gain.gain.value = volume;
            bufferSource.connect(gain);
            gain.connect(ctx.destination);
            bufferSource.start();
          },
          () => {}
        );
      } catch (_) {}
    };

    socket.on('voice-offer', handleVoiceOffer);
    socket.on('voice-answer', handleVoiceAnswer);
    socket.on('voice-ice-candidate', handleVoiceIceCandidate);
    socket.on('voice-audio-chunk', handleVoiceAudioChunk);

    return () => {
      socket.off('voice-offer', handleVoiceOffer);
      socket.off('voice-answer', handleVoiceAnswer);
      socket.off('voice-ice-candidate', handleVoiceIceCandidate);
      socket.off('voice-audio-chunk', handleVoiceAudioChunk);
    };
  }, [socket, createPeerConnection, isDeafened, volume]);

  // Clean up when unmounting
  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

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
