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
      className="fixed bottom-20 sm:bottom-6 left-3 sm:left-4 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 shadow-xl rounded-2xl p-1 sm:p-1.5 flex items-center gap-0.5 sm:gap-1 select-none pointer-events-auto transition-all text-slate-700 dark:text-slate-200"
    >
      {/* Hand / Pan Toggle Button (Quick pan toggle for mobile) */}
      {onToggleHand && (
        <>
          <button
            onClick={onToggleHand}
            className={`p-2 sm:p-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] ${
              isHandTool
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={isHandTool ? 'Switch back to Pen' : 'Pan / Move Whiteboard (Hand)'}
          >
            <Hand className="w-4 h-4" />
          </button>
          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5" />
        </>
      )}

      {/* Zoom Out Button */}
      <button
        onClick={onZoomOut}
        disabled={zoom <= 0.25}
        className="p-2 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px]"
        title="Zoom out (-)"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Percentage / Reset Button */}
      <button
        onClick={onResetZoom}
        className="px-2 py-1 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer min-w-[48px] text-center"
        title="Click to reset zoom to 100% and center view"
      >
        {percentage}%
      </button>

      {/* Zoom In Button */}
      <button
        onClick={onZoomIn}
        disabled={zoom >= 3.0}
        className="p-2 sm:p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px]"
        title="Zoom in (+)"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5" />

      {/* Reset Pan / Center View */}
      <button
        onClick={onResetZoom}
        className="p-2 sm:p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px]"
        title="Reset view (Center canvas at 100%)"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
};
