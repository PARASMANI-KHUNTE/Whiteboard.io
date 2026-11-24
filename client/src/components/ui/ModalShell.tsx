import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from '../../hooks/useModalA11y';

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  role?: 'dialog' | 'alertdialog';
  titleId?: string;
  describedById?: string;
  initialFocusSelector?: string;
  closeOnBackdrop?: boolean;
  backdropDismissEvent?: 'click' | 'mousedown';
  portal?: boolean;
  overlayId?: string;
  dialogId?: string;
  overlayClassName?: string;
  panelClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared accessible modal chrome providing portal mounting, focus trapping,
 * Escape-key stack handling via `useModalA11y`, backdrop dismissal, and base
 * overlay/panel styling across whiteboard dialogs.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  role = 'dialog',
  titleId,
  describedById,
  initialFocusSelector,
  closeOnBackdrop = true,
  backdropDismissEvent = 'click',
  portal = true,
  overlayId,
  dialogId,
  overlayClassName = 'z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-150',
  panelClassName = 'w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100',
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalA11y({
    isOpen,
    onClose,
    dialogRef,
    initialFocusSelector,
  });

  if (!isOpen) return null;

  const handleBackdrop = (e: React.SyntheticEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalNode = (
    <div
      id={overlayId}
      onClick={backdropDismissEvent === 'click' ? handleBackdrop : undefined}
      onMouseDown={backdropDismissEvent === 'mousedown' ? handleBackdrop : undefined}
      className={`fixed inset-0 ${overlayClassName}`.trim()}
    >
      <div
        ref={dialogRef}
        id={dialogId}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedById}
        tabIndex={-1}
        className={panelClassName}
      >
        {children}
      </div>
    </div>
  );

  return portal ? createPortal(modalNode, document.body) : modalNode;
};
