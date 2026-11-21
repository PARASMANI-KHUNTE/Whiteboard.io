import { useEffect } from 'react';

/**
 * Object drag/resize/rotate handlers are written against mouse events and
 * attach their move/up listeners to `window`. Touch browsers do not emit those
 * events during a gesture, so touch users could select but never manipulate an
 * object. This bridge translates a primary touch/pen gesture that starts on a
 * canvas item into the equivalent mouse events, including a long-press
 * context menu. It is intentionally scoped to descendants of
 * `[data-canvas-item]` so buttons, text fields and canvas drawing are untouched.
 */

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 8;

const INTERACTIVE = 'button, input, textarea, select, a, [role="button"], [contenteditable="true"]';

function mouseEvent(type: string, pointer: PointerEvent): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    detail: type === 'mousedown' ? 1 : 0,
    button: 0,
    buttons: type === 'mouseup' ? 0 : 1,
    clientX: pointer.clientX,
    clientY: pointer.clientY,
    screenX: pointer.screenX,
    screenY: pointer.screenY,
    altKey: pointer.altKey,
    ctrlKey: pointer.ctrlKey,
    metaKey: pointer.metaKey,
    shiftKey: pointer.shiftKey,
  });
}

export function useTouchPointerBridge(): void {
  useEffect(() => {
    let activePointerId: number | null = null;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressed = false;
    let startX = 0;
    let startY = 0;
    let downEvent: PointerEvent | null = null;
    let item: Element | null = null;

    const cancelLongPress = () => {
      if (longPressTimer !== null) clearTimeout(longPressTimer);
      longPressTimer = null;
    };

    const end = (pointer: PointerEvent, emitMouseUp = true) => {
      if (activePointerId !== pointer.pointerId) return;
      cancelLongPress();
      if (emitMouseUp && downEvent) {
        window.dispatchEvent(mouseEvent('mouseup', pointer));
      }
      activePointerId = null;
      downEvent = null;
      item = null;
      longPressed = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (activePointerId !== null || !event.isPrimary) return;
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(INTERACTIVE)) return;

      const itemEl = target.closest('[data-canvas-item]');
      if (!itemEl || !itemEl.closest('#whiteboard-canvas-container')) return;

      activePointerId = event.pointerId;
      downEvent = event;
      item = itemEl;
      startX = event.clientX;
      startY = event.clientY;
      longPressed = false;

      // Suppress compatibility mouse events and scrolling during the gesture.
      event.preventDefault();
      // Dispatch on the deepest target so handle-specific handlers (resize,
      // rotate, header drag) receive it, then let it bubble like a real mouse.
      target.dispatchEvent(mouseEvent('mousedown', event));

      longPressTimer = setTimeout(() => {
        longPressed = true;
        if (item) {
          item.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: startX,
              clientY: startY,
            })
          );
        }
        // A long press is a context-menu intent, not a drag.
        window.dispatchEvent(mouseEvent('mouseup', event));
        activePointerId = null;
        downEvent = null;
        item = null;
      }, LONG_PRESS_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activePointerId !== event.pointerId || !downEvent) return;
      event.preventDefault();
      if (
        !longPressed &&
        Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE_PX
      ) {
        cancelLongPress();
      }
      window.dispatchEvent(mouseEvent('mousemove', event));
    };

    const onPointerUp = (event: PointerEvent) => end(event);
    const onPointerCancel = (event: PointerEvent) => end(event, false);

    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: false });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('pointercancel', onPointerCancel, { capture: true });

    return () => {
      cancelLongPress();
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
    };
  }, []);
}
