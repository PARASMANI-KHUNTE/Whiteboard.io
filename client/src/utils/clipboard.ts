import { CanvasElement, DrawingStroke, WireElement } from '../types';

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

export function isValidClipboardElement(el: unknown): el is CanvasElement {
  if (!el || typeof el !== 'object') return false;
  const candidate = el as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !candidate.id || typeof candidate.type !== 'string') {
    return false;
  }
  if (candidate.type === 'stroke') {
    if (!Array.isArray(candidate.points) || candidate.points.length === 0) return false;
    return candidate.points.some(
      (p) =>
        p &&
        typeof p === 'object' &&
        typeof (p as { x?: unknown }).x === 'number' &&
        Number.isFinite((p as { x: number }).x) &&
        typeof (p as { y?: unknown }).y === 'number' &&
        Number.isFinite((p as { y: number }).y)
    );
  }
  if (candidate.type === 'wire') {
    return typeof candidate.fromId === 'string' && typeof candidate.toId === 'string';
  }
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y)
  );
}

export function writeClipboard(elements: CanvasElement[]): void {
  const validElements = elements.filter(isValidClipboardElement);
  if (validElements.length === 0) return;
  const payload: StoredClipboard = {
    version: 1,
    elements: validElements,
    copiedAt: Date.now(),
  };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // Storage can be unavailable (private mode / quota); copying still works
    // for the current session through the caller's fallback if needed.
  }
}

export function readClipboard(): CanvasElement[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredClipboard(parsed)) return [];
    return parsed.elements.filter(isValidClipboardElement);
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

  const validElements = elements.filter(isValidClipboardElement);

  for (const el of validElements) {
    if (el.type === 'wire') continue;
    idMap.set(el.id, generateId(el.type));
  }

  const cloned: CanvasElement[] = [];

  validElements.forEach((el, index) => {
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
      const stroke = el as DrawingStroke;
      const points = Array.isArray(stroke.points) ? stroke.points : [];
      cloned.push({
        ...stroke,
        id: newId,
        points: points
          .filter(
            (p) =>
              p &&
              typeof p.x === 'number' &&
              Number.isFinite(p.x) &&
              typeof p.y === 'number' &&
              Number.isFinite(p.y)
          )
          .map((p) => ({ x: p.x + dx, y: p.y + dy })),
        createdAt: baseTime + index,
      });
      return;
    }

    const posX = typeof (el as { x?: number }).x === 'number' ? (el as { x: number }).x + dx : dx;
    const posY = typeof (el as { y?: number }).y === 'number' ? (el as { y: number }).y + dy : dy;

    cloned.push({
      ...el,
      id: newId,
      x: posX,
      y: posY,
      updatedAt: baseTime + index,
      // Keep pasted objects above existing objects of the same type.
      zIndex: baseTime + index,
    } as CanvasElement);
  });

  return cloned;
}
