import React, { useEffect, useMemo, useState } from 'react';
import { Command, Search, X } from 'lucide-react';
import { ModalShell } from './ui/ModalShell';
import type { LucideIcon } from 'lucide-react';

export interface CommandPaletteItem {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  icon: LucideIcon;
  disabled?: boolean;
  onSelect: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

/**
 * Fuzzy-searchable Ctrl+K / Cmd+K launcher over whiteboard tools and actions.
 */
export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  items,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.filter((item) => !item.disabled);
    return items.filter(
      (item) =>
        !item.disabled &&
        (`${item.label} ${item.category} ${item.shortcut ?? ''}`.toLowerCase().includes(q))
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const execute = (item: CommandPaletteItem | undefined) => {
    if (!item || item.disabled) return;
    onClose();
    item.onSelect();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(filtered[activeIndex]);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      titleId="command-palette-title"
      initialFocusSelector='input[type="text"]'
      overlayId="command-palette-overlay"
      dialogId="command-palette-dialog"
      overlayClassName="z-[90] flex items-start justify-center pt-[12vh] px-4 bg-slate-950/45 backdrop-blur-xs animate-fade-in"
      panelClassName="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 animate-pop-in"
    >
      <div onKeyDown={handleKeyDown}>
        <h2 id="command-palette-title" className="sr-only">
          Command Palette
        </h2>

        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or tool (export, blame, pen, AI...)"
            aria-label="Search commands"
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear command search"
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="kbd-chip hidden sm:inline-flex">Esc</kbd>
        </div>

        <div role="listbox" aria-label="Matching commands" className="max-h-[54vh] overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No commands match &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => execute(item)}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left text-sm transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-200'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 opacity-75" aria-hidden />
                  <span className="flex-1 font-medium truncate">{item.label}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {item.category}
                  </span>
                  {item.shortcut && <kbd className="kbd-chip">{item.shortcut}</kbd>}
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Command className="w-3 h-3" aria-hidden />
            Navigate with ↑ ↓, Enter to run
          </span>
          <span>{filtered.length} commands</span>
        </div>
      </div>
    </ModalShell>
  );
};
