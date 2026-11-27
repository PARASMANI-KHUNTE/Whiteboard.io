/** Metadata returned by `GET /api/rooms/:roomId/recordings`. */
export interface VoiceRecordingMeta {
  id: string;
  roomId: string;
  actor: { id: string; name: string; color: string };
  startedAt: number;
  durationMs: number;
  sizeBytes: number;
  mimeType: string;
  snapshotId?: string;
  createdAt: number;
  downloadUrl: string;
}

/** Live recording state broadcast over the room socket. */
export interface VoiceRecordingState {
  isRecording: boolean;
  userId?: string;
  userName?: string;
  startedAt?: number;
}

/** `83000` -> `1:23`; hour-long recordings render as `1:02:03`. */
export function formatRecordingDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const secondsLabel = String(seconds).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsLabel}`
    : `${minutes}:${secondsLabel}`;
}

/** Short local date/time, with Today/Yesterday shortcuts for recent clips. */
export function formatRecordingDate(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return 'Unknown date';
  const date = new Date(ts);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) return `Today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;

  const dateLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const year = date.getFullYear() === now.getFullYear() ? '' : `, ${date.getFullYear()}`;
  return `${dateLabel}${year} · ${time}`;
}
