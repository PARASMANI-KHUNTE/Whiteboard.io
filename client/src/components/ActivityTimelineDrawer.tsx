import React, { useEffect } from 'react';
import { History, LocateFixed, X } from 'lucide-react';
import type { ActivityEntry } from '../utils/activityFeed';
import { relativeTime, shortTime } from '../utils/attributionColor';
import type { CanvasElement } from '../types';

interface ActivityTimelineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ActivityEntry[];
  elements: Record<string, CanvasElement>;
  onFocusElement: (elementId: string) => void;
}

/**
 * Chronological activity and attribution feed showing who created, edited,
 * deleted, or cleared canvas content, with click-to-focus navigation.
 */
export const ActivityTimelineDrawer: React.FC<ActivityTimelineDrawerProps> = ({
  isOpen,
  onClose,
  entries,
  elements,
  onFocusElement,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <aside
      id="activity-timeline-drawer"
      aria-label="Room activity timeline"
      className="fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-16 sm:w-[340px] flex flex-col max-h-[60vh] sm:max-h-none bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <History className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
            Activity Timeline
          </h3>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {entries.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close activity timeline"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {entries.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
            No canvas activity recorded yet. Start sketching or adding notes!
          </div>
        ) : (
          entries.map((entry) => {
            const canFocus = Boolean(entry.elementId && elements[entry.elementId]);
            return (
              <div
                key={entry.id}
                className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex items-start gap-2.5 text-xs"
              >
                <span
                  style={{ backgroundColor: entry.userColor }}
                  className="w-2.5 h-2.5 rounded-full mt-1 shrink-0 shadow-xs"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {entry.userName}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {relativeTime(entry.timestamp)} · {shortTime(entry.timestamp)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                    {entry.summary}
                  </p>
                </div>
                {canFocus && entry.elementId && (
                  <button
                    type="button"
                    onClick={() => onFocusElement(entry.elementId!)}
                    title="Focus element on canvas"
                    aria-label={`Focus element: ${entry.summary}`}
                    className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer shrink-0"
                  >
                    <LocateFixed className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
