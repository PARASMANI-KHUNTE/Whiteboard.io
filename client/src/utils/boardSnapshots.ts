import type { CanvasElement } from '../types';

export interface BoardSnapshotMeta {
  id: string;
  roomId: string;
  actor?: { id: string; name: string; color: string };
  eventCount: number;
  timestamp: number;
  createdAt?: string | number | Date;
  elementCount: number;
}

export interface BoardSnapshotDetail extends BoardSnapshotMeta {
  elements: Record<string, CanvasElement>;
}

/** Short, human-readable preview of the kinds of elements in a snapshot. */
export function describeSnapshotElements(snapshot: BoardSnapshotDetail, limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const element of Object.values(snapshot.elements || {})) {
    const key =
      element.type === 'sticky'
        ? 'Sticky notes'
        : element.type === 'shape'
          ? 'Shapes'
          : element.type === 'text'
            ? 'Text boxes'
            : element.type === 'icon'
              ? 'Icons'
              : element.type === 'wire'
                ? 'Connectors'
                : element.type === 'stroke'
                  ? element.isHighlighter
                    ? 'Highlighter strokes'
                    : 'Freehand strokes'
                  : 'Elements';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label} × ${count}`);
}
