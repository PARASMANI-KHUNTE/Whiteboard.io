import type { CanvasElement, RemoteUser } from '../types';
import { getEffectiveAttribution } from './attributionColor';

export type ActivityActionKind = 'created' | 'edited' | 'deleted' | 'cleared';

export interface ActivityEntry {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  action: ActivityActionKind;
  summary: string;
  elementId?: string;
  timestamp: number;
}

const MAX_TIMELINE_ENTRIES = 80;
const COALESCE_WINDOW_MS = 10_000;

export function describeElementKind(element: CanvasElement): string {
  switch (element.type) {
    case 'stroke':
      return element.isHighlighter ? 'Highlighter stroke' : 'Freehand stroke';
    case 'sticky':
      return element.text?.trim()
        ? `Sticky note ("${element.text.trim().slice(0, 22)}${element.text.trim().length > 22 ? '…' : ''}")`
        : 'Sticky note';
    case 'shape':
      return `${element.shapeType.charAt(0).toUpperCase()}${element.shapeType.slice(1)} shape`;
    case 'text':
      return element.text?.trim()
        ? `Text ("${element.text.trim().slice(0, 22)}${element.text.trim().length > 22 ? '…' : ''}")`
        : 'Text box';
    case 'icon':
      return `Icon (${element.iconName})`;
    case 'wire':
      return 'Connector wire';
  }
}

/** Builds initial chronological feed from existing board elements on room join. */
export function buildInitialActivityFromElements(
  elements: Record<string, CanvasElement>,
  users?: Record<string, RemoteUser>,
  limit = 40
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const el of Object.values(elements)) {
    const attr = getEffectiveAttribution(el, users);
    const wasEditedAfterCreate =
      attr.lastModifiedAt - attr.createdAt > 1500 || attr.lastModifiedBy !== attr.createdBy;
    const action: ActivityActionKind = wasEditedAfterCreate ? 'edited' : 'created';
    entries.push({
      id: `init_${el.id}_${wasEditedAfterCreate ? attr.lastModifiedAt : attr.createdAt}`,
      userId: wasEditedAfterCreate ? attr.lastModifiedBy : attr.createdBy,
      userName: wasEditedAfterCreate ? attr.lastModifiedByName : attr.createdByName,
      userColor: wasEditedAfterCreate ? attr.lastModifiedByColor : attr.createdByColor,
      action,
      summary: `${action === 'edited' ? 'Edited' : 'Added'} ${describeElementKind(el)}`,
      elementId: el.id,
      timestamp: wasEditedAfterCreate ? attr.lastModifiedAt : attr.createdAt,
    });
  }
  return entries.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

/**
 * Prepends an activity entry while coalescing rapid repeated edits to the same
 * element by the same user within `COALESCE_WINDOW_MS`.
 */
export function appendActivityEntry(
  prev: ActivityEntry[],
  entry: ActivityEntry,
  maxEntries = MAX_TIMELINE_ENTRIES
): ActivityEntry[] {
  if (
    prev.length > 0 &&
    entry.elementId &&
    prev[0].elementId === entry.elementId &&
    prev[0].userId === entry.userId &&
    prev[0].action === entry.action &&
    Math.abs(entry.timestamp - prev[0].timestamp) <= COALESCE_WINDOW_MS
  ) {
    return [{ ...prev[0], ...entry }, ...prev.slice(1)];
  }
  return [entry, ...prev].slice(0, maxEntries);
}
