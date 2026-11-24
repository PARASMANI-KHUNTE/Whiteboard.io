/**
 * Determines whether a scroll event should dismiss an open context menu.
 * Scrolls originating inside the context menu itself (e.g. keyboard focus scrolling
 * or wheel-scrolling through a long menu list) must be ignored so all items remain reachable.
 */
export function shouldCloseContextMenuOnScroll(
  menuEl: { contains(other: any): boolean } | null,
  scrollTarget: unknown
): boolean {
  if (!menuEl || !scrollTarget) return true;
  if (scrollTarget === menuEl) return false;
  if (typeof (menuEl as any).contains === 'function' && menuEl.contains(scrollTarget)) {
    return false;
  }
  return true;
}
