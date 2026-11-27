import React, { useEffect } from 'react';
import { Clock, Eye, RotateCcw, X } from 'lucide-react';
import type { BoardSnapshotDetail, BoardSnapshotMeta } from '../utils/boardSnapshots';
import { describeSnapshotElements } from '../utils/boardSnapshots';
import { relativeTime, shortTime } from '../utils/attributionColor';

interface VersionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: BoardSnapshotMeta[];
  selectedSnapshot: BoardSnapshotDetail | null;
  isLoading: boolean;
  isRestoring: boolean;
  canRestore: boolean;
  onPreview: (snapshotId: string) => void;
  onRestore: (snapshot: BoardSnapshotMeta) => void;
}

/**
 * Version selector for durable board snapshots. Selecting a version shows a
 * textual preview; restoring is destructive and always goes through an explicit
 * confirmation in App.tsx.
 */
export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  isOpen,
  onClose,
  snapshots,
  selectedSnapshot,
  isLoading,
  isRestoring,
  canRestore,
  onPreview,
  onRestore,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <aside
      id="version-history-panel"
      aria-label="Board version history"
      className="fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-16 sm:w-[360px] flex flex-col max-h-[70vh] sm:max-h-none bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">Version history</h3>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {snapshots.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close version history"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      {selectedSnapshot && (
        <div className="px-3 py-2.5 bg-blue-50/80 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/60 text-[11px] text-slate-700 dark:text-slate-200">
          <p className="font-semibold">
            Preview · {relativeTime(selectedSnapshot.timestamp)} ({shortTime(selectedSnapshot.timestamp)})
          </p>
          <p className="mt-0.5 text-slate-600 dark:text-slate-300">
            {selectedSnapshot.actor?.name || 'Unknown'}{' '}
            {selectedSnapshot.eventCount ? `· after ${selectedSnapshot.eventCount} changes` : ''}
          </p>
          {describeSnapshotElements(selectedSnapshot).length > 0 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {describeSnapshotElements(selectedSnapshot).map((label) => (
                <li
                  key={label}
                  className="px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/70 border border-blue-100 dark:border-blue-900"
                >
                  {label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-slate-500 dark:text-slate-400">This version has no elements.</p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500 animate-pulse">
            Loading versions...
          </div>
        ) : snapshots.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
            No saved versions yet. Versions are created automatically as the board changes.
          </div>
        ) : (
          snapshots.map((snapshot) => {
            const isSelected = selectedSnapshot?.id === snapshot.id;
            return (
              <div
                key={snapshot.id}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
                    : 'bg-slate-50/90 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/70'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                  style={{ backgroundColor: snapshot.actor?.color || '#64748b' }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    {relativeTime(snapshot.timestamp)} · {shortTime(snapshot.timestamp)}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                    {snapshot.actor?.name || 'Unknown'} · {snapshot.elementCount} element
                    {snapshot.elementCount === 1 ? '' : 's'} · after {snapshot.eventCount} change
                    {snapshot.eventCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreview(snapshot.id)}
                    aria-label={`Preview version from ${shortTime(snapshot.timestamp)}`}
                    title="Preview version"
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isSelected
                        ? 'text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/60'
                        : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestore(snapshot)}
                    disabled={!canRestore || isRestoring}
                    aria-label={`Restore version from ${shortTime(snapshot.timestamp)}`}
                    title={canRestore ? 'Restore this version for everyone' : 'Only the host can restore a version'}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
        Restoring replaces the board for everyone and is recorded in the activity timeline.
      </div>
    </aside>
  );
};
