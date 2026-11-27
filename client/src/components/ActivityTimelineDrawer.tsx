import React, { useEffect, useState, useMemo } from 'react';
import { History, LocateFixed, X, Filter } from 'lucide-react';
import type { ActivityEntry, ActivityActionKind } from '../utils/activityFeed';
import { relativeTime, shortTime } from '../utils/attributionColor';
import type { CanvasElement } from '../types';

interface ActivityTimelineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ActivityEntry[];
  elements: Record<string, CanvasElement>;
  onFocusElement: (elementId: string) => void;
  isLoading?: boolean;
}

/**
 * Chronological activity and attribution feed showing who created, edited,
 * deleted, or cleared canvas content, with action/user filtering and click-to-focus navigation.
 */
export const ActivityTimelineDrawer: React.FC<ActivityTimelineDrawerProps> = ({
  isOpen,
  onClose,
  entries,
  elements,
  onFocusElement,
  isLoading = false,
}) => {
  const [actionFilter, setActionFilter] = useState<'all' | ActivityActionKind>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const uniqueUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>();
    for (const entry of entries) {
      if (entry.userId && !map.has(entry.userId)) {
        map.set(entry.userId, {
          id: entry.userId,
          name: entry.userName,
          color: entry.userColor,
        });
      }
    }
    return Array.from(map.values());
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (actionFilter !== 'all' && entry.action !== actionFilter) {
        return false;
      }
      if (userFilter !== 'all' && entry.userId !== userFilter) {
        return false;
      }
      return true;
    });
  }, [entries, actionFilter, userFilter]);

  if (!isOpen) return null;

  return (
    <aside
      id="activity-timeline-drawer"
      aria-label="Room activity timeline"
      className="fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-16 sm:w-[360px] flex flex-col max-h-[70vh] sm:max-h-none bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <History className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
            Activity Timeline
          </h3>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {filteredEntries.length}
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

      {/* Filter Controls */}
      <div className="px-3 py-2 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 flex flex-col gap-2 text-xs">
        {/* Action Type Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5" role="tablist" aria-label="Filter by action">
          {(['all', 'created', 'edited', 'deleted', 'cleared'] as const).map((kind) => {
            const isActive = actionFilter === kind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActionFilter(kind)}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium capitalize shrink-0 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                }`}
              >
                {kind}
              </button>
            );
          })}
        </div>

        {/* User Filter Dropdown */}
        {uniqueUsers.length > 1 && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400">
            <Filter className="w-3 h-3 shrink-0" aria-hidden />
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              aria-label="Filter by user"
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer flex-1"
            >
              <option value="all">All contributors ({uniqueUsers.length})</option>
              {uniqueUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Entries List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500 animate-pulse">
            Loading activity history...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 dark:text-slate-500">
            {entries.length === 0
              ? 'No canvas activity recorded yet. Start sketching or adding notes!'
              : 'No activity matches the selected filter.'}
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const isDeleted = entry.action === 'deleted' || Boolean(entry.elementId && !elements[entry.elementId]);
            const canFocus = Boolean(entry.elementId && elements[entry.elementId]);

            return (
              <div
                key={entry.id}
                className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 flex items-start gap-2.5 text-xs transition-colors hover:border-slate-300 dark:hover:border-slate-600"
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

                {/* Status action or indicator */}
                {entry.action === 'cleared' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 shrink-0">
                    Cleared
                  </span>
                ) : isDeleted ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400 shrink-0">
                    Deleted
                  </span>
                ) : canFocus && entry.elementId ? (
                  <button
                    type="button"
                    onClick={() => onFocusElement(entry.elementId!)}
                    title="Focus element on canvas"
                    aria-label={`Focus element: ${entry.summary}`}
                    className="p-1.5 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer shrink-0"
                  >
                    <LocateFixed className="w-3.5 h-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
