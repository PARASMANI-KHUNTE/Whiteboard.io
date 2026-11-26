import React from 'react';
import type { WhiteboardAction, WhiteboardToolAction } from '../../hooks/useWhiteboardActions';

interface FloatingToolDockProps {
  visible: boolean;
  tools: WhiteboardToolAction[];
  undo: WhiteboardAction;
  redo: WhiteboardAction;
  aiDiagram: WhiteboardAction;
}

/**
 * Compact glassmorphic quick-tool dock shown when the main 256px sidebar is
 * collapsed so users can switch drawing tools, undo/redo, or launch AI
 * diagrams without reopening the full navigation drawer.
 */
export const FloatingToolDock: React.FC<FloatingToolDockProps> = ({
  visible,
  tools,
  undo,
  redo,
  aiDiagram,
}) => {
  if (!visible) return null;

  const AiIcon = aiDiagram.icon;
  const UndoIcon = undo.icon;
  const RedoIcon = redo.icon;

  return (
    <nav
      id="floating-tool-dock"
      aria-label="Quick drawing toolbar"
      className="fixed bottom-[4.5rem] sm:bottom-6 left-1/2 -translate-x-1/2 wb-canvas-centered wb-bottom-chat-aware z-40 flex items-center gap-0.5 sm:gap-1 p-1 sm:p-1.5 max-w-[calc(100vw-1.5rem)] overflow-x-auto wb-surface-glass rounded-2xl shadow-xl select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      {tools
        .filter((t) => t.tool !== 'hand')
        .map((toolAction) => {
          const Icon = toolAction.icon;
          return (
            <button
              key={toolAction.id}
              id={`dock-${toolAction.id}`}
              type="button"
              onClick={toolAction.handler}
              disabled={toolAction.disabled}
              title={toolAction.title}
              aria-label={`${toolAction.label} (${toolAction.shortcut})`}
              aria-pressed={toolAction.active}
              className={`p-2 min-w-[34px] min-h-[34px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl flex items-center justify-center transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed shrink-0 btn-press ${
                toolAction.active
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/50 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden />
            </button>
          );
        })}

      <div className="h-5 w-px bg-slate-200/80 dark:bg-slate-700/80 mx-0.5 shrink-0" aria-hidden="true" />

      <button
        id="dock-undo-btn"
        type="button"
        onClick={undo.handler}
        disabled={undo.disabled}
        title={undo.title}
        aria-label={undo.ariaLabel}
        className="p-2 min-w-[34px] min-h-[34px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed shrink-0 btn-press"
      >
        <UndoIcon className="w-4 h-4" aria-hidden />
      </button>

      <button
        id="dock-redo-btn"
        type="button"
        onClick={redo.handler}
        disabled={redo.disabled}
        title={redo.title}
        aria-label={redo.ariaLabel}
        className="p-2 min-w-[34px] min-h-[34px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed shrink-0 btn-press"
      >
        <RedoIcon className="w-4 h-4" aria-hidden />
      </button>

      <button
        id="dock-ai-diagram-btn"
        type="button"
        onClick={aiDiagram.handler}
        disabled={aiDiagram.disabled}
        title={aiDiagram.title}
        aria-label={aiDiagram.ariaLabel}
        className="p-2 sm:px-2.5 min-w-[34px] min-h-[34px] sm:min-h-[36px] rounded-xl flex items-center justify-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed shrink-0 btn-press font-semibold text-xs"
      >
        <AiIcon className="w-4 h-4" aria-hidden />
        <span className="hidden md:inline">AI</span>
      </button>
    </nav>
  );
};
