import React from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Hand } from 'lucide-react';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isHandTool?: boolean;
  onToggleHand?: () => void;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isHandTool = false,
  onToggleHand,
}) => {
  const percentage = Math.round(zoom * 100);

  return (
    <div
      id="whiteboard-zoom-controls"
      className="fixed bottom-20 sm:bottom-6 left-3 sm:left-4 z-40 wb-surface-glass rounded-2xl p-1 sm:p-1.5 flex items-center gap-0.5 sm:gap-1 select-none pointer-events-auto transition-all text-slate-700 dark:text-slate-200 wb-bottom-chat-aware wb-bottom-zoom shadow-xl"
    >
      {/* Hand / Pan Toggle Button (Quick pan toggle for mobile) */}
      {onToggleHand && (
        <>
          <button
            type="button"
            aria-label={isHandTool ? 'Switch back to pen tool' : 'Switch to pan tool'}
            aria-pressed={isHandTool}
            onClick={onToggleHand}
            className={`p-2 sm:p-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] btn-press ${
              isHandTool
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold ring-1.5 ring-blue-500 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
            }`}
            title={isHandTool ? 'Switch back to Pen' : 'Pan / Move Whiteboard (Hand)'}
          >
            <Hand className="w-4 h-4" />
          </button>
          <div className="h-4 w-[1px] bg-slate-200/80 dark:bg-slate-800 mx-0.5" />
        </>
      )}

      {/* Zoom Out Button */}
      <button
        type="button"
        aria-label="Zoom out"
        onClick={onZoomOut}
        disabled={zoom <= 0.25}
        className="p-2 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] btn-press"
        title="Zoom out (-)"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Percentage / Reset Button */}
      <button
        type="button"
        aria-label={`Reset zoom to 100 percent, currently ${percentage} percent`}
        onClick={onResetZoom}
        className="px-2 py-1 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer min-w-[48px] text-center btn-press"
        title="Click to reset zoom to 100% and center view"
      >
        {percentage}%
      </button>

      {/* Zoom In Button */}
      <button
        type="button"
        aria-label="Zoom in"
        onClick={onZoomIn}
        disabled={zoom >= 3.0}
        className="p-2 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] btn-press"
        title="Zoom in (+)"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="h-4 w-[1px] bg-slate-200/80 dark:bg-slate-800 mx-0.5" />

      {/* Reset Pan / Center View */}
      <button
        type="button"
        aria-label="Recenter view"
        onClick={onResetZoom}
        className="p-2 sm:p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] btn-press"
        title="Reset view (Center canvas at 100%)"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
};
