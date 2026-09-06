import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  PhoneOff,
  ExternalLink,
  AlertCircle,
  Headphones,
} from 'lucide-react';

interface AudioVisualizerBarProps {
  isVoiceConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  volume: number;
  onSetVolume?: (v: number) => void;
  audioLevel: number;
  isSpeaking: boolean;
  frequencyData: Uint8Array;
  isSimulated: boolean;
  error: string | null;
  isIframeRestricted: boolean;
  activeSpeakers?: string[];
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleSimulated: () => void;
  onOpenInNewTab: () => void;
  onAudioLevelChange?: (level: number, isSpeaking: boolean) => void;
}

export const AudioVisualizerBar: React.FC<AudioVisualizerBarProps> = ({
  isVoiceConnected,
  isMuted,
  isDeafened,
  volume,
  onSetVolume,
  audioLevel,
  isSpeaking,
  frequencyData,
  isSimulated,
  error,
  isIframeRestricted,
  activeSpeakers = [],
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
  onToggleSimulated,
  onOpenInNewTab,
  onAudioLevelChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Broadcast audio level to room
  useEffect(() => {
    if (onAudioLevelChange) {
      onAudioLevelChange(audioLevel, isSpeaking);
    }
  }, [audioLevel, isSpeaking, onAudioLevelChange]);

  // If an error occurs, show error details
  useEffect(() => {
    if (error) {
      setShowErrorModal(true);
    }
  }, [error]);

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

      const numBars = 20;
      const barSpacing = 2.5;
      const barWidth = Math.max(2, (width - (numBars - 1) * barSpacing) / numBars);

      if (!isVoiceConnected || isMuted) {
        // Idle flat bars
        ctx.fillStyle = '#e2e8f0';
        for (let i = 0; i < numBars; i++) {
          const x = i * (barWidth + barSpacing);
          const barHeight = 3;
          const y = (height - barHeight) / 2;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 1.5);
          ctx.fill();
        }
        return;
      }

      // Active frequency bars
      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + barSpacing);
        const freqIndex = Math.min(
          frequencyData.length - 1,
          Math.floor((i / numBars) * frequencyData.length)
        );
        const val = frequencyData[freqIndex] || 0;
        const normalized = val / 255;

        const barHeight = Math.max(3, normalized * height * 0.9);
        const y = height - barHeight;

        if (isSpeaking) {
          ctx.fillStyle = i % 3 === 0 ? '#2563eb' : i % 2 === 0 ? '#3b82f6' : '#60a5fa';
        } else {
          ctx.fillStyle = '#94a3b8';
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1.5);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isVoiceConnected, isMuted, isSpeaking, frequencyData]);

  return (
    <div className="relative flex items-center">
      <div
        id="voice-chat-visualizer-container"
        className={`flex items-center gap-2.5 px-3 py-1 rounded-full border transition-all select-none shadow-xs ${
          isSpeaking
            ? 'bg-white border-blue-400 ring-2 ring-blue-100'
            : isVoiceConnected
            ? isMuted
              ? 'bg-amber-50/70 border-amber-200'
              : 'bg-white border-slate-300'
            : 'bg-white border-slate-200'
        }`}
      >
        {/* Status Indicator Dot & Label */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${
              isSpeaking
                ? 'bg-rose-500 animate-pulse'
                : isVoiceConnected
                ? isMuted
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
                : 'bg-slate-300'
            }`}
          />
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider hidden lg:inline">
            {isSpeaking
              ? 'Speaking'
              : isVoiceConnected
              ? isMuted
                ? 'Mic Muted'
                : isDeafened
                ? 'Deafened'
                : isSimulated
                ? 'Simulated Voice'
                : 'Voice Live'
              : 'Voice Chat'}
          </span>
        </div>

        {/* Live Audio Spectrum Canvas */}
        <canvas ref={canvasRef} width={52} height={14} className="hidden sm:block opacity-90" />

        {/* Voice Controls Divider */}
        <div className="flex items-center gap-1 border-l border-slate-100 pl-1.5 sm:pl-2">
          {!isVoiceConnected ? (
            <>
              {/* Connect Voice Button */}
              <button
                id="join-voice-btn"
                onClick={onJoinVoice}
                title="Connect to Real-time Voice Chat"
                className="px-2 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Mic className="w-3 h-3" />
                <span className="hidden xs:inline">Join Voice</span>
                <span className="xs:hidden">Voice</span>
              </button>

              {/* Simulation Demo Button */}
              <button
                id="toggle-simulated-voice-btn"
                onClick={onToggleSimulated}
                title="Test with simulated audio harmonics (No mic needed)"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-medium hidden sm:inline">Simulate</span>
              </button>
            </>
          ) : (
            <>
              {/* Mute / Unmute Button */}
              <button
                id="toggle-mic-mute-btn"
                onClick={onToggleMute}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  isMuted
                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>

              {/* Deafen / Undeafen Button */}
              <button
                id="toggle-deafen-btn"
                onClick={onToggleDeafen}
                title={isDeafened ? 'Undeafen (unmute voices)' : 'Deafen (mute voices)'}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  isDeafened
                    ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {isDeafened ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              {/* Disconnect Voice */}
              <button
                id="leave-voice-btn"
                onClick={onLeaveVoice}
                title="Disconnect from voice chat"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Error / Diagnostic Icon */}
          {error && (
            <button
              id="voice-error-indicator-btn"
              onClick={() => setShowErrorModal(true)}
              title={error}
              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer animate-bounce"
            >
              <AlertCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Permission / Iframe Error Diagnostic Modal */}
      {showErrorModal && (
        <div
          id="voice-troubleshoot-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 text-slate-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Voice Chat Setup</h3>
                <p className="text-xs text-slate-500">Microphone permission notice</p>
              </div>
            </div>

            <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 leading-relaxed">
              {isIframeRestricted ? (
                <>
                  <p className="font-semibold text-slate-800 mb-1">
                    Running inside an embedded preview iframe:
                  </p>
                  <p>
                    Browsers often restrict microphone hardware access inside preview frames for security.
                    To use voice chat with your live microphone, open the whiteboard in its own browser tab!
                  </p>
                </>
              ) : (
                <p>{error || 'Microphone access is not available in current browser settings.'}</p>
              )}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                id="voice-open-new-tab-btn"
                onClick={() => {
                  onOpenInNewTab();
                  setShowErrorModal(false);
                }}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in New Tab (Enable Mic)</span>
              </button>

              <button
                id="voice-use-sim-btn"
                onClick={() => {
                  setShowErrorModal(false);
                  onToggleSimulated();
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Test Simulation</span>
              </button>

              <button
                onClick={() => setShowErrorModal(false)}
                className="w-full sm:w-auto px-3 py-2.5 text-slate-500 hover:text-slate-800 text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
