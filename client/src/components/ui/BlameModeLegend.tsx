export interface BlameLegendUser {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface Props {
  users: BlameLegendUser[];
}

/**
 * Bottom strip shown in blame mode listing all contributing users and their
 * colour swatch. Centered within the active canvas area (accounting for both
 * the desktop sidebar and AI chat panel) and pointer-transparent.
 */
export function BlameModeLegend({ users }: Props) {
  if (users.length === 0) return null;

  return (
    <div
      id="blame-mode-legend"
      aria-label="Blame mode legend"
      className="fixed bottom-[8rem] sm:bottom-[4.5rem] left-1/2 -translate-x-1/2 wb-canvas-centered wb-bottom-chat-aware z-30 flex flex-wrap items-center justify-center gap-2.5 px-3.5 py-1.5 max-w-[calc(100vw-2rem)] wb-surface-glass rounded-full pointer-events-none select-none shadow-lg"
    >
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">
        👤 Blame Mode
      </span>
      <div className="w-px h-3.5 bg-slate-300/80 dark:bg-slate-700" aria-hidden="true" />
      {users.map((u) => (
        <div key={u.id} className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            style={{ backgroundColor: u.color, boxShadow: `0 0 6px ${u.color}88` }}
            className="w-2.5 h-2.5 rounded-full shrink-0 inline-block"
          />
          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{u.name}</span>
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800/80 rounded px-1">
            {u.count}
          </span>
        </div>
      ))}
    </div>
  );
}
