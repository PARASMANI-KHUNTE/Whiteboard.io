import React, { useEffect } from 'react';
import { Eye, History, RotateCcw, Undo2, Redo2, X } from 'lucide-react';
import type { AiRevisionDetail, AiRevisionMeta } from '../utils/aiRevisionHistory';
import { aiRevisionThumbShapes, describeAiRevisionElements } from '../utils/aiRevisionHistory';
import { relativeTime, shortTime } from '../utils/attributionColor';

interface AiRevisionHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  revisions: AiRevisionMeta[];
  selectedRevision: AiRevisionDetail | null;
  isLoading: boolean;
  isRestoring: boolean;
  canRestore: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onPreview: (revisionId: string) => void;
  onRestore: (revision: AiRevisionMeta) => void;
  onUndo: () => void;
  onRedo: () => void;
}

function RevisionThumbnail({ revision, large = false }: { revision: AiRevisionDetail; large?: boolean }) {
  const width = large ? 160 : 80;
  const height = large ? 96 : 48;
  const shapes = aiRevisionThumbShapes(revision.elements, width, height);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Preview of ${revision.prompt}`}
      className="shrink-0 rounded-md border border-slate-200/80 bg-white/90 dark:border-slate-700 dark:bg-slate-950/70"
    >
      {shapes.length === 0 ? (
        <text
          x={width / 2}
          y={height / 2 + 3}
          textAnchor="middle"
          className="fill-slate-400 text-[9px]"
        >
          Empty
        </text>
      ) : (
        shapes.map((shape, index) => (
          <rect
            key={`${revision.id}-thumb-${index}`}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={1.5}
            fill={shape.color}
            fillOpacity={0.85}
          />
        ))
      )}
    </svg>
  );
}

/**
 * Room-scoped AI revision timeline. Selecting a revision shows a schematic
 * thumbnail and element summary; restoring replaces only that AI session's
 * element group for everyone and preserves manual work on the rest of the board.
 */
export const AiRevisionHistoryPanel: React.FC<AiRevisionHistoryPanelProps> = ({
  isOpen,
  onClose,
  revisions,
  selectedRevision,
  isLoading,
  isRestoring,
  canRestore,
  canUndo,
  canRedo,
  onPreview,
  onRestore,
  onUndo,
  onRedo,
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
      id="ai-revision-history-panel"
      aria-label="AI diagram revision history"
      className="fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-16 sm:w-[380px] flex flex-col max-h-[70vh] sm:max-h-none bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <History className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">AI revisions</h3>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {revisions.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close AI revision history"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo last AI revision"
          title="Undo last AI revision"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" aria-hidden /> Undo AI
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo last AI revision"
          title="Redo last AI revision"
          className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Redo2 className="w-3.5 h-3.5" aria-hidden /> Redo AI
        </button>
      </div>

      {selectedRevision && (
        <div className="px-3 py-2.5 bg-blue-50/80 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/60 text-[11px] text-slate-700 dark:text-slate-200">
          <div className="flex gap-3">
            <RevisionThumbnail revision={selectedRevision} large />
            <div className="min-w-0">
              <p className="font-semibold truncate">{selectedRevision.prompt}</p>
              <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                {relativeTime(selectedRevision.timestamp)} ({shortTime(selectedRevision.timestamp)})
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                {selectedRevision.author?.name || 'Unknown'} · {selectedRevision.elementCount} element
                {selectedRevision.elementCount === 1 ? '' : 's'}
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1">
                {describeAiRevisionElements(selectedRevision.elements).map((label) => (
                  <li
                    key={label}
                    className="px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/70 border border-blue-100 dark:border-blue-900"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500 animate-pulse">
            Loading AI revisions...
          </div>
        ) : revisions.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
            No AI revisions yet. Generate or refine a diagram in a room to save one here.
          </div>
        ) : (
          revisions.map((revision) => {
            const isSelected = selectedRevision?.id === revision.id;
            return (
              <div
                key={revision.id}
                className={`p-2 rounded-xl border flex items-center gap-2.5 text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-50/90 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
                    : 'bg-slate-50/90 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/70'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: revision.author?.color || '#64748b' }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">
                    {revision.title || revision.prompt}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                    {relativeTime(revision.timestamp)} · {revision.elementCount} element
                    {revision.elementCount === 1 ? '' : 's'} · {revision.author?.name || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreview(revision.id)}
                    aria-label={`Preview AI revision from ${shortTime(revision.timestamp)}`}
                    title="Preview revision"
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
                    onClick={() => onRestore(revision)}
                    disabled={!canRestore || isRestoring}
                    aria-label={`Restore AI revision from ${shortTime(revision.timestamp)}`}
                    title={canRestore ? 'Restore this revision for everyone' : 'Only the host or an admin can restore a revision'}
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
        Restoring replaces only this AI diagram and preserves manual work outside it.
      </div>
    </aside>
  );
};
