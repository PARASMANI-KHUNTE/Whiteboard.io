import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, Search, X } from 'lucide-react';
import { SHORTCUT_SECTIONS } from '../utils/shortcuts';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MOD_HINT = 'On macOS use ⌘ instead of Ctrl';

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_SECTIONS;
    return SHORTCUT_SECTIONS.map((section) => ({
      ...section,
      shortcuts: section.shortcuts.filter((shortcut) => {
        const haystack = [shortcut.label, shortcut.description, ...shortcut.keys]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      }),
    })).filter((section) => section.shortcuts.length > 0);
  }, [query]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-950/45 backdrop-blur-sm animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full sm:max-w-3xl max-h-[88vh] sm:max-h-[82vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Keyboard className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
              Keyboard shortcuts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Work faster — hold <kbd className="kbd-inline">Alt</kbd> while dragging to duplicate.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close shortcuts"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 sm:px-6 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shortcuts (copy, zoom, duplicate...)"
              className="w-full pl-9 pr-9 py-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Shortcut grid */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
          {filteredSections.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No shortcuts match &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              {filteredSections.map((section) => (
                <section key={section.title}>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                    {section.title}
                  </h3>
                  <ul className="space-y-1">
                    {section.shortcuts.map((shortcut) => (
                      <li
                        key={`${section.title}-${shortcut.label}`}
                        className="flex items-center justify-between gap-3 py-1.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-slate-800 dark:text-slate-100 truncate">
                            {shortcut.label}
                          </div>
                          {shortcut.description && (
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                              {shortcut.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {shortcut.keys.map((key, index) => (
                            <React.Fragment key={`${key}-${index}`}>
                              {index > 0 && (
                                <span className="text-[9px] text-slate-300 dark:text-slate-600">+</span>
                              )}
                              <kbd className="kbd-chip">{key}</kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between gap-3">
          <span>Tip: use <kbd className="kbd-inline">?</kbd> anywhere to reopen this panel.</span>
          <span className="hidden sm:inline">{MOD_HINT}</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
