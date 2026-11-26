import React from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Map } from 'lucide-react';
import { getHandToggleMeta } from './ui/toolActions';
import type { WhiteboardHandToggleAction } from '../hooks/useWhiteboardActions';

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitToContent?: () => void;
  isMinimapOpen?: boolean;
  onToggleMinimap?: () => void;
  isHandTool?: boolean;
  canWrite?: boolean;
  onToggleHand?: () => void;
  handToggle?: WhiteboardHandToggleAction;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitToContent,
  isMinimapOpen = false,
  onToggleMinimap,
  isHandTool = false,
  canWrite = true,
  onToggleHand,
  handToggle,
}) => {
  const percentage = Math.round(zoom * 100);
  const fallbackMeta = getHandToggleMeta(isHandTool, canWrite);
  const handHandler = handToggle?.handler ?? onToggleHand;
  const handActive = handToggle?.active ?? isHandTool;
  const handAriaLabel = handToggle?.ariaLabel ?? fallbackMeta.ariaLabel;
  const handTitle = handToggle?.title ?? fallbackMeta.title;
  const HandIcon = handToggle?.icon ?? fallbackMeta.Icon;
  const handButtonId = handToggle?.id ?? 'zoom-hand-toggle-btn';

  return (
    <div
      id="whiteboard-zoom-controls"
      className="fixed bottom-4 sm:bottom-6 left-3 sm:left-4 z-40 wb-surface-glass rounded-2xl p-1 sm:p-1.5 flex items-center gap-0.5 sm:gap-1 select-none pointer-events-auto transition-all text-slate-700 dark:text-slate-200 wb-bottom-chat-aware wb-bottom-zoom shadow-xl"
    >
      {/* Hand / Pan Toggle Button (sourced from shared tool registry) */}
      {handHandler && (
        <>
          <button
            id={handButtonId}
            type="button"
            aria-label={handAriaLabel}
            aria-pressed={handActive}
            onClick={handHandler}
            className={`p-2 sm:p-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] btn-press ${
              handActive
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold ring-1.5 ring-blue-500 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
            }`}
            title={handTitle}
          >
            <HandIcon className="w-4 h-4" />
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

      {/* Live Zoom Readout */}
      <span
        aria-live="polite"
        aria-label={`Zoom ${percentage} percent`}
        className="px-1.5 py-1 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 min-w-[44px] text-center tabular-nums"
      >
        {percentage}%
      </span>

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

      {/* Single Authoritative Reset View Button */}
      <button
        id="reset-view-btn"
        type="button"
        aria-label="Reset view"
        onClick={onResetZoom}
        className="p-2 sm:p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] btn-press"
        title="Reset view (0) — Center canvas at 100%"
      >
        <RotateCcw className="w-4 h-4" />
      </button>

      {onFitToContent && (
        <button
          id="fit-all-btn"
          type="button"
          aria-label="Fit all elements to screen"
          onClick={onFitToContent}
          className="p-2 sm:p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] btn-press"
          title="Fit all content to screen (Shift+1)"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      )}

      {onToggleMinimap && (
        <button
          id="toggle-minimap-btn"
          type="button"
          aria-label={isMinimapOpen ? 'Hide minimap' : 'Show minimap'}
          aria-pressed={isMinimapOpen}
          onClick={onToggleMinimap}
          className={`hidden sm:flex p-2 rounded-xl transition-colors cursor-pointer items-center justify-center min-w-[32px] min-h-[32px] btn-press ${
            isMinimapOpen
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/40'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
          }`}
          title={isMinimapOpen ? 'Hide canvas minimap' : 'Show canvas minimap'}
        >
          <Map className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
