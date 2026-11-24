import React from 'react';
import { Keyboard } from 'lucide-react';

export interface ShortcutsLauncherButtonProps {
  onOpen: () => void;
  id?: string;
  className?: string;
}

/**
 * Floating launcher button for opening the keyboard shortcuts cheat sheet.
 */
export const ShortcutsLauncherButton: React.FC<ShortcutsLauncherButtonProps> = ({
  onOpen,
  id = 'shortcuts-btn',
  className = '',
}) => (
  <button
    id={id}
    type="button"
    onClick={onOpen}
    title="Keyboard shortcuts (?)"
    aria-label="Open keyboard shortcuts"
    className={`fixed right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+8.75rem)] sm:bottom-6 z-40 flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 shadow-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${className}`.trim()}
  >
    <Keyboard className="w-4 h-4" />
    <span className="hidden sm:inline text-xs font-semibold">Shortcuts</span>
    <kbd className="hidden sm:inline-flex kbd-chip">?</kbd>
  </button>
);
