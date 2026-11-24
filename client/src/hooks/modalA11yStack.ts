export interface ScrollLockDocument {
  body: { style: { overflow: string } };
}

export interface ModalA11yStack {
  /** Register an open modal and return its disposer. */
  push(id: symbol): () => void;
  isTop(id: symbol): boolean;
  acquireScrollLock(doc: ScrollLockDocument): void;
  releaseScrollLock(doc: ScrollLockDocument): void;
}

/**
 * Keydown listeners on `document` are siblings: `stopPropagation()` cannot keep
 * a lower dialog from handling the same Escape. A shared stack lets only the
 * topmost modal react, while the scroll lock is ref-counted so closing one of
 * several dialogs does not unlock the page.
 */
export function createModalA11yStack(): ModalA11yStack {
  const stack: symbol[] = [];
  let scrollLockCount = 0;
  let overflowBeforeLock: string | null = null;

  return {
    push(id) {
      stack.push(id);
      return () => {
        const index = stack.lastIndexOf(id);
        if (index !== -1) stack.splice(index, 1);
      };
    },

    isTop(id) {
      return stack.length > 0 && stack[stack.length - 1] === id;
    },

    acquireScrollLock(doc) {
      if (scrollLockCount === 0) {
        overflowBeforeLock = doc.body.style.overflow;
        doc.body.style.overflow = 'hidden';
      }
      scrollLockCount += 1;
    },

    releaseScrollLock(doc) {
      if (scrollLockCount === 0) return;
      scrollLockCount -= 1;
      if (scrollLockCount === 0) {
        if (overflowBeforeLock !== null) doc.body.style.overflow = overflowBeforeLock;
        overflowBeforeLock = null;
      }
    },
  };
}

/** Singleton shared by every `useModalA11y` instance in the app. */
export const modalA11yStack = createModalA11yStack();
