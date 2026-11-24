import React from 'react';
import { Moon, Sun } from 'lucide-react';

export interface ThemeToggleMeta {
  isDark: boolean;
  label: string;
  actionLabel: string;
  Icon: typeof Sun;
  iconClassName: string;
}

/** Shared display labels and icon metadata for light/dark theme switching. */
export function getThemeToggleMeta(theme: 'light' | 'dark'): ThemeToggleMeta {
  const isDark = theme === 'dark';
  return {
    isDark,
    label: isDark ? 'Light theme' : 'Dark theme',
    actionLabel: isDark ? 'Switch to light theme' : 'Switch to dark theme',
    Icon: isDark ? Sun : Moon,
    iconClassName: isDark ? 'text-amber-400' : 'text-slate-600 dark:text-slate-400',
  };
}

export interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
  variant?: 'icon' | 'compact-icon' | 'menu-item';
  hideOnMobile?: boolean;
  id?: string;
  className?: string;
}

/**
 * Shared theme switch control used in the desktop header, mobile overflow
 * menu, and profile settings dialog.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  variant = 'icon',
  hideOnMobile = false,
  id,
  className = '',
}) => {
  const { label, actionLabel, Icon, iconClassName } = getThemeToggleMeta(theme);

  if (variant === 'menu-item') {
    return (
      <button
        id={id}
        type="button"
        role="menuitem"
        aria-label={actionLabel}
        onClick={onToggle}
        className={`w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${className}`.trim()}
      >
        <Icon className={`w-4 h-4 ${iconClassName}`} />
        <span>{label}</span>
      </button>
    );
  }

  const displayClass = hideOnMobile ? 'hidden sm:inline-flex' : 'inline-flex';
  const buttonClass =
    variant === 'compact-icon'
      ? `p-1.5 rounded-lg transition-colors cursor-pointer ${
          theme === 'dark'
            ? 'text-amber-400 hover:bg-slate-800'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`
      : `${displayClass} p-2 min-w-[44px] min-h-[44px] items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer btn-press`;

  return (
    <button
      id={id}
      type="button"
      aria-label={actionLabel}
      onClick={onToggle}
      title={actionLabel}
      className={`${buttonClass} ${className}`.trim()}
    >
      <Icon className={`w-4 h-4 ${variant === 'icon' ? iconClassName : ''}`.trim()} />
    </button>
  );
};
