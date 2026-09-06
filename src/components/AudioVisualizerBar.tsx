import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles, Activity } from 'lucide-react';

interface AudioVisualizerBarProps {
  isMicActive: boolean;
  audioLevel: number;
  isSpeaking: boolean;
  frequencyData: Uint8Array;
  isSimulated: boolean;
  onToggleMic: () => void;
  onToggleSimulated: () => void;
  onAudioLevelChange?: (level: number, isSpeaking: boolean) => void;
}

export const AudioVisualizerBar: React.FC<AudioVisualizerBarProps> = ({
  isMicActive,
  audioLevel,
  isSpeaking,
  frequencyData,
  isSimulated,
  onToggleMic,
  onToggleSimulated,
  onAudioLevelChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Broadcast audio level to room
  useEffect(() => {
    if (onAudioLevelChange) {
      onAudioLevelChange(audioLevel, isSpeaking);
    }
  }, [audioLevel, isSpeaking, onAudioLevelChange]);

  // Render wave animation on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const numBars = 24;
      const barSpacing = 3;
      const barWidth = Math.max(2, (width - (numBars - 1) * barSpacing) / numBars);

      if (!isMicActive) {
        // Idle flat bars
        ctx.fillStyle = '#cbd5e1';
        for (let i = 0; i < numBars; i++) {
          const x = i * (barWidth + barSpacing);
          const barHeight = 4;
          const y = (height - barHeight) / 2;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
        return;
      }

      // Active frequency bars
      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + barSpacing);
        // Sample frequency data proportionally
        const freqIndex = Math.min(frequencyData.length - 1, Math.floor((i / numBars) * frequencyData.length));
        const val = frequencyData[freqIndex] || 0;
        const normalized = val / 255;

        // Dynamic height with minimum baseline
        const barHeight = Math.max(3, normalized * height * 0.9);
        const y = height - barHeight;

        // Clean blue spectrum
        if (isSpeaking) {
          ctx.fillStyle = i % 3 === 0 ? '#2563eb' : i % 2 === 0 ? '#3b82f6' : '#60a5fa';
        } else {
          ctx.fillStyle = '#94a3b8';
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isMicActive, isSpeaking, frequencyData]);

  return (
    <div
      id="audio-wave-visualizer-container"
      className={`flex items-center gap-3 px-4 py-1.5 rounded-full border transition-all shadow-xs ${
        isSpeaking
          ? 'bg-white border-blue-400 ring-2 ring-blue-100'
          : isMicActive
          ? 'bg-white border-slate-300'
          : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            isSpeaking
              ? 'bg-rose-500 animate-pulse'
              : isMicActive
              ? 'bg-blue-600'
              : 'bg-slate-300'
          }`}
        />
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">
          {isSpeaking ? 'Speaking' : isMicActive ? (isSimulated ? 'Simulated' : 'Live Audio') : 'Audio Off'}
        </span>
      </div>

      <canvas ref={canvasRef} width={80} height={18} className="block" />

      <div className="flex items-center gap-1 border-l border-slate-100 pl-2">
        <button
          id="toggle-mic-btn"
          onClick={onToggleMic}
          title={isMicActive ? 'Turn off microphone' : 'Turn on audio wave visualizer (Microphone)'}
          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
            isSpeaking
              ? 'bg-blue-50 text-blue-600'
              : isMicActive
              ? 'bg-slate-100 text-slate-700'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          }`}
        >
          {isMicActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
        </button>

        <button
          id="toggle-simulated-audio-btn"
          onClick={onToggleSimulated}
          title={isSimulated ? 'Stop simulation' : 'Test with simulated audio signal (No mic required)'}
          className={`p-1.5 rounded-md text-[10px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
            isSimulated
              ? 'bg-blue-50 text-blue-600'
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span className="hidden md:inline">{isSimulated ? 'Stop' : 'Test'}</span>
        </button>
      </div>
    </div>
  );
};
