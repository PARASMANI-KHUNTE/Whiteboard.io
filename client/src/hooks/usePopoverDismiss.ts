import { RefObject, useEffect } from 'react';

/**
 * Closes a popover on Escape or a pointer-down outside the given container.
 * Trigger elements opt out via `data-popover-trigger` so their own click
 * handlers can still toggle/open the next popover normally. Capture-phase
 * dismissal keeps an outside press from reaching canvas items behind it.
 */
export function usePopoverDismiss(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void
): void {
  useEffect(() => {
    if (!isOpen) return;

    const isTrigger = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('[data-popover-trigger]'));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isTrigger(event.target)) return;
      if (!containerRef.current?.contains(event.target as Node)) {
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [containerRef, isOpen, onClose]);
}
