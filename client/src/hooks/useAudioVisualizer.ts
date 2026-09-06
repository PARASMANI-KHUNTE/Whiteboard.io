import { useState, useEffect, useRef, useCallback } from 'react';

export function useAudioVisualizer() {
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const freqDataRef = useRef<Uint8Array>(new Uint8Array(64));
  const simIntervalRef = useRef<number | null>(null);

  const cleanupAudio = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAudioLevel(0);
    setIsSpeaking(false);
  }, []);

  const startMic = useCallback(async () => {
    cleanupAudio();
    setError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone not supported in this browser environment');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      setHasPermission(true);

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setIsMicActive(true);
      setIsSimulated(false);

      const updateAnalysis = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(freqDataRef.current);

        let sum = 0;
        const len = freqDataRef.current.length;
        for (let i = 0; i < len; i++) {
          sum += freqDataRef.current[i];
        }
        const avg = sum / (len * 255); // 0 to 1
        // Amplify response slightly for responsiveness
        const normalized = Math.min(1, avg * 2.5);

        setAudioLevel(normalized);
        setIsSpeaking(normalized > 0.08);

        animFrameRef.current = requestAnimationFrame(updateAnalysis);
      };

      updateAnalysis();
      return true;
    } catch (err: any) {
      console.warn('Microphone activation failed (using simulation fallback option):', err);
      setError(err?.message || 'Permission denied');
      setHasPermission(false);
      setIsMicActive(false);
      return false;
    }
  }, [cleanupAudio]);

  const stopMic = useCallback(() => {
    cleanupAudio();
    setIsMicActive(false);
    setIsSimulated(false);
  }, [cleanupAudio]);

  // Toggle simulated audio for testing without microphone or if blocked in iframe
  const toggleSimulated = useCallback(() => {
    if (isSimulated) {
      stopMic();
    } else {
      cleanupAudio();
      setIsSimulated(true);
      setIsMicActive(true);

      let phase = 0;
      simIntervalRef.current = window.setInterval(() => {
        phase += 0.2;
        // Generate a lively fluctuating wave pattern
        const baseLevel = (Math.sin(phase) + 1) / 2; // 0 to 1
        const noise = Math.random() * 0.3;
        const level = Math.min(1, Math.max(0.02, baseLevel * 0.7 + noise * 0.3));

        // Populate pseudo frequency data
        for (let i = 0; i < freqDataRef.current.length; i++) {
          const harmonic = Math.sin(phase * 2 + i * 0.3);
          freqDataRef.current[i] = Math.floor(level * 255 * (0.5 + 0.5 * harmonic));
        }

        setAudioLevel(level);
        setIsSpeaking(level > 0.15);
      }, 100);
    }
  }, [isSimulated, stopMic, cleanupAudio]);

  const toggleMic = useCallback(async () => {
    if (isMicActive) {
      stopMic();
    } else {
      const ok = await startMic();
      if (!ok) {
        // Fallback to simulated if real mic failed
        toggleSimulated();
      }
    }
  }, [isMicActive, startMic, stopMic, toggleSimulated]);

  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return {
    isMicActive,
    audioLevel,
    isSpeaking,
    frequencyData: freqDataRef.current,
    hasPermission,
    error,
    isSimulated,
    startMic,
    stopMic,
    toggleMic,
    toggleSimulated,
  };
}
