import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, Info, X } from 'lucide-react';
import { useModalA11y } from '../hooks/useModalA11y';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y({
    isOpen,
    onClose: onCancel,
    dialogRef,
    // Destructive confirmations start on Cancel; Enter must activate a button.
    initialFocusSelector: variant === 'danger' ? '[data-modal-initial]' : undefined,
  });

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          icon: <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />,
          iconBg: 'bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60',
          btnClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs focus:ring-rose-500',
        };
      case 'warning':
        return {
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
          iconBg: 'bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60',
          btnClass: 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs focus:ring-amber-500',
        };
      case 'info':
      default:
        return {
          icon: <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
          iconBg: 'bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60',
          btnClass: 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs focus:ring-blue-500',
        };
    }
  };

  const currentVariant = getVariantStyles();

  return createPortal(
    <div
      id="custom-confirm-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        id="custom-confirm-modal"
        role={variant === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="custom-confirm-modal-title"
        tabIndex={-1}
        className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-5 sm:p-6 animate-in zoom-in-95 duration-150 flex flex-col gap-4 text-slate-800 dark:text-slate-100"
      >
        <div className="flex items-start gap-3.5">
          <div className={`p-2.5 rounded-xl shrink-0 ${currentVariant.iconBg}`}>
            {currentVariant.icon}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 id="custom-confirm-modal-title" className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {title}
              </h3>
              <button
                onClick={onCancel}
                title="Close"
                className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            id="custom-confirm-modal-cancel-btn"
            data-modal-initial={variant === 'danger' ? 'true' : undefined}
            onClick={onCancel}
            className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            {cancelText}
          </button>

          <button
            id="custom-confirm-modal-confirm-btn"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${currentVariant.btnClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
