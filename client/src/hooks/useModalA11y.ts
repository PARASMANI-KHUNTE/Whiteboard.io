import { RefObject, useEffect, useRef } from 'react';
import { modalA11yStack } from './modalA11yStack';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseModalA11yOptions {
  isOpen: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
  /** Optional selector for the element that should receive focus on open. */
  initialFocusSelector?: string;
}

/**
 * Shared dialog behavior: initial focus, Tab trapping, Escape to close and
 * focus restoration. Keydown is handled in the capture phase so global canvas
 * shortcuts never see keys meant for a modal.
 */
export function useModalA11y({
  isOpen,
  onClose,
  dialogRef,
  initialFocusSelector,
}: UseModalA11yOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const modalId = Symbol('modal');
    const popModal = modalA11yStack.push(modalId);
    modalA11yStack.acquireScrollLock(document);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => element.getClientRects().length > 0 || element === document.activeElement
      );

    const initial =
      (initialFocusSelector
        ? dialog.querySelector<HTMLElement>(initialFocusSelector)
        : null) ??
      focusable()[0] ??
      dialog;
    initial.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      // Sibling capture listeners all see the same key. Only the topmost modal
      // may act on it, and it must stop every other listener from doing so.
      if (!modalA11yStack.isTop(modalId)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      modalA11yStack.releaseScrollLock(document);
      popModal();
      previouslyFocused?.focus?.();
    };
  }, [isOpen, dialogRef, initialFocusSelector]);
}
