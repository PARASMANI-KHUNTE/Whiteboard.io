import { useMemo } from 'react';
import {
  CheckSquare,
  Download,
  History,
  Info,
  Keyboard,
  LogIn,
  Magnet,
  Menu,
  Mic,
  PanelLeftClose,
  Radio,
  Redo2,
  Share2,
  Shield,
  Trash2,
  Undo2,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ToolType } from '../types';
import type { ThemeMode } from './useTheme';
import { getThemeToggleMeta } from '../components/ui/ThemeToggle';
import { getVoiceConnectionMeta, getVoiceMuteMeta } from '../components/ui/voiceActions';
import { getAiChatActionMeta, getAiDiagramActionMeta } from '../components/ui/aiActions';
import { CANVAS_TOOL_DEFINITIONS, getHandToggleMeta } from '../components/ui/toolActions';

export type WhiteboardActionId =
  | 'sidebar'
  | 'selectAll'
  | 'undo'
  | 'redo'
  | 'exportPng'
  | 'clearBoard'
  | 'rooms'
  | 'share'
  | 'shareGoLive'
  | 'admin'
  | 'aiDiagram'
  | 'aiChat'
  | 'aiRevisions'
  | 'aiUndo'
  | 'aiRedo'
  | 'voiceToggle'
  | 'voiceMute'
  | 'recordings'
  | 'shortcuts'
  | 'theme'
  | 'snapGrid'
  | 'profile'
  | 'auth'
  | 'account'
  | 'about';

export interface WhiteboardAction {
  id: WhiteboardActionId;
  label: string;
  shortLabel?: string;
  ariaLabel: string;
  title: string;
  icon: LucideIcon;
  shortcut?: string;
  active?: boolean;
  pressed?: boolean;
  disabled: boolean;
  handler: () => void;
}

export interface WhiteboardToolAction {
  id: `tool-${ToolType}`;
  tool: ToolType;
  label: string;
  shortLabel: string;
  shortcut: string;
  title: string;
  icon: LucideIcon;
  needsWrite: boolean;
  active: boolean;
  disabled: boolean;
  handler: () => void;
}

export interface WhiteboardHandToggleAction {
  id: string;
  ariaLabel: string;
  title: string;
  icon: LucideIcon;
  active: boolean;
  disabled: boolean;
  handler: () => void;
}

export interface WhiteboardActionRegistry {
  actions: Record<WhiteboardActionId, WhiteboardAction>;
  tools: WhiteboardToolAction[];
  toolsById: Record<ToolType, WhiteboardToolAction>;
  handToggle: WhiteboardHandToggleAction;
  selectTool: (tool: ToolType) => void;
}

export interface UseWhiteboardActionsParams {
  currentTool: ToolType;
  theme: ThemeMode;
  canWrite: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canUndoAi: boolean;
  canRedoAi: boolean;
  isMultiplayer: boolean;
  isSoloMode: boolean;
  isHost: boolean;
  isSignedIn: boolean;
  isVoiceConnected: boolean;
  isMuted: boolean;
  isAiChatOpen: boolean;
  isSidebarOpen: boolean;
  snapToGrid?: boolean;
  onSelectTool: (tool: ToolType) => void;
  onToggleTheme: () => void;
  onToggleSnapToGrid?: () => void;
  onSelectAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onRequestClear: () => void;
  onOpenRooms: () => void;
  onOpenShare: () => void;
  onShareAndGoLive: () => void;
  onOpenAdmin: () => void;
  onOpenAiDiagram: () => void;
  onToggleAiChat: () => void;
  onOpenAiRevisions: () => void;
  onUndoAi: () => void;
  onRedoAi: () => void;
  onToggleSidebar: () => void;
  onToggleVoice: () => void;
  onToggleMute: () => void;
  onOpenRecordings: () => void;
  onOpenShortcuts: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenAbout: () => void;
}

/**
 * Single source of truth for global whiteboard action metadata, disabled state,
 * shortcuts, icons, and handlers across Header, Sidebar, Toolbar, and Canvas.
 */
export function useWhiteboardActions({
  currentTool,
  theme,
  canWrite,
  canUndo,
  canRedo,
  canUndoAi,
  canRedoAi,
  isMultiplayer,
  isSoloMode,
  isHost,
  isSignedIn,
  isVoiceConnected,
  isMuted,
  isAiChatOpen,
  isSidebarOpen,
  snapToGrid = false,
  onSelectTool,
  onToggleTheme,
  onToggleSnapToGrid,
  onSelectAll,
  onUndo,
  onRedo,
  onExport,
  onRequestClear,
  onOpenRooms,
  onOpenShare,
  onShareAndGoLive,
  onOpenAdmin,
  onOpenAiDiagram,
  onToggleAiChat,
  onOpenAiRevisions,
  onUndoAi,
  onRedoAi,
  onToggleSidebar,
  onToggleVoice,
  onToggleMute,
  onOpenRecordings,
  onOpenShortcuts,
  onOpenProfile,
  onOpenAuth,
  onOpenAbout,
}: UseWhiteboardActionsParams): WhiteboardActionRegistry {
  return useMemo(() => {
    const tools: WhiteboardToolAction[] = CANVAS_TOOL_DEFINITIONS.map((def) => {
      const disabled = def.needsWrite && !canWrite;
      return {
        id: `tool-${def.tool}`,
        tool: def.tool,
        label: def.label,
        shortLabel: def.shortLabel,
        shortcut: def.shortcut,
        title: disabled ? 'Drawing restricted' : def.title,
        icon: def.icon,
        needsWrite: def.needsWrite,
        active: currentTool === def.tool && !disabled,
        disabled,
        handler: () => onSelectTool(def.tool),
      };
    });

    const toolsById = Object.fromEntries(
      tools.map((entry) => [entry.tool, entry])
    ) as Record<ToolType, WhiteboardToolAction>;

    const handMeta = getHandToggleMeta(currentTool === 'hand', canWrite);
    const handToggle: WhiteboardHandToggleAction = {
      id: 'zoom-hand-toggle-btn',
      ariaLabel: handMeta.ariaLabel,
      title: handMeta.title,
      icon: handMeta.Icon,
      active: handMeta.isHandTool,
      disabled: false,
      handler: () => onSelectTool(currentTool === 'hand' ? handMeta.fallbackTool : 'hand'),
    };

    const aiDiagramMeta = getAiDiagramActionMeta(canWrite);
    const aiChatMeta = getAiChatActionMeta(isAiChatOpen);
    const voiceConnectionMeta = getVoiceConnectionMeta(isVoiceConnected);
    const voiceMuteMeta = getVoiceMuteMeta(isMuted);
    const themeMeta = getThemeToggleMeta(theme);

    const profileAction: WhiteboardAction = {
      id: 'profile',
      label: 'Profile',
      shortLabel: 'Profile',
      ariaLabel: 'Open account profile',
      title: 'Account profile & identity',
      icon: UserRound,
      disabled: false,
      handler: onOpenProfile,
    };

    const authAction: WhiteboardAction = {
      id: 'auth',
      label: 'Sign In',
      shortLabel: 'Sign In',
      ariaLabel: 'Sign in or register',
      title: 'Sign in or register to save your rooms',
      icon: LogIn,
      disabled: false,
      handler: onOpenAuth,
    };

    const actions: Record<WhiteboardActionId, WhiteboardAction> = {
      sidebar: {
        id: 'sidebar',
        label: isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar',
        shortLabel: isSidebarOpen ? 'Close' : 'Menu',
        ariaLabel: isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar',
        title: isSidebarOpen ? 'Collapse sidebar (Esc)' : 'Open navigation menu',
        icon: isSidebarOpen ? PanelLeftClose : Menu,
        active: isSidebarOpen,
        pressed: isSidebarOpen,
        disabled: false,
        handler: onToggleSidebar,
      },
      selectAll: {
        id: 'selectAll',
        label: 'Select All',
        shortLabel: 'Select All',
        ariaLabel: 'Select All',
        title: 'Select All (Ctrl+A) — Select all elements on the canvas',
        icon: CheckSquare,
        shortcut: 'Ctrl+A',
        disabled: false,
        handler: onSelectAll,
      },
      undo: {
        id: 'undo',
        label: 'Undo',
        shortLabel: 'Undo',
        ariaLabel: 'Undo',
        title: 'Undo (Ctrl+Z)',
        icon: Undo2,
        shortcut: 'Ctrl+Z',
        disabled: !canUndo || !canWrite,
        handler: onUndo,
      },
      redo: {
        id: 'redo',
        label: 'Redo',
        shortLabel: 'Redo',
        ariaLabel: 'Redo',
        title: 'Redo (Ctrl+Shift+Z)',
        icon: Redo2,
        shortcut: 'Ctrl+Shift+Z',
        disabled: !canRedo || !canWrite,
        handler: onRedo,
      },
      exportPng: {
        id: 'exportPng',
        label: 'Export & Download',
        shortLabel: 'Export',
        ariaLabel: 'Export and download whiteboard',
        title: 'Preview and export whiteboard as PNG, SVG, JPEG, WebP, or JSON (Ctrl+Shift+E)',
        icon: Download,
        shortcut: 'Ctrl+Shift+E',
        disabled: false,
        handler: onExport,
      },
      clearBoard: {
        id: 'clearBoard',
        label: isMultiplayer ? 'Vote Clear' : 'Clear Board',
        shortLabel: isMultiplayer ? 'Vote Clear' : 'Clear Board',
        ariaLabel: isMultiplayer ? 'Vote Clear' : 'Clear Board',
        title: !canWrite
          ? 'Clearing board is restricted'
          : isMultiplayer
          ? 'Vote to clear whiteboard with room'
          : 'Clear whiteboard',
        icon: Trash2,
        disabled: !canWrite,
        handler: onRequestClear,
      },
      rooms: {
        id: 'rooms',
        label: 'Rooms',
        shortLabel: 'Rooms',
        ariaLabel: 'Choose or create a room',
        title: isSoloMode
          ? 'Personal Canvas (Private). Click to browse sessions or create a room'
          : 'Click to view sessions or create a new room',
        icon: Users,
        disabled: false,
        handler: onOpenRooms,
      },
      share: {
        id: 'share',
        label: 'Share Board',
        shortLabel: 'Share',
        ariaLabel: 'Share room code or invite link',
        title: 'Share room code or invite link',
        icon: Share2,
        disabled: false,
        handler: onOpenShare,
      },
      shareGoLive: {
        id: 'shareGoLive',
        label: 'Share & Go Live',
        shortLabel: 'Share & Go Live',
        ariaLabel: 'Share and go live',
        title: 'Convert this solo canvas to a collaborative room and invite friends',
        icon: Radio,
        disabled: false,
        handler: onShareAndGoLive,
      },
      admin: {
        id: 'admin',
        label: 'Admin Settings',
        shortLabel: 'Admin',
        ariaLabel: 'Open room host admin settings',
        title: 'Room Host Admin Settings',
        icon: Shield,
        disabled: !isHost,
        handler: onOpenAdmin,
      },
      aiDiagram: {
        id: 'aiDiagram',
        label: aiDiagramMeta.label,
        shortLabel: aiDiagramMeta.compactLabel,
        ariaLabel: aiDiagramMeta.ariaLabel,
        title: aiDiagramMeta.title,
        icon: aiDiagramMeta.Icon,
        disabled: aiDiagramMeta.disabled,
        handler: onOpenAiDiagram,
      },
      aiChat: {
        id: 'aiChat',
        label: aiChatMeta.label,
        shortLabel: aiChatMeta.compactLabel,
        ariaLabel: aiChatMeta.ariaLabel,
        title: aiChatMeta.title,
        icon: aiChatMeta.Icon,
        active: isAiChatOpen,
        pressed: isAiChatOpen,
        disabled: false,
        handler: onToggleAiChat,
      },
      aiRevisions: {
        id: 'aiRevisions',
        label: 'AI Revisions',
        shortLabel: 'AI Revisions',
        ariaLabel: 'Open AI diagram revision history',
        title: 'Browse AI diagram revisions saved in this room',
        icon: History,
        disabled: isSoloMode,
        handler: onOpenAiRevisions,
      },
      aiUndo: {
        id: 'aiUndo',
        label: 'Undo AI Revision',
        shortLabel: 'Undo AI',
        ariaLabel: 'Undo the last AI revision',
        title: 'Undo the last AI diagram change without touching manual edits',
        icon: Undo2,
        disabled: !canUndoAi || !canWrite,
        handler: onUndoAi,
      },
      aiRedo: {
        id: 'aiRedo',
        label: 'Redo AI Revision',
        shortLabel: 'Redo AI',
        ariaLabel: 'Redo the last AI revision',
        title: 'Redo the last AI diagram change',
        icon: Redo2,
        disabled: !canRedoAi || !canWrite,
        handler: onRedoAi,
      },
      voiceToggle: {
        id: 'voiceToggle',
        label: voiceConnectionMeta.label,
        shortLabel: voiceConnectionMeta.shortLabel,
        ariaLabel: voiceConnectionMeta.ariaLabel,
        title: voiceConnectionMeta.title,
        icon: voiceConnectionMeta.Icon,
        active: isVoiceConnected,
        pressed: isVoiceConnected,
        disabled: voiceConnectionMeta.disabled,
        handler: onToggleVoice,
      },
      voiceMute: {
        id: 'voiceMute',
        label: voiceMuteMeta.label,
        shortLabel: voiceMuteMeta.label,
        ariaLabel: voiceMuteMeta.ariaLabel,
        title: voiceMuteMeta.title,
        icon: voiceMuteMeta.Icon,
        active: isMuted,
        pressed: isMuted,
        disabled: voiceMuteMeta.disabled,
        handler: onToggleMute,
      },
      recordings: {
        id: 'recordings',
        label: 'Recordings',
        shortLabel: 'Recordings',
        ariaLabel: 'Open voice recordings',
        title: isSoloMode
          ? 'Voice recordings are available in collaborative rooms'
          : 'Browse and replay voice recordings saved to this room',
        icon: Mic,
        disabled: isSoloMode,
        handler: onOpenRecordings,
      },
      shortcuts: {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        shortLabel: 'Shortcuts',
        ariaLabel: 'Open keyboard shortcuts',
        title: 'Keyboard shortcuts (?)',
        icon: Keyboard,
        shortcut: '?',
        disabled: false,
        handler: onOpenShortcuts,
      },
      theme: {
        id: 'theme',
        label: themeMeta.label,
        shortLabel: themeMeta.label,
        ariaLabel: themeMeta.actionLabel,
        title: themeMeta.actionLabel,
        icon: themeMeta.Icon,
        disabled: false,
        handler: onToggleTheme,
      },
      snapGrid: {
        id: 'snapGrid',
        label: snapToGrid ? 'Grid Snap: On' : 'Grid Snap: Off',
        shortLabel: 'Grid Snap',
        ariaLabel: snapToGrid ? 'Disable grid snapping' : 'Enable grid snapping',
        title: 'Toggle grid snapping when dragging elements',
        icon: Magnet,
        active: snapToGrid,
        pressed: snapToGrid,
        disabled: false,
        handler: onToggleSnapToGrid ?? (() => {}),
      },
      profile: profileAction,
      auth: authAction,
      account: {
        ...(isSignedIn ? profileAction : authAction),
        id: 'account',
      },
      about: {
        id: 'about',
        label: 'About Whiteboard.io',
        shortLabel: 'About',
        ariaLabel: 'About Whiteboard.io',
        title: "About Whiteboard.io & Why It's Different",
        icon: Info,
        disabled: false,
        handler: onOpenAbout,
      },
    };

    return {
      actions,
      tools,
      toolsById,
      handToggle,
      selectTool: onSelectTool,
    };
  }, [
    currentTool,
    theme,
    canWrite,
    canUndo,
    canRedo,
    canUndoAi,
    canRedoAi,
    isMultiplayer,
    isSoloMode,
    isHost,
    isSignedIn,
    isVoiceConnected,
    isMuted,
    isAiChatOpen,
    isSidebarOpen,
    snapToGrid,
    onSelectTool,
    onToggleTheme,
    onToggleSnapToGrid,
    onSelectAll,
    onUndo,
    onRedo,
    onExport,
    onRequestClear,
    onOpenRooms,
    onOpenShare,
    onShareAndGoLive,
    onOpenAdmin,
    onOpenAiDiagram,
    onToggleAiChat,
    onOpenAiRevisions,
    onUndoAi,
    onRedoAi,
    onToggleSidebar,
    onToggleVoice,
    onToggleMute,
    onOpenRecordings,
    onOpenShortcuts,
    onOpenProfile,
    onOpenAuth,
    onOpenAbout,
  ]);
}
