import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { shouldCloseContextMenuOnScroll } from '../utils/contextMenuDismiss';

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
 * clipped by the canvas transform. It sits below dialogs (z-40) and supports
 * arrow-key navigation.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose, header }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  const getMenuItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []
    );

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
    getMenuItems()[0]?.focus();
    // Focus only on open; item callbacks close the menu immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        onClose();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

      const menuItems = getMenuItems();
      if (menuItems.length === 0) return;
      event.preventDefault();

      const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
      let nextIndex: number;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = menuItems.length - 1;
      else if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % menuItems.length;
      else nextIndex = currentIndex <= 0 ? menuItems.length - 1 : currentIndex - 1;
      menuItems[nextIndex].focus();
    };
    const handleScroll = (event: Event) => {
      if (shouldCloseContextMenuOnScroll(menuRef.current, event.target)) {
        onClose();
      }
    };
    const handleResize = () => onClose();

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Canvas actions"
      style={{ left: position.left, top: position.top }}
      className="fixed z-40 min-w-[13rem] max-w-[17rem] max-h-[min(70vh,24rem)] overflow-y-auto overscroll-contain py-1.5 rounded-xl bg-white/98 dark:bg-slate-900/98 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 shadow-2xl shadow-slate-900/15 animate-pop-in select-none"
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
              role="separator"
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
            className={`w-full min-h-[40px] px-3 py-2 flex items-center gap-2.5 text-left text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              entry.danger
                ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0" aria-hidden="true">
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
