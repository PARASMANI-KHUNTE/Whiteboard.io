import React, { useEffect } from 'react';
import { AlertCircle, Eye, Mic, RefreshCw, Square, X } from 'lucide-react';
import type { VoiceRecordingMeta } from '../utils/voiceRecordings';
import { formatRecordingDate, formatRecordingDuration } from '../utils/voiceRecordings';

interface RecordingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string | null;
  recordings: VoiceRecordingMeta[];
  isLoading: boolean;
  error?: string | null;
  isRecording: boolean;
  recordingDurationMs: number;
  canRecord: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRefresh: () => void;
  onPlaySnapshot: (snapshotId: string) => void;
}

function formatRecordingSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Room-scoped voice recording library. Playback is inline; opening a linked
 * snapshot only previews the board state in version history, never restoring it.
 */
export const RecordingsPanel: React.FC<RecordingsPanelProps> = ({
  isOpen,
  onClose,
  roomId,
  recordings,
  isLoading,
  error,
  isRecording,
  recordingDurationMs,
  canRecord,
  onStartRecording,
  onStopRecording,
  onRefresh,
  onPlaySnapshot,
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

  const sortedRecordings = [...recordings].sort(
    (a, b) => b.startedAt - a.startedAt || b.createdAt - a.createdAt
  );

  return (
    <aside
      id="recordings-panel"
      aria-label="Voice recordings"
      className="fixed z-40 inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:top-20 sm:bottom-16 sm:w-[360px] flex flex-col max-h-[70vh] sm:max-h-none bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">Voice recordings</h3>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            {sortedRecordings.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh voice recordings"
            title="Refresh recordings"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice recordings"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="px-3 py-2.5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">Record this session</p>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              {isRecording
                ? `Recording · ${formatRecordingDuration(recordingDurationMs)}`
                : canRecord
                  ? 'Audio and a board snapshot are saved to the room.'
                  : 'Only the room host can record, with voice chat connected.'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onStartRecording}
              disabled={!canRecord || isRecording}
              aria-label="Start voice recording"
              title={
                canRecord
                  ? 'Start recording this voice session'
                  : 'Only the room host can record, with voice chat connected'
              }
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Mic className="w-3.5 h-3.5" aria-hidden />
              Start
            </button>
            <button
              type="button"
              onClick={onStopRecording}
              disabled={!isRecording}
              aria-label="Stop voice recording"
              title={isRecording ? 'Stop and save this recording to the room' : 'No recording in progress'}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Square className="w-3 h-3" aria-hidden />
              Stop{isRecording ? ` · ${formatRecordingDuration(recordingDurationMs)}` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500 animate-pulse">
            Loading recordings...
          </div>
        ) : error ? (
          <div
            role="alert"
            className="py-8 px-3 text-center text-xs text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl"
          >
            <AlertCircle className="w-4 h-4 mx-auto mb-1.5" aria-hidden />
            <p>{error}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-2 text-[11px] font-semibold underline underline-offset-2 cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : sortedRecordings.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
            No recordings yet. When someone records a voice session, it will appear here with its board state.
          </div>
        ) : (
          sortedRecordings.map((recording) => {
            const snapshotId = recording.snapshotId;
            return (
              <article
                key={recording.id}
                className="p-2.5 rounded-xl border bg-slate-50/90 dark:bg-slate-800/60 border-slate-200/70 dark:border-slate-700/70"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: recording.actor?.color || '#64748b' }}
                    aria-hidden
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {recording.actor?.name || 'Unknown'}
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                      {formatRecordingDate(recording.startedAt)} · {formatRecordingDuration(recording.durationMs)} ·{' '}
                      {formatRecordingSize(recording.sizeBytes)}
                    </p>
                  </div>
                  {snapshotId && (
                    <button
                      type="button"
                      onClick={() => onPlaySnapshot(snapshotId)}
                      aria-label={`View board at recording from ${formatRecordingDate(recording.startedAt)}`}
                      title="Preview the board as it was at the start of this recording"
                      className="flex items-center gap-1 shrink-0 px-1.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/60 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      <span>View board at recording</span>
                    </button>
                  )}
                </div>
                <audio
                  controls
                  preload="none"
                  src={recording.downloadUrl}
                  aria-label={`Voice recording by ${recording.actor?.name || 'an unknown collaborator'}`}
                  className="mt-2 w-full h-9"
                />
              </article>
            );
          })
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
        Recordings are saved to this room{roomId ? ` · ${roomId}` : ''}. Board previews are read-only.
      </div>
    </aside>
  );
};
