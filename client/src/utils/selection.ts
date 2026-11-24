/** Selection helpers shared by the canvas and interactive canvas items. */

export interface ModifierLike {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export function hasMultiSelectModifier(event: ModifierLike): boolean {
  return Boolean(event.shiftKey || event.ctrlKey || event.metaKey);
}

/**
 * Toggles one id for a modifier click. Without a modifier an already-selected
 * id keeps the existing multi-selection so it can be dragged as a group.
 */
export function toggleSelection(
  previous: ReadonlySet<string>,
  id: string,
  isMulti = false
): Set<string> {
  if (isMulti) {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  return previous.has(id) ? new Set(previous) : new Set([id]);
}
