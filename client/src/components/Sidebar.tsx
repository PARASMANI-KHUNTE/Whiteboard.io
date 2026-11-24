import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Download,
  Hand,
  Highlighter,
  Info,
  Keyboard,
  ListChecks,
  LogIn,
  MessageSquare,
  Mic,
  MicOff,
  Moon,
  MousePointer,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Redo2,
  Share2,
  Shield,
  Smile,
  Sparkles,
  Spline,
  StickyNote,
  Sun,
  Trash2,
  Type,
  Undo2,
  UserRound,
  Users,
  Eraser,
  Shapes,
  Menu,
  type LucideIcon,
} from 'lucide-react';
import type { ThemeMode } from '../hooks/useTheme';
import type { ToolType } from '../types';

type IconComponent = LucideIcon;

export interface SidebarProps {
  currentTool: ToolType;
  theme: ThemeMode;
  canWrite: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isMultiplayer: boolean;
  isHost: boolean;
  isSignedIn: boolean;
  isVoiceConnected: boolean;
  isMuted: boolean;
  isAiChatOpen: boolean;
  onSelectTool: (tool: ToolType) => void;
  onToggleTheme: () => void;
  onSelectAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onRequestClear: () => void;
  onOpenRooms: () => void;
  onOpenShare: () => void;
  onOpenAdmin: () => void;
  onOpenAi: () => void;
  onToggleAiChat: () => void;
  onToggleVoice: () => void;
  onToggleMute: () => void;
}

interface SidebarButtonProps {
  id?: string;
  icon: IconComponent;
  label: string;
  expanded: boolean;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
}

function SidebarButton({
  id,
  icon: Icon,
  label,
  expanded,
  active = false,
  disabled = false,
  pressed,
  onClick,
}: SidebarButtonProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${
        expanded ? 'justify-start' : 'justify-center px-2'
      } ${
        active
          ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/70 dark:text-blue-300 ring-1 ring-blue-300/70 dark:ring-blue-800'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className={`text-sm font-medium truncate ${expanded ? '' : 'sr-only'}`}>{label}</span>
    </button>
  );
}

interface SidebarSectionProps {
  title: string;
  expanded: boolean;
  children: ReactNode;
}

function SidebarSection({ title, expanded, children }: SidebarSectionProps) {
  return (
    <div className="border-t border-slate-200/80 dark:border-slate-800 pt-3 first:border-t-0 first:pt-0">
      {expanded ? (
        <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {title}
        </p>
      ) : (
        <span className="sr-only">{title}</span>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

export default function Sidebar({
  currentTool,
  theme,
  canWrite,
  canUndo,
  canRedo,
  isMultiplayer,
  isHost,
  isSignedIn,
  isVoiceConnected,
  isMuted,
  isAiChatOpen,
  onSelectTool,
  onToggleTheme,
  onSelectAll,
  onUndo,
  onRedo,
  onExport,
  onRequestClear,
  onOpenRooms,
  onOpenShare,
  onOpenAdmin,
  onOpenAi,
  onToggleAiChat,
  onToggleVoice,
  onToggleMute,
}: SidebarProps) {
  const [isOpen, setIsOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const previousOpenRef = useRef(isOpen);

  // Move focus into the rail when the user opens it, and back to a visible
  // trigger when it closes so keyboard users never land on an off-screen
  // control. Comparing against the previous state avoids stealing focus on
  // the initial render (including StrictMode's development double effect).
  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = isOpen;
    if (wasOpen === isOpen) return;

    if (isOpen) {
      toggleRef.current?.focus();
      return;
    }
    if (sidebarRef.current?.contains(document.activeElement)) {
      const restoreTo =
        openButtonRef.current?.getClientRects().length ? openButtonRef.current : toggleRef.current;
      restoreTo?.focus();
    }
  }, [isOpen]);

  // Shared CSS uses this to dock the canvas and bottom chrome beside the rail.
  useEffect(() => {
    document.documentElement.dataset.sidebarOpen = String(isOpen);
    return () => {
      delete document.documentElement.dataset.sidebarOpen;
    };
  }, [isOpen]);

  // Collapse when leaving desktop so the panel never covers a small canvas.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setIsOpen(false);
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (window.innerWidth >= 1024) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const runAction = useCallback((action: () => void) => {
    action();
    if (window.innerWidth < 1024) setIsOpen(false);
  }, []);

  const clickHeaderControl = useCallback(
    (id: string) => runAction(() => document.getElementById(id)?.click()),
    [runAction]
  );

  const toolButtons: Array<{
    tool: ToolType;
    label: string;
    icon: IconComponent;
    needsWrite: boolean;
  }> = [
    { tool: 'select', label: 'Select', icon: MousePointer, needsWrite: false },
    { tool: 'hand', label: 'Pan / Hand', icon: Hand, needsWrite: false },
    { tool: 'pen', label: 'Pen', icon: Pencil, needsWrite: true },
    { tool: 'highlighter', label: 'Highlighter', icon: Highlighter, needsWrite: true },
    { tool: 'eraser', label: 'Eraser', icon: Eraser, needsWrite: true },
    { tool: 'shape', label: 'Shapes', icon: Shapes, needsWrite: true },
    { tool: 'icon', label: 'Icons & stickers', icon: Smile, needsWrite: true },
    { tool: 'sticky', label: 'Sticky note', icon: StickyNote, needsWrite: true },
    { tool: 'text', label: 'Text', icon: Type, needsWrite: true },
    { tool: 'wire', label: 'Wire connector', icon: Spline, needsWrite: true },
  ];

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 top-14 z-30 bg-slate-900/40 backdrop-blur-[1px] sm:top-16 lg:hidden"
        />
      )}

      {!isOpen && (
        <button
          ref={openButtonRef}
          id="sidebar-open-btn"
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Open sidebar"
          aria-controls="whiteboard-sidebar"
          aria-expanded={false}
          title="Open sidebar"
          className="fixed left-3 top-16 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-600 shadow-lg backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      )}

      <aside
        ref={sidebarRef}
        id="whiteboard-sidebar"
        aria-label="Whiteboard controls"
        className={`fixed bottom-0 left-0 top-14 z-40 flex flex-col overflow-hidden border-r border-slate-200 bg-white/95 shadow-xl backdrop-blur-md transition-all duration-200 ease-out sm:top-16 dark:border-slate-800 dark:bg-slate-900/95 ${
          isOpen ? 'w-64 translate-x-0' : 'w-16 -translate-x-full lg:translate-x-0'
        }`}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-slate-200/80 dark:border-slate-800 ${
            isOpen ? 'justify-between px-3' : 'justify-center'
          }`}
        >
          {isOpen && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">Controls</p>
              <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">Everything in one place</p>
            </div>
          )}
          <button
            ref={toggleRef}
            id="sidebar-toggle-btn"
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-controls="whiteboard-sidebar"
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {isOpen ? (
              <PanelLeftClose className="h-5 w-5" aria-hidden />
            ) : (
              <PanelLeftOpen className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-3" aria-label="Whiteboard tools">
          <SidebarSection title="Tools" expanded={isOpen}>
            {toolButtons.map(({ tool, label, icon, needsWrite }) => (
              <SidebarButton
                key={tool}
                id={`sidebar-tool-${tool}`}
                icon={icon}
                label={label}
                expanded={isOpen}
                active={currentTool === tool}
                pressed={currentTool === tool}
                disabled={needsWrite && !canWrite}
                onClick={() => runAction(() => onSelectTool(tool))}
              />
            ))}
          </SidebarSection>

          <SidebarSection title="Board" expanded={isOpen}>
            <SidebarButton
              id="sidebar-select-all"
              icon={ListChecks}
              label="Select all"
              expanded={isOpen}
              onClick={() => runAction(onSelectAll)}
            />
            <SidebarButton
              icon={Undo2}
              label="Undo"
              expanded={isOpen}
              disabled={!canUndo || !canWrite}
              onClick={() => runAction(onUndo)}
            />
            <SidebarButton
              icon={Redo2}
              label="Redo"
              expanded={isOpen}
              disabled={!canRedo || !canWrite}
              onClick={() => runAction(onRedo)}
            />
            <SidebarButton
              icon={Download}
              label="Export PNG"
              expanded={isOpen}
              onClick={() => runAction(onExport)}
            />
            <SidebarButton
              icon={Trash2}
              label={isMultiplayer ? 'Vote to clear' : 'Clear board'}
              expanded={isOpen}
              disabled={!canWrite}
              onClick={() => runAction(onRequestClear)}
            />
          </SidebarSection>

          <SidebarSection title="Collaborate" expanded={isOpen}>
            <SidebarButton
              icon={Users}
              label="Rooms"
              expanded={isOpen}
              onClick={() => runAction(onOpenRooms)}
            />
            <SidebarButton
              icon={Share2}
              label="Share board"
              expanded={isOpen}
              onClick={() => runAction(onOpenShare)}
            />
            <SidebarButton
              icon={Shield}
              label="Admin panel"
              expanded={isOpen}
              disabled={!isHost}
              onClick={() => runAction(onOpenAdmin)}
            />
            <SidebarButton
              icon={Sparkles}
              label="Generate diagram"
              expanded={isOpen}
              disabled={!canWrite}
              onClick={() => runAction(onOpenAi)}
            />
            <SidebarButton
              icon={MessageSquare}
              label="AI chat"
              expanded={isOpen}
              active={isAiChatOpen}
              pressed={isAiChatOpen}
              onClick={() => runAction(onToggleAiChat)}
            />
            <SidebarButton
              icon={isVoiceConnected ? MicOff : Mic}
              label={isVoiceConnected ? 'Leave voice' : 'Join voice'}
              expanded={isOpen}
              active={isVoiceConnected}
              pressed={isVoiceConnected}
              onClick={() => runAction(onToggleVoice)}
            />
            {isVoiceConnected && (
              <SidebarButton
                icon={isMuted ? MicOff : Mic}
                label={isMuted ? 'Unmute' : 'Mute'}
                expanded={isOpen}
                active={isMuted}
                pressed={isMuted}
                onClick={() => runAction(onToggleMute)}
              />
            )}
          </SidebarSection>

          <SidebarSection title="View" expanded={isOpen}>
            <SidebarButton
              id="sidebar-shortcuts"
              icon={Keyboard}
              label="Keyboard shortcuts"
              expanded={isOpen}
              onClick={() => clickHeaderControl('shortcuts-btn')}
            />
            <SidebarButton
              icon={theme === 'dark' ? Sun : Moon}
              label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              expanded={isOpen}
              onClick={() => runAction(onToggleTheme)}
            />
          </SidebarSection>

          <SidebarSection title="Account" expanded={isOpen}>
            <SidebarButton
              icon={isSignedIn ? UserRound : LogIn}
              label={isSignedIn ? 'Profile' : 'Sign in'}
              expanded={isOpen}
              onClick={() =>
                clickHeaderControl(isSignedIn ? 'user-profile-btn' : 'sign-in-prompt-btn')
              }
            />
            <SidebarButton
              icon={Info}
              label="About"
              expanded={isOpen}
              onClick={() => clickHeaderControl('about-app-btn')}
            />
          </SidebarSection>
        </nav>
      </aside>
    </>
  );
}
