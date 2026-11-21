import { CanvasElement } from '../types';

/** Lock state is optional on older elements, so read it defensively. */
export function isElementLocked(element: CanvasElement): boolean {
  return Boolean((element as { isLocked?: boolean }).isLocked);
}

/**
 * Returns a moved copy of an element. Wires have no geometry of their own: they
 * follow their endpoints, so they are returned unchanged.
 */
export function translateElement<T extends CanvasElement>(
  element: T,
  dx: number,
  dy: number,
  at = Date.now()
): T {
  if (dx === 0 && dy === 0) return element;

  if (element.type === 'stroke') {
    return {
      ...element,
      points: element.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    } as T;
  }

  if (element.type === 'wire') return element;

  return {
    ...element,
    x: element.x + dx,
    y: element.y + dy,
    updatedAt: at,
  } as T;
}

/** Toggles the lock flag without adding shape-only metadata to strokes. */
export function setElementLocked<T extends CanvasElement>(
  element: T,
  locked: boolean,
  at = Date.now()
): T {
  if (element.type === 'stroke') {
    return { ...element, isLocked: locked } as T;
  }

  return { ...element, isLocked: locked, updatedAt: at } as T;
}
