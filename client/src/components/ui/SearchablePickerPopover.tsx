import React from 'react';
import { Search, X } from 'lucide-react';

export interface SearchablePickerPopoverProps {
  title?: React.ReactNode;
  onClose?: () => void;
  closeAriaLabel?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  clearAriaLabel?: string;
  isEmpty?: boolean;
  emptyMessage?: React.ReactNode;
  widthClassName?: string;
  gridClassName?: string;
  className?: string;
  onMouseDown?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

/**
 * Shared floating picker popover shell used for shape, icon, and wire
 * selectors. Encapsulates glass styling, optional header + close button,
 * optional search input with clear button, scrollable grid, and empty state.
 */
export const SearchablePickerPopover: React.FC<SearchablePickerPopoverProps> = ({
  title,
  onClose,
  closeAriaLabel = 'Close picker',
  searchQuery = '',
  onSearchChange,
  searchPlaceholder = 'Search...',
  clearAriaLabel = 'Clear search',
  isEmpty = false,
  emptyMessage = 'No matching items',
  widthClassName = 'w-72',
  gridClassName = 'grid-cols-3 gap-1.5 max-h-52',
  className = '',
  onMouseDown,
  children,
}) => {
  const showHeader = Boolean(title || onClose);
  const hasSearch = typeof onSearchChange === 'function';

  return (
    <div
      onMouseDown={onMouseDown}
      className={`wb-card-glass rounded-2xl p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150 z-50 shadow-2xl ${widthClassName} ${className}`.trim()}
    >
      {showHeader && (
        <div className="flex items-center justify-between px-0.5">
          {title ? (
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {title}
            </span>
          ) : (
            <span />
          )}
          {onClose && (
            <button
              type="button"
              aria-label={closeAriaLabel}
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 min-w-[36px] min-h-[36px] rounded-lg cursor-pointer flex items-center justify-center btn-press"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {hasSearch && (
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              aria-label={clearAriaLabel}
              onClick={() => onSearchChange('')}
              className="absolute right-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {isEmpty ? (
        <div className="py-4 text-center text-xs text-slate-400">{emptyMessage}</div>
      ) : (
        <div className={`grid overflow-y-auto pr-0.5 ${gridClassName}`}>{children}</div>
      )}
    </div>
  );
};
