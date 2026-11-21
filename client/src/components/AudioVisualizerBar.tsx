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
import { useModalA11y } from '../hooks/useModalA11y';

interface AudioVisualizerBarProps {
  roomId?: string | null;
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
  onClearError: () => void;
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
  isSpeaking,
  frequencyData,
  isSimulated,
  error,
  onClearError,
  isIframeRestricted,
  activeSpeakers = [],
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onToggleDeafen,
  onToggleSimulated,
  onOpenInNewTab,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const volumePopoverRef = useRef<HTMLDivElement | null>(null);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const voiceErrorDialogRef = useRef<HTMLDivElement>(null);
  const closeVoiceErrorModal = () => {
    setShowErrorModal(false);
    onClearError();
  };
  useModalA11y({
    isOpen: showErrorModal,
    onClose: closeVoiceErrorModal,
    dialogRef: voiceErrorDialogRef,
  });

  // If an error occurs, show error details
  useEffect(() => {
    if (error) {
      setShowErrorModal(true);
    }
  }, [error]);

  // Close the volume popover with Escape or an outside click.
  useEffect(() => {
    if (!showVolumeSlider) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowVolumeSlider(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!volumePopoverRef.current?.contains(event.target as Node)) {
        setShowVolumeSlider(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showVolumeSlider]);

  useEffect(() => {
    if (!showErrorModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowErrorModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showErrorModal]);

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
            ? 'bg-white dark:bg-slate-900 border-blue-400 ring-2 ring-blue-100 dark:ring-blue-950'
            : isVoiceConnected
            ? isMuted
              ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/70'
              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
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
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:inline">
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
            {activeSpeakers.length > 0 && (
              <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400 font-semibold lowercase">
                ({activeSpeakers.length})
              </span>
            )}
          </span>
        </div>

        {/* Live Audio Spectrum Canvas */}
        <canvas ref={canvasRef} width={52} height={14} className="hidden sm:block opacity-90" />

        {/* Voice Controls Divider */}
        <div className="flex items-center gap-1 border-l border-slate-100 dark:border-slate-800 pl-1.5 sm:pl-2">
          {!isVoiceConnected ? (
            <>
              {/* Connect Voice Button */}
              <button
                type="button"
                id="join-voice-btn"
                onClick={onJoinVoice}
                aria-label="Join real-time voice chat"
                title="Connect to Real-time Voice Chat"
                className="px-2 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Mic className="w-3 h-3" />
                <span className="hidden xs:inline">Join Voice</span>
                <span className="xs:hidden">Voice</span>
              </button>

              {/* Simulation Demo Button */}
              <button
                type="button"
                id="toggle-simulated-voice-btn"
                aria-pressed={isSimulated}
                onClick={onToggleSimulated}
                title="Test with simulated audio harmonics (No mic needed)"
                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-medium hidden sm:inline">Simulate</span>
              </button>
            </>
          ) : (
            <>
              {/* Mute / Unmute Button */}
              <button
                type="button"
                id="toggle-mic-mute-btn"
                aria-pressed={isMuted}
                aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                onClick={onToggleMute}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  isMuted
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-950'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              </button>

              {/* Deafen / Undeafen Button */}
              <button
                type="button"
                id="toggle-deafen-btn"
                aria-pressed={isDeafened}
                aria-label={isDeafened ? 'Undeafen (unmute voices)' : 'Deafen (mute voices)'}
                onClick={onToggleDeafen}
                title={isDeafened ? 'Undeafen (unmute voices)' : 'Deafen (mute voices)'}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  isDeafened
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-950'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isDeafened ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              {/* Volume Slider Popover */}
              <div ref={volumePopoverRef} className="relative flex items-center">
                <button
                  type="button"
                  id="toggle-volume-slider-btn"
                  aria-label={`Voice volume ${Math.round(volume * 100)}%`}
                  aria-haspopup="true"
                  aria-expanded={showVolumeSlider}
                  aria-controls="voice-volume-popover"
                  title={`Voice Volume (${Math.round(volume * 100)}%)`}
                  onClick={() => setShowVolumeSlider((prev) => !prev)}
                  className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                    showVolumeSlider
                      ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Headphones className="w-3.5 h-3.5" />
                </button>

                {showVolumeSlider && (
                  <div
                    id="voice-volume-popover"
                    role="group"
                    aria-label="Voice volume"
                    className="absolute top-full right-0 mt-2 p-2.5 bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 flex items-center gap-2 min-w-[150px]"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      aria-label="Voice volume level"
                      onChange={(e) => onSetVolume?.(parseFloat(e.target.value))}
                      className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 min-w-[28px]">
                      {Math.round(volume * 100)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Disconnect Voice */}
              <button
                type="button"
                id="leave-voice-btn"
                onClick={onLeaveVoice}
                aria-label="Disconnect from voice chat"
                title="Disconnect from voice chat"
                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-colors cursor-pointer"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {/* Error / Diagnostic Icon */}
          {error && (
            <button
              type="button"
              id="voice-error-indicator-btn"
              onClick={() => setShowErrorModal(true)}
              aria-label="Voice chat setup error: view details"
              title={error}
              className="p-1 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md cursor-pointer animate-bounce"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs p-4"
        >
          <div
            ref={voiceErrorDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="voice-error-title"
            aria-describedby="voice-error-description"
            tabIndex={-1}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 text-slate-800 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 id="voice-error-title" className="text-base font-bold text-slate-900 dark:text-white">Voice Chat Setup</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Microphone permission notice</p>
              </div>
            </div>

            <div id="voice-error-description" className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {isIframeRestricted ? (
                <>
                  <p className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
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
                type="button"
                id="voice-open-new-tab-btn"
                onClick={() => {
                  onOpenInNewTab();
                  closeVoiceErrorModal();
                }}
                className="w-full sm:w-auto flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-sm"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in New Tab (Enable Mic)</span>
              </button>

              <button
                type="button"
                id="voice-use-sim-btn"
                onClick={() => {
                  closeVoiceErrorModal();
                  onToggleSimulated();
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Test Simulation</span>
              </button>

              <button
                type="button"
                onClick={closeVoiceErrorModal}
                className="w-full sm:w-auto px-3 py-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 text-xs font-medium cursor-pointer"
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
