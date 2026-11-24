import React from 'react';
import { Copy, Lock, Move, RotateCw, Trash2, Unlock } from 'lucide-react';

export const ITEM_OPACITIES = [
  { label: '100%', val: 1.0 },
  { label: '75%', val: 0.75 },
  { label: '50%', val: 0.5 },
  { label: '25%', val: 0.25 },
];

export interface ItemRotationHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  title?: string;
}

/** Shared top rotation pin stalk rendered above selected shapes and icons. */
export const ItemRotationHandle: React.FC<ItemRotationHandleProps> = ({
  onMouseDown,
  title = 'Drag to rotate',
}) => (
  <div
    className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing z-40"
    onMouseDown={onMouseDown}
    title={title}
  >
    <div className="w-3.5 h-3.5 rounded-full bg-white dark:bg-slate-800 border-2 border-blue-500 shadow-sm hover:scale-125 transition-transform" />
    <div className="w-0.5 h-3 bg-blue-500" />
  </div>
);

export interface ItemToolbarProps {
  isLocked?: boolean;
  rotation?: number;
  className?: string;
  showHoverBridge?: boolean;
  onMoveStart?: (e: React.MouseEvent) => void;
  moveTitle?: string;
  afterMove?: React.ReactNode;
  onQuickRotate?: () => void;
  rotateAriaLabel?: string;
  onDuplicate?: () => void;
  duplicateTitle?: string;
  duplicateAriaLabel?: string;
  onToggleLock?: () => void;
  lockTitle?: string;
  unlockTitle?: string;
  onDelete?: (e: React.MouseEvent) => void;
  deleteTitle?: string;
  deleteAriaLabel?: string;
  children: React.ReactNode;
}

/**
 * Shared floating action bar chrome for canvas items (Shape, Icon, Text, Wire).
 * Renders optional drag grip, quick rotate, type-specific children, duplicate,
 * lock/unlock, and delete controls with consistent styling and inverse rotation.
 */
export const ItemToolbar: React.FC<ItemToolbarProps> = ({
  isLocked = false,
  rotation = 0,
  className = '-top-12 px-2 py-1 gap-1.5 z-50',
  showHoverBridge = true,
  onMoveStart,
  moveTitle = 'Drag to move',
  afterMove,
  onQuickRotate,
  rotateAriaLabel = 'Rotate 45 degrees',
  onDuplicate,
  duplicateTitle = 'Duplicate',
  duplicateAriaLabel,
  onToggleLock,
  lockTitle = 'Lock in place',
  unlockTitle = 'Unlock',
  onDelete,
  deleteTitle = 'Delete',
  deleteAriaLabel,
  children,
}) => {
  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`absolute left-1/2 -translate-x-1/2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl flex items-center animate-in fade-in zoom-in-95 duration-100 whitespace-nowrap text-slate-700 dark:text-slate-200 select-none ${className}`.trim()}
      style={rotation !== 0 ? { transform: `translateX(-50%) rotate(-${rotation}deg)` } : undefined}
    >
      {showHoverBridge && <div className="absolute top-full left-0 right-0 h-3" />}

      {!isLocked && onMoveStart && (
        <div
          onMouseDown={onMoveStart}
          title={moveTitle}
          className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-grab active:cursor-grabbing"
        >
          <Move className="w-3.5 h-3.5" />
        </div>
      )}

      {!isLocked && afterMove}

      {!isLocked && onQuickRotate && (
        <button
          type="button"
          aria-label={rotateAriaLabel}
          onClick={onQuickRotate}
          title="Rotate 45°"
          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      )}

      {children}

      {!isLocked && onDuplicate && (
        <button
          type="button"
          aria-label={duplicateAriaLabel || duplicateTitle}
          onClick={onDuplicate}
          title={duplicateTitle}
          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}

      {onToggleLock && (
        <button
          type="button"
          aria-label={isLocked ? unlockTitle : lockTitle}
          onClick={onToggleLock}
          title={isLocked ? unlockTitle : lockTitle}
          className={`p-1 rounded-lg cursor-pointer transition-colors ${
            isLocked
              ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          aria-label={deleteAriaLabel || deleteTitle}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
          title={deleteTitle}
          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
