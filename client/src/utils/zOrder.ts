import { CanvasElement } from '../types';
import { isElementLocked } from './elementMutations';

export type ZOrderAction = 'front' | 'forward' | 'backward' | 'back';

export const getElementZ = (element: CanvasElement, fallbackOrder: number): number =>
  typeof (element as { zIndex?: number }).zIndex === 'number'
    ? (element as { zIndex: number }).zIndex
    : fallbackOrder;

/**
 * Reorders canvas elements globally across all element types (sticky, text, shape, icon).
 * Wires, strokes, and locked elements are excluded from reordering.
 */
export function reorderZIndex(
  allElements: Record<string, CanvasElement> | CanvasElement[],
  selectedIds: Set<string>,
  action: ZOrderAction,
  now = Date.now()
): { reordered: CanvasElement[]; changed: CanvasElement[] } {
  const elementsList = Array.isArray(allElements) ? allElements : Object.values(allElements);

  const reorderable: CanvasElement[] = [];
  const orderMap = new Map<string, number>();

  let order = 0;
  for (const el of elementsList) {
    if (!el) continue;
    orderMap.set(el.id, order++);
    if (el.type === 'wire' || el.type === 'stroke' || isElementLocked(el)) {
      continue;
    }
    reorderable.push(el);
  }

  const arranged = reorderable.slice().sort((a, b) => {
    const za = getElementZ(a, orderMap.get(a.id) ?? 0);
    const zb = getElementZ(b, orderMap.get(b.id) ?? 0);
    return za - zb;
  });

  if (action === 'front' || action === 'back') {
    const moving = arranged.filter((el) => selectedIds.has(el.id));
    const rest = arranged.filter((el) => !selectedIds.has(el.id));
    arranged.length = 0;
    arranged.push(...(action === 'front' ? [...rest, ...moving] : [...moving, ...rest]));
  } else if (action === 'forward') {
    for (let i = arranged.length - 2; i >= 0; i--) {
      if (selectedIds.has(arranged[i].id) && !selectedIds.has(arranged[i + 1].id)) {
        [arranged[i], arranged[i + 1]] = [arranged[i + 1], arranged[i]];
      }
    }
  } else if (action === 'backward') {
    for (let i = 1; i < arranged.length; i++) {
      if (selectedIds.has(arranged[i].id) && !selectedIds.has(arranged[i - 1].id)) {
        [arranged[i], arranged[i - 1]] = [arranged[i - 1], arranged[i]];
      }
    }
  }

  const changed: CanvasElement[] = [];
  const reordered: CanvasElement[] = arranged.map((element, index) => {
    const hasChanged = (element as { zIndex?: number }).zIndex !== index;
    const updated = {
      ...element,
      zIndex: index,
      ...(hasChanged ? { updatedAt: now } : {}),
    };
    if (hasChanged) {
      changed.push(updated);
    }
    return updated;
  });

  return { reordered, changed };
}
