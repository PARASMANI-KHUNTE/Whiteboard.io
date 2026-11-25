import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import {
  WELCOME_HINT_DURATION_MS,
  createPausableTimer,
  pausePausableTimer,
  resumePausableTimer,
  startPausableTimer,
  type PausableTimerState,
} from '../utils/pausableTimer';

export interface WelcomeHintToastProps {
  isOpen: boolean;
  durationMs?: number;
  onDismiss: () => void;
}

/**
 * Brief onboarding toast shown beside the workspace controls. Automatically
 * dismisses after `durationMs` (default 8s) and pauses while hovered or focused.
 */
export const WelcomeHintToast: React.FC<WelcomeHintToastProps> = ({
  isOpen,
  durationMs = WELCOME_HINT_DURATION_MS,
  onDismiss,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const timerStateRef = useRef<PausableTimerState>(createPausableTimer(durationMs));
  const timeoutRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  // Reset countdown whenever the toast opens cleanly or duration changes.
  useEffect(() => {
    if (!isOpen) {
      clearTimer();
      timerStateRef.current = createPausableTimer(durationMs);
      setIsHovered(false);
      setIsFocused(false);
      return;
    }
    timerStateRef.current = createPausableTimer(durationMs);
  }, [isOpen, durationMs]);

  const isPaused = isHovered || isFocused;

  useEffect(() => {
    clearTimer();
    if (!isOpen) return;

    const now = Date.now();
    if (isPaused) {
      timerStateRef.current = pausePausableTimer(timerStateRef.current, now);
      return;
    }

    timerStateRef.current = timerStateRef.current.paused
      ? resumePausableTimer(timerStateRef.current, now)
      : startPausableTimer(timerStateRef.current, now);

    const remaining = timerStateRef.current.remainingMs;
    if (remaining <= 0) {
      onDismissRef.current();
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      onDismissRef.current();
    }, remaining);

    return clearTimer;
  }, [isOpen, isPaused]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      id="welcome-hint-pill"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
          setIsFocused(false);
        }
      }}
      className="hidden sm:block fixed top-20 left-6 z-30 overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl p-4 pb-4.5 max-w-xs text-xs text-slate-700 dark:text-slate-200 animate-in fade-in duration-300 select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>Real-time Whiteboard</span>
        </div>
        <button
          type="button"
          aria-label="Dismiss welcome hint"
          onClick={onDismiss}
          className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-bold cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="mt-1.5 text-slate-500 dark:text-slate-400 leading-relaxed">
        Click <strong className="text-slate-700 dark:text-slate-200 font-semibold">Share</strong> to invite friends via room code or link. Room creators can manage participants and toggle write permissions.
      </p>

      {/* Visual countdown bar — pauses cleanly on hover */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100 dark:bg-slate-800"
      >
        <div
          className="h-full w-full bg-gradient-to-r from-blue-500 to-indigo-500 wb-countdown-bar"
          style={{
            animationDuration: `${durationMs}ms`,
            animationPlayState: isPaused ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  );
};
