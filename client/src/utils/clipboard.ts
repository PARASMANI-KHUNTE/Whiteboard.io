import { CanvasElement, WireElement } from '../types';

/**
 * Canvas clipboard shared through localStorage so a selection can be copied in
 * one room and pasted into another (or after a reload).
 */
const STORAGE_KEY = 'whiteboard.io:clipboard:v1';

interface StoredClipboard {
  version: 1;
  elements: CanvasElement[];
  copiedAt: number;
}

const generateId = (type: string): string =>
  `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

const isStoredClipboard = (value: unknown): value is StoredClipboard => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as StoredClipboard;
  return candidate.version === 1 && Array.isArray(candidate.elements);
};

export function writeClipboard(elements: CanvasElement[]): void {
  if (elements.length === 0) return;
  const payload: StoredClipboard = {
    version: 1,
    elements,
    copiedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable (private mode / quota); copying still works
    // for the current session through the caller's fallback if needed.
  }
}

export function readClipboard(): CanvasElement[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredClipboard(parsed)) return [];
    return parsed.elements.filter((el) => el && typeof el.id === 'string' && typeof el.type === 'string');
  } catch {
    return [];
  }
}

export function hasClipboardContent(): boolean {
  return readClipboard().length > 0;
}

/**
 * Deep-clones clipboard elements with fresh ids and an optional offset.
 * Wires are included only when both of their endpoints were copied too, and
 * their endpoint references are remapped to the new ids.
 */
export function cloneElementsForPaste(
  elements: CanvasElement[],
  dx = 32,
  dy = 32
): CanvasElement[] {
  const idMap = new Map<string, string>();
  const baseTime = Date.now();

  for (const el of elements) {
    if (el.type === 'wire') continue;
    idMap.set(el.id, generateId(el.type));
  }

  const cloned: CanvasElement[] = [];

  elements.forEach((el, index) => {
    if (el.type === 'wire') {
      const wire = el as WireElement;
      const fromId = idMap.get(wire.fromId);
      const toId = idMap.get(wire.toId);
      if (!fromId || !toId) return;
      cloned.push({
        ...wire,
        id: generateId('wire'),
        fromId,
        toId,
        updatedAt: baseTime + index,
      });
      return;
    }

    const newId = idMap.get(el.id);
    if (!newId) return;

    if (el.type === 'stroke') {
      cloned.push({
        ...el,
        id: newId,
        points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        createdAt: baseTime + index,
      });
      return;
    }

    cloned.push({
      ...el,
      id: newId,
      x: el.x + dx,
      y: el.y + dy,
      updatedAt: baseTime + index,
      // Keep pasted objects above existing objects of the same type.
      zIndex: baseTime + index,
    } as CanvasElement);
  });

  return cloned;
}
