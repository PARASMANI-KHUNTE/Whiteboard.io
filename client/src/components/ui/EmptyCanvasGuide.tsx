import React from 'react';
import { Pencil, Sparkles, StickyNote, X } from 'lucide-react';

interface EmptyCanvasGuideProps {
  visible: boolean;
  isSoloMode: boolean;
  onStartDrawing: () => void;
  onAddSticky: () => void;
  onOpenAiDiagram: () => void;
  onDismiss: () => void;
}

/**
 * Non-blocking zero-state onboarding card shown on an empty board so new
 * desktop and mobile users have clear quick-start entry points while still
 * being able to draw immediately anywhere on the canvas.
 */
export const EmptyCanvasGuide: React.FC<EmptyCanvasGuideProps> = ({
  visible,
  isSoloMode,
  onStartDrawing,
  onAddSticky,
  onOpenAiDiagram,
  onDismiss,
}) => {
  if (!visible) return null;

  return (
    <div
      id="empty-canvas-guide"
      className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-20 flex justify-center px-4 pointer-events-none select-none wb-canvas-centered"
    >
      <div className="pointer-events-auto relative max-w-md w-full wb-card-glass rounded-2xl p-4 sm:p-5 text-center animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss quick-start guide"
          className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <p className="text-sm font-bold text-slate-900 dark:text-white">
          Blank Canvas Ready
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {isSoloMode
            ? 'Draw freely anywhere — your work autosaves offline and can go live anytime.'
            : 'Draw together in real time, drop sticky notes, or generate an AI diagram.'}
        </p>

        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
          <button
            id="empty-guide-pen-btn"
            type="button"
            onClick={onStartDrawing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden />
            <span>Start Sketching</span>
          </button>

          <button
            id="empty-guide-sticky-btn"
            type="button"
            onClick={onAddSticky}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100/90 dark:bg-amber-950/60 hover:bg-amber-200/90 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/70 text-xs font-semibold transition-colors cursor-pointer"
          >
            <StickyNote className="w-3.5 h-3.5" aria-hidden />
            <span>Sticky Note</span>
          </button>

          <button
            id="empty-guide-ai-btn"
            type="button"
            onClick={onOpenAiDiagram}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/70 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            <span>AI Diagram</span>
          </button>
        </div>
      </div>
    </div>
  );
};
