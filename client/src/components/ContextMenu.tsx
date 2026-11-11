import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuEntry =
  | { type: 'separator' }
  | {
      type: 'item';
      id: string;
      label: string;
      icon?: React.ReactNode;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
  header?: React.ReactNode;
}

const MENU_MARGIN = 8;

/**
 * Lightweight, viewport-aware context menu rendered in a portal so it is never
 * clipped by the canvas transform or scroll containers.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, header }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu inside the viewport once its real size is known.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - MENU_MARGIN;
    const maxTop = window.innerHeight - rect.height - MENU_MARGIN;
    setPosition({
      left: Math.max(MENU_MARGIN, Math.min(x, maxLeft)),
      top: Math.max(MENU_MARGIN, Math.min(y, maxTop)),
    });
  }, [x, y, items.length]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('touchstart', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScroll);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown, true);
      window.removeEventListener('touchstart', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Canvas actions"
      style={{ left: position.left, top: position.top }}
      className="fixed z-[80] min-w-[13rem] max-w-[17rem] py-1.5 rounded-xl bg-white/98 dark:bg-slate-900/98 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 shadow-2xl shadow-slate-900/15 animate-pop-in select-none"
      onContextMenu={(event) => event.preventDefault()}
    >
      {header && (
        <>
          <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {header}
          </div>
          <div className="h-px mx-2 mb-1 bg-slate-100 dark:bg-slate-800" />
        </>
      )}

      {items.map((entry, index) => {
        if (entry.type === 'separator') {
          return (
            <div
              key={`separator-${index}`}
              className="h-px my-1 mx-2 bg-slate-100 dark:bg-slate-800"
            />
          );
        }

        return (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              if (entry.disabled) return;
              entry.onSelect();
              onClose();
            }}
            className={`w-full px-3 py-2 flex items-center gap-2.5 text-left text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              entry.danger
                ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {entry.icon}
            </span>
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.shortcut && (
              <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                {entry.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
};
