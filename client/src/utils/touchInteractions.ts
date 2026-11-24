/**
 * Utility functions for touch interactions, pointer events, and element autofocus behavior.
 */

export interface TouchLikePoint {
  clientX: number;
  clientY: number;
}

export interface TouchLikeEvent {
  touches?: ArrayLike<TouchLikePoint>;
  changedTouches?: ArrayLike<TouchLikePoint>;
  clientX?: number;
  clientY?: number;
}

/**
 * Extracts the primary client coordinates from a touch or mouse event.
 * Falls back to `changedTouches` when `touches` is empty (such as during `touchend` or `touchcancel`).
 */
export function getTouchClientPoint(e: TouchLikeEvent): TouchLikePoint | null {
  if (e.touches && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
  }
  if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
    return { clientX: e.clientX, clientY: e.clientY };
  }
  return null;
}

/**
 * Determines whether the event target is an interactive or scrollable text input,
 * such as a textarea or input inside a sticky note or text element.
 * Touch scrolling inside these elements must NOT be prevented with `preventDefault()`.
 */
export function isScrollableTextInput(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as {
    tagName?: string;
    getAttribute?: (name: string) => string | null;
    isContentEditable?: boolean;
    closest?: (selector: string) => any;
  };

  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  if (tag === 'textarea' || tag === 'input') return true;
  if (el.isContentEditable) return true;

  if (typeof el.getAttribute === 'function') {
    const role = el.getAttribute('role');
    if (role === 'textbox') return true;
    const contentEditable = el.getAttribute('contenteditable');
    if (contentEditable === 'true' || contentEditable === '') return true;
  }

  if (typeof el.closest === 'function') {
    if (el.closest('textarea, input, [role="textbox"], [contenteditable="true"]')) {
      return true;
    }
  }

  return false;
}
