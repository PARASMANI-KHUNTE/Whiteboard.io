import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ToolType,
  ShapeType,
  CanvasElement,
  DrawingStroke,
  TextElement,
  ShapeElement,
  WireElement,
  WireStyle,
} from './types';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { useVoiceChat } from './hooks/useVoiceChat';
import { useTheme } from './hooks/useTheme';
import { useModalA11y } from './hooks/useModalA11y';
import { useTouchPointerBridge } from './hooks/useTouchPointerBridge';
import { useWhiteboardActions } from './hooks/useWhiteboardActions';
import { useAttributionHover } from './hooks/useAttributionHover';
import { useBlameMode } from './hooks/useBlameMode';
import { AttributionTooltip } from './components/ui/AttributionTooltip';
import { BlameModeLegend } from './components/ui/BlameModeLegend';
import { FloatingToolDock } from './components/ui/FloatingToolDock';
import { EmptyCanvasGuide } from './components/ui/EmptyCanvasGuide';
import { CommandPaletteModal, type CommandPaletteItem } from './components/CommandPaletteModal';
import { ActivityTimelineDrawer } from './components/ActivityTimelineDrawer';
import { VersionHistoryPanel } from './components/VersionHistoryPanel';
import {
  appendActivityEntry,
  buildInitialActivityFromElements,
  describeElementKind,
  boardEventToActivityEntry,
  type ActivityEntry,
} from './utils/activityFeed';
import type { BoardSnapshotDetail, BoardSnapshotMeta } from './utils/boardSnapshots';
import { apiFetchJson } from './utils/apiFetch';
import { Header } from './components/Header';
import Sidebar from './components/Sidebar';
import { Canvas } from './components/Canvas';
import { VoteToClearModal } from './components/VoteToClearModal';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/AccountPanel';
import { AboutModal } from './components/AboutModal';
import { CreateRoomModal } from './components/CreateRoomModal';
import { ShareRoomModal } from './components/ShareRoomModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { SessionLauncherModal } from './components/SessionLauncherModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { ConfirmModal } from './components/ConfirmModal';
import { ExportModal } from './components/ExportModal';
import { AiGenerateModal } from './components/AiGenerateModal';
import { AiChatPanel } from './components/AiChatPanel';
import { WelcomeHintToast } from './components/WelcomeHintToast';
import { getAiChatActionMeta } from './components/ui/aiActions';
import { fetchAiEngine } from './ai/api';
import { formatAiEngineDisplay } from './ai/providerLabels';
import { buildGlobalAiContext } from './ai/sessionContext';
import { diffAiElements, type AiElementDiffResult } from './ai/elementDiff';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Info, AlertCircle, CheckCircle2, UserX, X, History, Clock } from 'lucide-react';
import { isColorBlack, isColorWhite } from './utils/themeColors';
import { shouldRecolorBoardOnThemeToggle } from './utils/themeBoardEdit';
import type { ExportViewportInfo } from './utils/exportTypes';
import {
  BoardAiLedger,
  EMPTY_BOARD_AI_LEDGER,
  PreferredAiEngine,
  loadAiSession,
  loadBoardAiLedger,
  loadPreferredAiEngine,
  saveAiSession,
  saveBoardAiLedger,
  savePreferredAiEngine,
  clearAiSession,
  clearBoardAiLedger,
} from './utils/aiSessionStorage';
import { forgetRecentRoom, rememberRecentRoom } from './utils/recentRooms';
import { subscribeToSessionExpired } from './utils/authSession';
import type { AiDiagramPayload, AiEngineConfig, AiSessionState } from './ai/types';

/** A reversible local edit recorded for Ctrl+Z / Ctrl+Shift+Z. */
type HistoryOperation =
  | { kind: 'create'; elements: CanvasElement[]; cascadeDeleted?: CanvasElement[]; at: number }
  | { kind: 'delete'; elements: CanvasElement[]; at: number }
  | { kind: 'update'; before: CanvasElement[]; after: CanvasElement[]; at: number }
  | {
      /** A single AI turn: creations, deletions and updates applied atomically. */
      kind: 'batch';
      created: CanvasElement[];
      deleted: CanvasElement[];
      /** Wires attached to `created` that undo had to remove as well. */
      cascadeDeleted?: CanvasElement[];
      before: CanvasElement[];
      after: CanvasElement[];
      at: number;
    };

/** Wires attached to a created element that a cascading undo must remove. */
function collectCascadeWires(
  elements: Record<string, CanvasElement>,
  created: CanvasElement[],
  excluded: CanvasElement[] = []
): WireElement[] {
  const createdIds = new Set(created.map((element) => element.id));
  const excludedIds = new Set(excluded.map((element) => element.id));
  return Object.values(elements).filter(
    (element): element is WireElement =>
      element.type === 'wire' &&
      !excludedIds.has(element.id) &&
      (createdIds.has(element.fromId) || createdIds.has(element.toId))
  );
}

const HISTORY_LIMIT = 100;

export default function App() {
  // Theme hook
  const { theme, toggleTheme } = useTheme();

  // Let touch/pen gestures drive the mouse-based object manipulation handlers.
  useTouchPointerBridge();

  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState<string>(() => (theme === 'dark' ? '#ffffff' : '#0f172a'));
  const [currentSize, setCurrentSize] = useState<number>(3); // Fine default
  const [selectedShapeType, setSelectedShapeType] = useState<ShapeType>('rectangle');
  const [selectedIconName, setSelectedIconName] = useState<string>('star');
  const [selectedWireStyle, setSelectedWireStyle] = useState<WireStyle>('curve');
  const [showWelcomeHint, setShowWelcomeHint] = useState<boolean>(true);
  const [showEmptyGuide, setShowEmptyGuide] = useState<boolean>(true);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState<boolean>(false);
  const [showActivityTimeline, setShowActivityTimeline] = useState<boolean>(false);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState<boolean>(false);
  const [showVersionHistory, setShowVersionHistory] = useState<boolean>(false);
  const [boardSnapshots, setBoardSnapshots] = useState<BoardSnapshotMeta[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<BoardSnapshotDetail | null>(null);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState<boolean>(false);
  const [hasChosenSessionMode, setHasChosenSessionMode] = useState<boolean>(false);

  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [showAboutModal, setShowAboutModal] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [aiSession, setAiSession] = useState<AiSessionState | null>(null);
  const [isAiChatOpen, setIsAiChatOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  );
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);

  // Lets shared CSS lift bottom chrome above the mobile AI chat sheet.
  useEffect(() => {
    document.documentElement.dataset.aiChatOpen = String(isAiChatOpen);
    return () => {
      delete document.documentElement.dataset.aiChatOpen;
    };
  }, [isAiChatOpen]);

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const kickedDialogRef = useRef<HTMLDivElement>(null);
  const selectAllHandlerRef = useRef<(() => void) | null>(null);
  const navigateToElementsRef = useRef<((elements: CanvasElement[]) => void) | null>(null);
  const highlightElementsRef = useRef<
    ((
      elements: CanvasElement[],
      options?: { navigateIfHidden?: boolean; durationMs?: number; badgeLabel?: string }
    ) => void) | null
  >(null);
  const getWorldCenterRef = useRef<(() => { x: number; y: number }) | null>(null);
  const getViewportRef = useRef<(() => { pan: { x: number; y: number }; zoom: number }) | null>(null);

  // Authentication hook
  const {
    authUser,
    token,
    isLoading: isAuthLoading,
    authError,
    myRooms,
    login,
    register,
    continueAsGuest,
    logout,
    signInWithGoogle,
    fetchRooms,
    createRoom,
    deleteRoom,
  } = useAuth();

  // Real-time WebSocket connection hook
  const {
    roomId,
    isSoloMode,
    convertToMultiplayerRoom,
    roomName,
    creatorName,
    isLocked,
    canWrite,
    isKicked,
    kickedReason,
    currentUser,
    isHost,
    isConnected,
    elements,
    users,
    liveStrokes,
    voteToClear,
    notifications,
    boardClearCount,
    emitStrokeLiveStart,
    emitStrokeLivePoint,
    emitElementCreate,
    emitElementUpdate,
    emitElementDelete,
    emitElementsBatchCreate,
    emitElementsBatchDelete,
    emitCursorMove,
    emitAudioLevel,
    emitVoteClearStart,
    emitVoteClearCast,
    emitVoteClearCancel,
    emitClearBoardDirect,
    emitRestoreSnapshot,
    setParticipantPermission,
    kickParticipant,
    toggleLockBoard,
    resetKickedState,
    updateUserName,
    updateUserColor,
    switchRoom,
    addNotification,
    dismissNotification,
    socket,
  } = useSocket(undefined, authUser, token);

  // Attribution: blame mode + hover tooltip
  const { blameMode, toggleBlameMode, legendUsers, blameColorFor } = useBlameMode(elements, users);
  const {
    hovered: attributionHovered,
    onElementMouseEnter: onAttributionEnter,
    onElementMouseLeave: onAttributionLeave,
  } = useAttributionHover();

  // Stop following if the target user disconnects or leaves the room.
  useEffect(() => {
    if (followingUserId && !users[followingUserId]) {
      setFollowingUserId(null);
    }
  }, [followingUserId, users]);

  const handleToggleFollowUser = useCallback((targetUserId: string) => {
    setFollowingUserId((prev) => (prev === targetUserId ? null : targetUserId));
  }, []);

  // Seed / reset activity timeline when entering a room or restoring initial elements.
  const activitySeededRoomRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (activitySeededRoomRef.current !== roomId) {
      activitySeededRoomRef.current = roomId;
      setActivityEntries(buildInitialActivityFromElements(elements, users));
      return;
    }
    if (Object.keys(elements).length > 0 && activityEntries.length === 0) {
      setActivityEntries(buildInitialActivityFromElements(elements, users));
    }
  }, [roomId, elements, users, activityEntries.length]);

  // Append remote collaboration & clear events to the Activity Timeline.
  useEffect(() => {
    if (!socket) return;
    const onRemoteCreate = (el: CanvasElement) => {
      const attr = el.attribution;
      setActivityEntries((prev) =>
        appendActivityEntry(prev, {
          id: `create_${el.id}_${Date.now()}`,
          userId: attr?.lastModifiedBy ?? el.userId,
          userName: attr?.lastModifiedByName ?? ('userName' in el ? el.userName : undefined) ?? 'Collaborator',
          userColor: attr?.lastModifiedByColor ?? '#3b82f6',
          action: 'created',
          summary: `Added ${describeElementKind(el)}`,
          elementId: el.id,
          timestamp: attr?.lastModifiedAt ?? Date.now(),
        })
      );
    };
    const onRemoteUpdate = (el: CanvasElement) => {
      const attr = el.attribution;
      setActivityEntries((prev) =>
        appendActivityEntry(prev, {
          id: `edit_${el.id}_${Date.now()}`,
          userId: attr?.lastModifiedBy ?? el.userId,
          userName: attr?.lastModifiedByName ?? ('userName' in el ? el.userName : undefined) ?? 'Collaborator',
          userColor: attr?.lastModifiedByColor ?? '#3b82f6',
          action: 'edited',
          summary: `Edited ${describeElementKind(el)}`,
          elementId: el.id,
          timestamp: attr?.lastModifiedAt ?? Date.now(),
        })
      );
    };
    const onRemoteBatchCreate = (batch: CanvasElement[]) => {
      if (!Array.isArray(batch) || batch.length === 0) return;
      const first = batch[0];
      const attr = first.attribution;
      setActivityEntries((prev) =>
        appendActivityEntry(prev, {
          id: `batch_${first.id}_${Date.now()}`,
          userId: attr?.lastModifiedBy ?? first.userId,
          userName: attr?.lastModifiedByName ?? 'Collaborator',
          userColor: attr?.lastModifiedByColor ?? '#6366f1',
          action: 'created',
          summary: `Added ${batch.length} element${batch.length === 1 ? '' : 's'}`,
          elementId: first.id,
          timestamp: attr?.lastModifiedAt ?? Date.now(),
        })
      );
    };
    const onBoardCleared = (info: { initiatorName: string; clearedBy?: { userId: string; name: string } }) => {
      setActivityEntries((prev) =>
        appendActivityEntry(prev, {
          id: `clear_${Date.now()}`,
          userId: info.clearedBy?.userId ?? 'system',
          userName: info.clearedBy?.name ?? info.initiatorName ?? 'Host',
          userColor: '#e11d48',
          action: 'cleared',
          summary: 'Cleared the whiteboard',
          timestamp: Date.now(),
        })
      );
    };
    const onRemoteDelete = (payload: { elementId: string }) => {
      if (!payload?.elementId) return;
      const target = elementsRef.current[payload.elementId];
      setActivityEntries((prev) =>
        appendActivityEntry(prev, {
          id: `del_${payload.elementId}_${Date.now()}`,
          userId: 'collaborator',
          userName: 'Collaborator',
          userColor: '#ef4444',
          action: 'deleted',
          summary: `Deleted ${target ? describeElementKind(target) : 'element'}`,
          elementId: payload.elementId,
          timestamp: Date.now(),
        })
      );
    };
    const onRemoteBatchDelete = (payload: { elementIds: string[] }) => {
      if (!Array.isArray(payload?.elementIds) || payload.elementIds.length === 0) return;
      setActivityEntries((prev) =>
        appendActivityEntry(prev, {
          id: `batch_del_${Date.now()}`,
          userId: 'collaborator',
          userName: 'Collaborator',
          userColor: '#ef4444',
          action: 'deleted',
          summary: `Deleted ${payload.elementIds.length} element${payload.elementIds.length === 1 ? '' : 's'}`,
          timestamp: Date.now(),
        })
      );
    };
    const onBoardEvent = (event: any) => {
      if (!event || !event.type) return;
      const entry = boardEventToActivityEntry(event);
      setActivityEntries((prev) => appendActivityEntry(prev, entry));
    };

    socket.on('element-created', onRemoteCreate);
    socket.on('element-updated', onRemoteUpdate);
    socket.on('elements-batch-created', onRemoteBatchCreate);
    socket.on('element-deleted', onRemoteDelete);
    socket.on('elements-batch-deleted', onRemoteBatchDelete);
    socket.on('board-cleared', onBoardCleared);
    socket.on('board-event', onBoardEvent);
    return () => {
      socket.off('element-created', onRemoteCreate);
      socket.off('element-updated', onRemoteUpdate);
      socket.off('elements-batch-created', onRemoteBatchCreate);
      socket.off('element-deleted', onRemoteDelete);
      socket.off('elements-batch-deleted', onRemoteBatchDelete);
      socket.off('board-cleared', onBoardCleared);
      socket.off('board-event', onBoardEvent);
    };
  }, [socket]);

  // Load durable change log events from server when activity timeline is opened
  useEffect(() => {
    if (!showActivityTimeline || !roomId) return;
    let cancelled = false;
    setIsLoadingActivity(true);
    apiFetchJson<{ success: boolean; events: any[] }>(`/api/rooms/${encodeURIComponent(roomId)}/events?limit=80`)
      .then((res) => {
        if (cancelled || !res.success || !Array.isArray(res.events)) return;
        const fetchedEntries = res.events.map(boardEventToActivityEntry);
        setActivityEntries((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const novel = fetchedEntries.filter((e) => !existingIds.has(e.id));
          return [...prev, ...novel].sort((a, b) => b.timestamp - a.timestamp).slice(0, 80);
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingActivity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showActivityTimeline, roomId]);

  // Load durable snapshots when the version history panel opens.
  useEffect(() => {
    if (!showVersionHistory || !roomId) return;
    let cancelled = false;
    setIsLoadingSnapshots(true);
    apiFetchJson<{ success: boolean; snapshots: BoardSnapshotMeta[] }>(
      `/api/rooms/${encodeURIComponent(roomId)}/snapshots?limit=20`
    )
      .then((res) => {
        if (cancelled || !res.success || !Array.isArray(res.snapshots)) return;
        setBoardSnapshots(res.snapshots);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingSnapshots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showVersionHistory, roomId]);

  // A restore completes (or fails) asynchronously; always clear the local busy flag.
  useEffect(() => {
    if (!socket) return;
    const onRestored = () => setIsRestoringSnapshot(false);
    const onError = () => setIsRestoringSnapshot(false);
    socket.on('board-restored', onRestored);
    socket.on('snapshot-error', onError);
    return () => {
      socket.off('board-restored', onRestored);
      socket.off('snapshot-error', onError);
    };
  }, [socket]);

  const handlePreviewSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!roomId) return;
      try {
        const res = await apiFetchJson<{ success: boolean; snapshot: BoardSnapshotDetail }>(
          `/api/rooms/${encodeURIComponent(roomId)}/snapshots/${encodeURIComponent(snapshotId)}`
        );
        if (res.success && res.snapshot) setSelectedSnapshot(res.snapshot);
      } catch {
        // The hook's snapshot-error/session handling covers user feedback.
      }
    },
    [roomId]
  );

  const handleRequestRestoreSnapshot = useCallback(
    (snapshot: BoardSnapshotMeta) => {
      if (!isHost || !roomId) return;
      setConfirmModalState({
        isOpen: true,
        title: 'Restore this version?',
        message: `This replaces the board for everyone with the version saved at ${new Date(snapshot.timestamp).toLocaleString()}. The restore is recorded in the activity timeline.`,
        confirmText: 'Restore for everyone',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: () => {
          if (emitRestoreSnapshot(snapshot.id)) setIsRestoringSnapshot(true);
          setSelectedSnapshot(null);
        },
      });
    },
    [emitRestoreSnapshot, isHost, roomId]
  );

  // Global Ctrl+K / Cmd+K launcher for Command Palette.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Surface session expiry from REST/AI/socket callers. useAuth performs the
  // actual recovery; this only keeps the user informed.
  useEffect(() => subscribeToSessionExpired((detail) => {
    addNotification(detail.reason, detail.recoverable ? 'info' : 'warning');
  }), [addNotification]);

  useEffect(() => {
    if (authError) addNotification(authError, 'warning');
  }, [authError, addNotification]);

  // Keep the latest element map available to undo/redo without re-creating
  // callbacks on every room update.
  const elementsRef = useRef<Record<string, CanvasElement>>(elements);
  elementsRef.current = elements;

  // Mirrors the server rule: the host or the sole participant may clear a
  // board without going through the vote-to-clear flow.
  const canDirectClear = isSoloMode || isHost || Object.keys(users).length <= 1;

  // AI chat is persisted per board (room code, or "solo") so a reload brings
  // back the same conversation and diagram context.
  const aiBoardKey = roomId || 'solo';
  const aiBoardKeyRef = useRef(aiBoardKey);
  aiBoardKeyRef.current = aiBoardKey;

  // Async AI results must be checked against refs, not a callback closure: a
  // stale onApplyTurn from the previous room would otherwise pass its own old
  // `aiSession` check and write into the new room (#68).
  const aiSessionRef = useRef<AiSessionState | null>(aiSession);
  aiSessionRef.current = aiSession;

  const [boardAiLedger, setBoardAiLedger] = useState<BoardAiLedger>(EMPTY_BOARD_AI_LEDGER);
  const boardAiLedgerRef = useRef<BoardAiLedger>(boardAiLedger);
  boardAiLedgerRef.current = boardAiLedger;
  const [aiEngineConfig, setAiEngineConfig] = useState<AiEngineConfig | null>(null);
  const [preferredAiEngine, setPreferredAiEngine] = useState<PreferredAiEngine>(() =>
    loadPreferredAiEngine()
  );

  const handleChangePreferredAiEngine = useCallback((next: PreferredAiEngine) => {
    setPreferredAiEngine(next);
    savePreferredAiEngine(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAiEngine(controller.signal)
      .then((cfg) => {
        if (cfg && !controller.signal.aborted) setAiEngineConfig(cfg);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [showAiModal, isAiChatOpen]);

  const applyAiSession = useCallback((next: AiSessionState | null) => {
    setAiSession(next);
    const key = aiBoardKeyRef.current;
    if (next) {
      saveAiSession(key, next);
    } else {
      clearAiSession(key);
    }
  }, []);

  const applyBoardAiLedger = useCallback((next: BoardAiLedger) => {
    setBoardAiLedger(next);
    const key = aiBoardKeyRef.current;
    if (next.diagrams.length === 0 && next.turns.length === 0) {
      clearBoardAiLedger(key);
    } else {
      saveBoardAiLedger(key, next);
    }
  }, []);

  const recordBoardAiTurn = useCallback(
    (
      payload: AiDiagramPayload,
      userText: string | undefined,
      assistantText: string
    ) => {
      const prev = boardAiLedgerRef.current;
      const now = Date.now();
      const nextDiagrams = [
        ...prev.diagrams.filter((d) => d.sessionId !== payload.sessionId),
        {
          sessionId: payload.sessionId,
          title: payload.title,
          type: payload.type,
          summary: payload.summary,
          provider: payload.provider,
          model: payload.model,
          nodeCount: payload.graph.nodes.length,
          updatedAt: now,
        },
      ].slice(-6);

      const newTurns = [
        ...(userText
          ? [
              {
                role: 'user' as const,
                content: userText,
                diagramTitle: payload.title,
                at: now,
              },
            ]
          : []),
        {
          role: 'assistant' as const,
          content: assistantText,
          provider: payload.provider,
          model: payload.model,
          diagramTitle: payload.title,
          at: now + 1,
        },
      ];

      applyBoardAiLedger({
        diagrams: nextDiagrams,
        turns: [...prev.turns, ...newTurns].slice(-16),
        lastProvider: payload.provider ?? prev.lastProvider,
        lastModel: payload.model ?? prev.lastModel,
      });
    },
    [applyBoardAiLedger]
  );

  // An AI "replace board" clears the canvas on purpose and then re-adds the new
  // diagram. The server echoes that clear back to the sender, so guard the
  // "board cleared -> end the AI conversation" logic for a moment afterwards.
  const aiClearGuardUntilRef = useRef(0);

  // Local undo / redo stacks (only edits initiated by this user are recorded)
  const historyPastRef = useRef<HistoryOperation[]>([]);
  const historyFutureRef = useRef<HistoryOperation[]>([]);
  const [, setHistoryVersion] = useState(0);

  const bumpHistory = useCallback(() => {
    setHistoryVersion((version) => version + 1);
  }, []);

  const resetHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    bumpHistory();
  }, [bumpHistory]);

  /**
   * Prevents the next edit from being coalesced into the previous one. Used for
   * discrete actions (such as locking a selection) that should get their own
   * undo step even when they happen immediately after a drag.
   */
  const breakHistory = useCallback(() => {
    const last = historyPastRef.current[historyPastRef.current.length - 1];
    if (last) last.at = 0;
  }, []);

  const pushHistory = useCallback(
    (operation: HistoryOperation) => {
      const past = historyPastRef.current;
      const last = past[past.length - 1];

      // An element created and then immediately moved/edited (alt-drag, typing
      // into a fresh note) should undo as a single "create" step.
      if (
        operation.kind === 'update' &&
        last &&
        last.kind === 'create' &&
        operation.at - last.at < 600 &&
        operation.after.every((element) => last.elements.some((created) => created.id === element.id))
      ) {
        const afterMap = new Map(operation.after.map((element) => [element.id, element]));
        last.elements = last.elements.map((element) => afterMap.get(element.id) ?? element);
        last.at = operation.at;
        historyFutureRef.current = [];
        bumpHistory();
        return;
      }

      // Dragging fires many small updates; merge them into a single undo step.
      if (
        operation.kind === 'update' &&
        last &&
        last.kind === 'update' &&
        operation.at - last.at < 600
      ) {
        const afterMap = new Map(last.after.map((element) => [element.id, element]));
        operation.after.forEach((element) => afterMap.set(element.id, element));
        const beforeMap = new Map(last.before.map((element) => [element.id, element]));
        operation.before.forEach((element) => {
          if (!beforeMap.has(element.id)) beforeMap.set(element.id, element);
        });
        last.after = Array.from(afterMap.values());
        last.before = Array.from(beforeMap.values());
        last.at = operation.at;
      } else {
        past.push(operation);
        if (past.length > HISTORY_LIMIT) past.shift();
      }

      // Any new edit invalidates the redo branch.
      historyFutureRef.current = [];
      bumpHistory();
    },
    [bumpHistory]
  );

  /** Record a board clear as one undoable batch instead of discarding history. */
  const recordBoardClearHistory = useCallback(
    (previous: CanvasElement[]) => {
      if (previous.length === 0) return;
      pushHistory({
        kind: 'batch',
        created: [],
        deleted: previous,
        before: [],
        after: [],
        at: Date.now(),
      });
    },
    [pushHistory]
  );

  const handleLogout = useCallback(async () => {
    await logout();
    addNotification('Logged out successfully. Switched to guest session.', 'info');
  }, [logout, addNotification]);

  const handleDeleteRoom = useCallback(async (targetRoomId: string) => {
    const isCurrent = targetRoomId === roomId;
    // REST is the single deletion path: it validates ownership, persists the
    // deletion, broadcasts `room-deleted`, and detaches sockets (#66). Calling
    // the socket path as well raced it and produced a false failure.
    const res = await deleteRoom(targetRoomId);
    if (res.success) {
      forgetRecentRoom(targetRoomId);
      addNotification(`Room ${targetRoomId} deleted successfully.`, 'success');
      if (isCurrent) {
        switchRoom(null);
      }
    } else {
      addNotification(res.error || `Failed to delete room ${targetRoomId}.`, 'warning');
    }
    return res;
  }, [roomId, deleteRoom, addNotification, switchRoom]);

  // Ownership is derived from the server-issued session token, so callers do
  // not send a spoofable creator identity.
  const handleCreateRoom = useCallback(
    (data: { name: string; customCode?: string; isLocked?: boolean }) => createRoom(data),
    [createRoom]
  );

  // Convert current solo canvas to a collaborative multiplayer room
  const handleShareAndGoLive = useCallback(() => {
    const newRoomCode = convertToMultiplayerRoom();
    setShowShareModal(true);
    addNotification(`Canvas converted to multiplayer room ${newRoomCode}!`, 'success');
  }, [convertToMultiplayerRoom, addNotification]);

  // Theme-aware element and pen color adaptation
  const handleToggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    // 1. Adapt active pen/tool color if it was black or white
    if (nextTheme === 'dark') {
      if (isColorBlack(currentColor)) {
        setCurrentColor('#ffffff');
      }
    } else {
      if (isColorWhite(currentColor)) {
        setCurrentColor('#0f172a');
      }
    }

    // 2. Convert all existing board elements for theme consistency. Viewers
    // only get the display theme; mutating elements would be rejected by the
    // server and desync the local canvas.
    if (shouldRecolorBoardOnThemeToggle(canWrite)) {
      const updatedElements: CanvasElement[] = [];
      Object.values(elements).forEach((el) => {
        let updated: CanvasElement | null = null;

        if (nextTheme === 'dark') {
          // Switching to dark theme: convert black strokes/text/shapes to white
          if (el.type === 'stroke') {
            const s = el as DrawingStroke;
            if (isColorBlack(s.color)) {
              updated = { ...s, color: '#ffffff' };
            }
          } else if (el.type === 'text') {
            const t = el as TextElement;
            if (!t.color || isColorBlack(t.color)) {
              updated = { ...t, color: '#ffffff' };
            }
          } else if (el.type === 'shape') {
            const sh = el as ShapeElement;
            const isBlackStroke = isColorBlack(sh.color);
            const isBlackText = isColorBlack(sh.textColor);
            if (isBlackStroke || isBlackText) {
              updated = {
                ...sh,
                color: isBlackStroke ? '#ffffff' : sh.color,
                textColor: isBlackText ? '#ffffff' : sh.textColor,
                fillColor: sh.fillColor && sh.fillColor.includes('#0f172a') ? '#ffffff15' : sh.fillColor,
              };
            }
          } else if (el.type === 'wire') {
            const w = el as WireElement;
            if (isColorBlack(w.color)) {
              updated = { ...w, color: '#ffffff' };
            }
          }
        } else {
          // Switching to light theme: convert white strokes/text/shapes/wires to charcoal black
          if (el.type === 'stroke') {
            const s = el as DrawingStroke;
            if (isColorWhite(s.color)) {
              updated = { ...s, color: '#0f172a' };
            }
          } else if (el.type === 'text') {
            const t = el as TextElement;
            if (isColorWhite(t.color)) {
              updated = { ...t, color: '#0f172a' };
            }
          } else if (el.type === 'shape') {
            const sh = el as ShapeElement;
            const isWhiteStroke = isColorWhite(sh.color);
            const isWhiteText = isColorWhite(sh.textColor);
            if (isWhiteStroke || isWhiteText) {
              updated = {
                ...sh,
                color: isWhiteStroke ? '#0f172a' : sh.color,
                textColor: isWhiteText ? '#0f172a' : sh.textColor,
                fillColor: sh.fillColor && sh.fillColor.includes('#ffffff') ? '#0f172a15' : sh.fillColor,
              };
            }
          } else if (el.type === 'wire') {
            const w = el as WireElement;
            if (isColorWhite(w.color)) {
              updated = { ...w, color: '#0f172a' };
            }
          }
        }

        if (updated) {
          updatedElements.push(updated);
        }
      });

      if (updatedElements.length > 0) {
        emitElementsBatchCreate(updatedElements);
      }
    }

    // 3. Toggle theme state
    toggleTheme();
  }, [theme, currentColor, elements, canWrite, emitElementsBatchCreate, toggleTheme]);

  // Real-time Collaborative Voice Chat Engine
  const {
    isVoiceConnected,
    isMuted,
    isDeafened,
    volume,
    setVolume,
    audioLevel,
    isSpeaking,
    frequencyData,
    isSimulated,
    error: voiceError,
    clearError: clearVoiceError,
    isIframeRestricted,
    activeSpeakers,
    startVoiceChat,
    leaveVoiceChat,
    toggleMute,
    toggleDeafen,
    toggleSimulated,
    openInNewTab,
  } = useVoiceChat({
    socket,
    currentUser,
    roomId,
    users,
    onNotification: addNotification,
  });

  // Automatically convert Solo Mode to multiplayer room when connecting to voice chat
  const handleJoinVoiceWithSoloCheck = useCallback(async () => {
    if (isSoloMode || !roomId) {
      const newRoomCode = convertToMultiplayerRoom();
      addNotification(`Canvas converted to multiplayer room ${newRoomCode} to enable voice chat!`, 'success');
      setTimeout(() => {
        startVoiceChat();
      }, 200);
      return;
    }
    startVoiceChat();
  }, [isSoloMode, roomId, convertToMultiplayerRoom, addNotification, startVoiceChat]);

  const handleToggleVoice = useCallback(() => {
    if (isVoiceConnected) {
      leaveVoiceChat();
    } else {
      handleJoinVoiceWithSoloCheck();
    }
  }, [isVoiceConnected, leaveVoiceChat, handleJoinVoiceWithSoloCheck]);

  const openAiDiagram = useCallback(() => setShowAiModal(true), []);
  const toggleAiChat = useCallback(() => setIsAiChatOpen((open) => !open), []);
  const closeAiChat = useCallback(() => setIsAiChatOpen(false), []);
  const reopenAiChat = useCallback(() => setIsAiChatOpen(true), []);

  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle local element creation & record it for undo
  const handleElementCreate = useCallback(
    (element: CanvasElement) => {
      if (!canWrite) {
        addNotification('Drawing is restricted by the room host', 'warning');
        return;
      }
      emitElementCreate(element);
      pushHistory({ kind: 'create', elements: [element], at: Date.now() });
      setActivityEntries((prev) =>
        appendActivityEntry(prev, {
          id: `local_create_${element.id}_${Date.now()}`,
          userId: currentUser.id,
          userName: currentUser.name,
          userColor: currentUser.color,
          action: 'created',
          summary: `Added ${describeElementKind(element)}`,
          elementId: element.id,
          timestamp: Date.now(),
        })
      );
    },
    [canWrite, emitElementCreate, addNotification, pushHistory, currentUser.id, currentUser.name, currentUser.color]
  );

  // Element updates (drag, nudge, style changes) are recorded with the pre-edit
  // snapshot so they can be reversed. Rapid updates are coalesced by pushHistory.
  const handleElementUpdate = useCallback(
    (element: CanvasElement) => {
      const before = elementsRef.current[element.id];
      if (before) {
        pushHistory({ kind: 'update', before: [before], after: [element], at: Date.now() });
      }
      emitElementUpdate(element);
      setActivityEntries((prev) =>
        appendActivityEntry(prev, {
          id: `local_edit_${element.id}_${Date.now()}`,
          userId: currentUser.id,
          userName: currentUser.name,
          userColor: currentUser.color,
          action: 'edited',
          summary: `Edited ${describeElementKind(element)}`,
          elementId: element.id,
          timestamp: Date.now(),
        })
      );
    },
    [emitElementUpdate, pushHistory, currentUser.id, currentUser.name, currentUser.color]
  );

  const handleElementDelete = useCallback(
    (elementId: string) => {
      const target = elementsRef.current[elementId];
      if (target) {
        pushHistory({ kind: 'delete', elements: [target], at: Date.now() });
        setActivityEntries((prev) =>
          appendActivityEntry(prev, {
            id: `local_del_${elementId}_${Date.now()}`,
            userId: currentUser.id,
            userName: currentUser.name,
            userColor: currentUser.color,
            action: 'deleted',
            summary: `Deleted ${describeElementKind(target)}`,
            timestamp: Date.now(),
          })
        );
      }
      emitElementDelete(elementId);
    },
    [emitElementDelete, pushHistory, currentUser.id, currentUser.name, currentUser.color]
  );

  const handleElementsBatchCreate = useCallback(
    (newElements: CanvasElement[]) => {
      if (newElements.length === 0) return;
      if (!canWrite) {
        addNotification('Drawing is restricted by the room host', 'warning');
        return;
      }
      emitElementsBatchCreate(newElements);
      pushHistory({ kind: 'create', elements: newElements, at: Date.now() });
    },
    [canWrite, emitElementsBatchCreate, addNotification, pushHistory]
  );

  const handleElementsBatchDelete = useCallback(
    (elementIds: string[]) => {
      const removed = elementIds
        .map((id) => elementsRef.current[id])
        .filter((element): element is CanvasElement => Boolean(element));
      if (removed.length > 0) {
        pushHistory({ kind: 'delete', elements: removed, at: Date.now() });
      }
      emitElementsBatchDelete(elementIds);
    },
    [emitElementsBatchDelete, pushHistory]
  );

  // -------------------------------------------------------------------------
  // AI diagram session
  // -------------------------------------------------------------------------

  /**
   * Apply one AI payload to the canvas by diffing only that session's element
   * group (ids start with `ai_<sessionId>_`). Everything else on the board is
   * left untouched, and the whole turn becomes a single undo step.
   */
  const applyAiElements = useCallback(
    (sessionId: string, nextElements: CanvasElement[]): AiElementDiffResult => {
      const prefix = `ai_${sessionId}_`;
      const current = (Object.values(elementsRef.current) as CanvasElement[]).filter(
        (element) => element && element.id.startsWith(prefix)
      );

      const diff = diffAiElements(current, nextElements);

      if (diff.created.length === 0 && diff.deleted.length === 0 && diff.updated.length === 0) {
        return diff;
      }

      // Delete first so a revision that reuses an id never shows a duplicate.
      if (diff.deleted.length > 0) {
        emitElementsBatchDelete(diff.deleted.map((element) => element.id));
      }
      if (diff.created.length > 0) {
        emitElementsBatchCreate(diff.created);
      }
      diff.updated.forEach((element) => emitElementUpdate(element));

      pushHistory({
        kind: 'batch',
        created: diff.created,
        deleted: diff.deleted,
        before: diff.updatedBefore,
        after: diff.updated,
        at: Date.now(),
      });

      return diff;
    },
    [emitElementsBatchCreate, emitElementsBatchDelete, emitElementUpdate, pushHistory]
  );

  const handleAiGenerated = useCallback(
    async (
      payload: AiDiagramPayload,
      options: { origin: { x: number; y: number }; replaceBoard: boolean },
      context: { boardKey: string; prompt?: string }
    ) => {
      // The modal may have been opened in a different room. Never mutate the
      // room the user switched to while generation was in flight (#68).
      if (context.boardKey !== aiBoardKeyRef.current) return;
      if (!canWrite) {
        addNotification('You do not have permission to edit this board', 'warning');
        return;
      }

      if (options.replaceBoard && !canDirectClear) {
        addNotification('Only the room host can clear a shared board', 'warning');
        return;
      }

      if (options.replaceBoard) {
        aiClearGuardUntilRef.current = Date.now() + 2500;
        // Capture before the server broadcast clears local state, and wait for
        // authorization: a participant may have joined while AI was in flight.
        const previous = Object.values(elementsRef.current) as CanvasElement[];
        const cleared = await emitClearBoardDirect();
        // A room switch can happen while the host-authorization round trip is
        // pending. Bail before applying elements/session to the new board.
        if (context.boardKey !== aiBoardKeyRef.current) return;
        if (cleared) {
          recordBoardClearHistory(previous);
        } else {
          addNotification(
            'Board was not cleared (only the host can clear a shared board); inserted without replacing.',
            'warning'
          );
        }
      }

      const diff = applyAiElements(payload.sessionId, payload.elements);
      const focusElements = diff.focusElements.length > 0 ? diff.focusElements : payload.elements;

      const now = Date.now();
      const assistantContent =
        [payload.summary, payload.notice].filter(Boolean).join('\n\n') ||
        'Your diagram is ready. Tell me what to change.';
      const initialMessages = [
        ...(context.prompt
          ? [
              {
                id: `ai-msg-${now}-u`,
                role: 'user' as const,
                content: context.prompt,
                at: now,
              },
            ]
          : []),
        {
          id: `ai-msg-${now}-0`,
          role: 'assistant' as const,
          content: assistantContent,
          changes: payload.changes,
          changedElementIds: focusElements.map((element) => element.id),
          suggestions: payload.suggestions,
          notice: payload.notice,
          provider: payload.provider,
          model: payload.model,
          at: now + 1,
        },
      ];

      applyAiSession({
        sessionId: payload.sessionId,
        type: payload.type,
        detail: payload.detail,
        direction: payload.direction,
        graph: payload.graph,
        title: payload.title,
        summary: payload.summary,
        origin: options.origin,
        suggestions: payload.suggestions,
        messages: initialMessages,
      });
      recordBoardAiTurn(payload, context.prompt, payload.summary || assistantContent);
      setIsAiChatOpen(true);

      const engineName = formatAiEngineDisplay(payload.provider, payload.model);

      addNotification(
        `✨ ${engineName} generated ${payload.elements.length} elements. Use the chat to refine it.`,
        'success'
      );

      // Frame the diagram cleanly beside the AI Chat drawer and pulse new items.
      setTimeout(() => {
        navigateToElementsRef.current?.(payload.elements);
        highlightElementsRef.current?.(focusElements, {
          navigateIfHidden: false,
          badgeLabel: 'AI generated',
          durationMs: 4200,
        });
      }, 120);
    },
    [
      canWrite,
      addNotification,
      applyAiElements,
      applyAiSession,
      recordBoardAiTurn,
      canDirectClear,
      emitClearBoardDirect,
      recordBoardClearHistory,
    ]
  );

  const handleAiApplyTurn = useCallback(
    (
      payload: AiDiagramPayload,
      instruction: string,
      context: { boardKey: string; sessionId: string }
    ) => {
      if (context.boardKey !== aiBoardKeyRef.current) return;
      const currentSession = aiSessionRef.current;
      if (!currentSession || currentSession.sessionId !== context.sessionId) return;
      if (!canWrite) {
        addNotification('You do not have permission to edit this board', 'warning');
        return;
      }

      const diff = applyAiElements(currentSession.sessionId, payload.elements);
      const focusElements = diff.focusElements.length > 0 ? diff.focusElements : payload.elements;

      const now = Date.now();
      const userMessage = {
        id: `ai-msg-${now}-u`,
        role: 'user' as const,
        content: instruction,
        at: now,
      };
      const assistantContent =
        payload.summary && payload.summary !== currentSession.summary
          ? payload.summary
          : 'Done — the canvas is updated.';
      const assistantMessage = {
        id: `ai-msg-${now}-a`,
        role: 'assistant' as const,
        content: assistantContent,
        changes: payload.changes,
        changedElementIds: focusElements.map((element) => element.id),
        suggestions: payload.suggestions,
        notice: payload.notice,
        provider: payload.provider,
        model: payload.model,
        at: now + 1,
      };

      applyAiSession({
        ...currentSession,
        type: payload.type,
        detail: payload.detail,
        direction: payload.direction,
        graph: payload.graph,
        title: payload.title,
        summary: payload.summary,
        suggestions: payload.suggestions,
        messages: [...currentSession.messages, userMessage, assistantMessage],
      });
      recordBoardAiTurn(payload, instruction, assistantContent);

      const badgeLabel =
        diff.created.length > 0 && diff.substantivelyUpdated.length === 0
          ? 'AI added'
          : 'AI updated';

      setTimeout(() => {
        highlightElementsRef.current?.(focusElements, {
          navigateIfHidden: true,
          badgeLabel,
          durationMs: 4800,
        });
      }, 100);

      addNotification(
        `✨ Highlighted changes: ${payload.changes[0] ?? 'diagram updated'}`,
        'success'
      );
    },
    [canWrite, addNotification, applyAiElements, applyAiSession, recordBoardAiTurn]
  );

  const handleHighlightAiMessageElements = useCallback(
    (elementIds: string[]) => {
      const matched = elementIds
        .map((id) => elementsRef.current[id])
        .filter((element): element is CanvasElement => Boolean(element));
      if (matched.length === 0) {
        addNotification('Those elements are no longer on the board.', 'info');
        return;
      }
      highlightElementsRef.current?.(matched, {
        navigateIfHidden: true,
        badgeLabel: 'AI change',
        durationMs: 4500,
      });
    },
    [addNotification]
  );

  // Reset undo history and restore the AI chat & global session ledger for this board.
  useEffect(() => {
    resetHistory();
    const boardKey = roomId || 'solo';
    const stored = loadAiSession(boardKey);
    const storedLedger = loadBoardAiLedger(boardKey);
    setAiSession(stored);
    setBoardAiLedger(storedLedger);
    setIsAiChatOpen(Boolean(stored));
  }, [roomId, resetHistory]);

  // An explicit board clear ends the diagram conversation and global session context.
  useEffect(() => {
    if (boardClearCount === 0) return;
    if (Date.now() < aiClearGuardUntilRef.current) return;
    if (Object.keys(elementsRef.current).length > 0) return;
    applyAiSession(null);
    applyBoardAiLedger(EMPTY_BOARD_AI_LEDGER);
    setIsAiChatOpen(false);
  }, [boardClearCount, applyAiSession, applyBoardAiLedger]);

  // Remember joined rooms so guests can rediscover them later.
  useEffect(() => {
    if (!roomId) return;
    rememberRecentRoom(roomId, roomName || `Room ${roomId}`);
  }, [roomId, roomName]);

  // Undo / redo the last locally initiated edit
  const handleUndo = useCallback(() => {
    if (!canWrite) return;
    const operation = historyPastRef.current.pop();
    if (!operation) return;

    if (operation.kind === 'create') {
      // Cascade to connectors attached to created objects. Remember them so
      // redo can restore exactly what this undo removed.
      const cascadeDeleted = collectCascadeWires(elementsRef.current, operation.elements, operation.elements);
      operation.cascadeDeleted = cascadeDeleted;
      emitElementsBatchDelete([...operation.elements.map((element) => element.id), ...cascadeDeleted.map((element) => element.id)]);
    } else if (operation.kind === 'delete') {
      emitElementsBatchCreate(operation.elements);
    } else if (operation.kind === 'batch') {
      // Drop the turn's creations (plus any connectors now dangling off them),
      // restore anything it removed, then roll updates back.
      const cascadeDeleted = collectCascadeWires(elementsRef.current, operation.created, [
        ...operation.created,
        ...operation.deleted,
      ]);
      operation.cascadeDeleted = cascadeDeleted;
      const ids = new Set([...operation.created.map((element) => element.id), ...cascadeDeleted.map((element) => element.id)]);
      if (ids.size > 0) emitElementsBatchDelete(Array.from(ids));
      if (operation.deleted.length > 0) emitElementsBatchCreate(operation.deleted);
      operation.before.forEach((element) => emitElementUpdate(element));
    } else {
      operation.before.forEach((element) => emitElementUpdate(element));
    }

    historyFutureRef.current.push(operation);
    bumpHistory();
  }, [canWrite, emitElementsBatchDelete, emitElementsBatchCreate, emitElementUpdate, bumpHistory]);

  const handleRedo = useCallback(() => {
    if (!canWrite) return;
    const operation = historyFutureRef.current.pop();
    if (!operation) return;

    if (operation.kind === 'create') {
      emitElementsBatchCreate(operation.elements);
      if (operation.cascadeDeleted?.length) emitElementsBatchCreate(operation.cascadeDeleted);
    } else if (operation.kind === 'delete') {
      emitElementsBatchDelete(operation.elements.map((element) => element.id));
    } else if (operation.kind === 'batch') {
      if (operation.created.length > 0) emitElementsBatchCreate(operation.created);
      if (operation.cascadeDeleted?.length) emitElementsBatchCreate(operation.cascadeDeleted);
      if (operation.deleted.length > 0) {
        emitElementsBatchDelete(operation.deleted.map((element) => element.id));
      }
      operation.after.forEach((element) => emitElementUpdate(element));
    } else {
      operation.after.forEach((element) => emitElementUpdate(element));
    }

    historyPastRef.current.push(operation);
    bumpHistory();
  }, [canWrite, emitElementsBatchCreate, emitElementsBatchDelete, emitElementUpdate, bumpHistory]);

  const canUndo = historyPastRef.current.length > 0;
  const canRedo = historyFutureRef.current.length > 0;

  // Request clear board
  const handleRequestClear = useCallback(() => {
    if (!canWrite) {
      addNotification('Only users with write permission can request board clear', 'warning');
      return;
    }
    const totalUsers = Object.keys(users).length;
    if (totalUsers > 1) {
      // Multiplayer: Trigger vote
      emitVoteClearStart();
    } else {
      // Solo: Confirm and clear immediately
      if (Object.keys(elements).length === 0) {
        addNotification('Board is already blank', 'info');
        return;
      }
      setConfirmModalState({
        isOpen: true,
        title: 'Clear Whiteboard?',
        message: 'This will erase all strokes, sticky notes, text, shapes, and stickers from your canvas. You can undo this with Ctrl+Z.',
        confirmText: 'Clear Board',
        cancelText: 'Cancel',
        variant: 'danger',
        onConfirm: async () => {
          setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
          // Capture before the server broadcast clears local elements, but only
          // commit history/success if the server actually authorized the clear.
          const previous = Object.values(elementsRef.current) as CanvasElement[];
          const cleared = await emitClearBoardDirect();
          if (cleared) {
            recordBoardClearHistory(previous);
            addNotification('Whiteboard cleared', 'info');
          } else {
            addNotification(
              'Board was not cleared. Check your connection and that you are the room host.',
              'warning'
            );
          }
        },
      });
    }
  }, [canWrite, users, elements, emitVoteClearStart, emitClearBoardDirect, addNotification, recordBoardClearHistory]);

  const getExportViewportSnapshot = useCallback((): ExportViewportInfo => {
    const board = document.getElementById('whiteboard-canvas-container');
    const width = board?.clientWidth || window.innerWidth;
    const height = board?.clientHeight || window.innerHeight;
    const viewport = getViewportRef.current?.() ?? { pan: { x: 0, y: 0 }, zoom: 1 };
    return {
      pan: viewport.pan,
      zoom: viewport.zoom > 0 ? viewport.zoom : 1,
      width,
      height,
    };
  }, []);

  const handleExport = useCallback(() => {
    setShowExportModal(true);
  }, []);

  const isMultiplayer = Object.keys(users).length > 1;

  const whiteboardActions = useWhiteboardActions({
    currentTool,
    theme,
    canWrite,
    canUndo,
    canRedo,
    isMultiplayer,
    isSoloMode,
    isHost,
    isSignedIn: Boolean(authUser),
    isVoiceConnected,
    isMuted,
    isAiChatOpen,
    isSidebarOpen,
    snapToGrid,
    onSelectTool: setCurrentTool,
    onToggleTheme: handleToggleTheme,
    onToggleSnapToGrid: () => setSnapToGrid((prev) => !prev),
    onSelectAll: () => selectAllHandlerRef.current?.(),
    onUndo: handleUndo,
    onRedo: handleRedo,
    onExport: handleExport,
    onRequestClear: handleRequestClear,
    onOpenRooms: () => setShowCreateRoomModal(true),
    onOpenShare: () => setShowShareModal(true),
    onShareAndGoLive: handleShareAndGoLive,
    onOpenAdmin: () => setShowAdminModal(true),
    onOpenAiDiagram: openAiDiagram,
    onToggleAiChat: toggleAiChat,
    onToggleSidebar: () => setIsSidebarOpen((open) => !open),
    onToggleVoice: handleToggleVoice,
    onToggleMute: toggleMute,
    onOpenShortcuts: () => setShowShortcutsModal(true),
    onOpenProfile: () => setShowProfileModal(true),
    onOpenAuth: () => setShowAuthModal(true),
    onOpenAbout: () => setShowAboutModal(true),
  });

  const globalAiContext = useMemo(
    () =>
      buildGlobalAiContext({
        boardKey: aiBoardKey,
        roomName,
        isSoloMode,
        participantCount: Math.max(1, Object.keys(users).length),
        theme,
        elements,
        activeSession: aiSession,
        boardLedger: boardAiLedger,
      }),
    [aiBoardKey, roomName, isSoloMode, users, theme, elements, aiSession, boardAiLedger]
  );

  const commandPaletteItems = useMemo<CommandPaletteItem[]>(() => {
    const toolItems: CommandPaletteItem[] = whiteboardActions.tools.map((t) => ({
      id: `cmd-${t.id}`,
      label: `Tool: ${t.label}`,
      category: 'Tools',
      shortcut: t.shortcut,
      icon: t.icon,
      disabled: t.disabled,
      onSelect: t.handler,
    }));
    const actionEntries: CommandPaletteItem[] = Object.values(whiteboardActions.actions).map((a) => ({
      id: `cmd-action-${a.id}`,
      label: a.label,
      category: 'Workspace',
      shortcut: a.shortcut,
      icon: a.icon,
      disabled: a.disabled,
      onSelect: a.handler,
    }));
    return [
      ...actionEntries,
      {
        id: 'cmd-blame-mode',
        label: blameMode ? 'Exit Blame Mode' : 'Enable Blame Mode',
        category: 'Attribution',
        icon: History,
        onSelect: toggleBlameMode,
      },
      {
        id: 'cmd-activity-timeline',
        label: showActivityTimeline ? 'Hide Activity Timeline' : 'Open Activity Timeline',
        category: 'Attribution',
        icon: History,
        onSelect: () => {
          setShowActivityTimeline((prev) => !prev);
          setShowVersionHistory(false);
        },
      },
      {
        id: 'cmd-version-history',
        label: showVersionHistory ? 'Hide Version History' : 'Open Version History',
        category: 'Attribution',
        icon: Clock,
        disabled: isSoloMode,
        onSelect: () => {
          setShowVersionHistory((prev) => !prev);
          setShowActivityTimeline(false);
        },
      },
      ...toolItems,
    ];
  }, [whiteboardActions, blameMode, toggleBlameMode, showActivityTimeline, showVersionHistory, isSoloMode]);

  useModalA11y({
    isOpen: isKicked,
    onClose: () => {
      resetKickedState();
      switchRoom(null);
    },
    dialogRef: kickedDialogRef,
  });

  if (isAuthLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-white font-sans"
      >
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-2xl mb-4 shadow-xl shadow-blue-500/20 animate-pulse">
          W
        </div>
        <p className="text-sm font-medium text-slate-300">Checking authentication...</p>
      </div>
    );
  }

  const isBlockingOverlayOpen =
    !authUser ||
    showAuthModal ||
    showProfileModal ||
    showAboutModal ||
    showCreateRoomModal ||
    showShareModal ||
    showAdminModal ||
    showExportModal ||
    showAiModal ||
    showCommandPalette ||
    isAiChatOpen ||
    confirmModalState.isOpen ||
    voteToClear?.active === true ||
    isKicked ||
    (Boolean(authUser) && !roomId && !hasChosenSessionMode);

  return (
    <div
      id="collaborative-whiteboard-app"
      className={`relative w-screen h-screen overflow-hidden font-sans select-none ${
        theme === 'dark' ? 'dark' : ''
      } bg-white dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 transition-colors`}
    >
      {/* Top Header */}
      <Header
        roomId={roomId}
        isSoloMode={isSoloMode}
        roomName={roomName}
        users={users}
        isConnected={isConnected}
        canWrite={canWrite}
        isLocked={isLocked}
        actions={whiteboardActions}
        isSidebarOpen={isSidebarOpen}
        sidebarToggleRef={sidebarToggleRef}
        isVoiceConnected={isVoiceConnected}
        isMuted={isMuted}
        isDeafened={isDeafened}
        volume={volume}
        onSetVolume={setVolume}
        audioLevel={audioLevel}
        isSpeaking={isSpeaking}
        frequencyData={frequencyData}
        isSimulated={isSimulated}
        error={voiceError}
        onClearError={clearVoiceError}
        isIframeRestricted={isIframeRestricted}
        activeSpeakers={activeSpeakers}
        onToggleDeafen={toggleDeafen}
        onToggleSimulated={toggleSimulated}
        onOpenInNewTab={openInNewTab}
        onAudioLevelChange={emitAudioLevel}
        followingUserId={followingUserId}
        onToggleFollowUser={handleToggleFollowUser}
      />

      {/* Unified controls rail & style palette */}
      <Sidebar
        actions={whiteboardActions}
        theme={theme}
        isVoiceConnected={isVoiceConnected}
        isSoloMode={isSoloMode}
        isGuestOrSignedOut={!authUser || authUser.isGuest}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        toggleButtonRef={sidebarToggleRef}
        currentTool={currentTool}
        currentColor={currentColor}
        currentSize={currentSize}
        canWrite={canWrite}
        selectedShapeType={selectedShapeType}
        selectedIconName={selectedIconName}
        selectedWireStyle={selectedWireStyle}
        onSelectColor={setCurrentColor}
        onSelectSize={setCurrentSize}
        onSelectShape={setSelectedShapeType}
        onSelectIcon={setSelectedIconName}
        onSelectWireStyle={setSelectedWireStyle}
      />

      {/* Main Interactive Canvas Area */}
      <Canvas
        currentTool={currentTool}
        currentColor={currentColor}
        currentSize={currentSize}
        currentUserId={currentUser.id}
        currentUserName={currentUser.name}
        canWrite={canWrite}
        shortcutsBlocked={isBlockingOverlayOpen}
        isShortcutsOpen={showShortcutsModal}
        onCloseShortcuts={() => setShowShortcutsModal(false)}
        theme={theme}
        onRestrictedAttempt={() =>
          addNotification('Drawing is restricted by room admin', 'warning')
        }
        elements={elements}
        liveStrokes={liveStrokes}
        remoteUsers={users}
        onElementCreate={handleElementCreate}
        onElementUpdate={handleElementUpdate}
        onElementDelete={handleElementDelete}
        onElementsBatchDelete={handleElementsBatchDelete}
        onElementsBatchCreate={handleElementsBatchCreate}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onHistoryBarrier={breakHistory}
        onNotify={addNotification}
        onCursorMove={(pos) => {
          setCursorCoords(pos);
          emitCursorMove(pos);
        }}
        onStrokeLiveStart={emitStrokeLiveStart}
        onStrokeLivePoint={emitStrokeLivePoint}
        onSelectTool={setCurrentTool}
        actions={whiteboardActions}
        selectedShapeType={selectedShapeType}
        selectedIconName={selectedIconName}
        selectedWireStyle={selectedWireStyle}
        onRegisterSelectAll={(fn) => {
          selectAllHandlerRef.current = fn;
        }}
        onRegisterNavigateToElements={(fn) => {
          navigateToElementsRef.current = fn;
        }}
        onRegisterHighlightElements={(fn) => {
          highlightElementsRef.current = fn;
        }}
        onRegisterGetWorldCenter={(fn) => {
          getWorldCenterRef.current = fn;
        }}
        onRegisterGetViewport={(fn) => {
          getViewportRef.current = fn;
        }}
        blameMode={blameMode}
        snapToGrid={snapToGrid}
        blameColorFor={blameColorFor}
        onAttributionEnter={onAttributionEnter}
        onAttributionLeave={onAttributionLeave}
        followingUserId={followingUserId}
        onStopFollowUser={() => setFollowingUserId(null)}
      />

      {/* Empty Canvas Quick-Start Guide */}
      <EmptyCanvasGuide
        visible={
          showEmptyGuide &&
          Object.keys(elements).length === 0 &&
          canWrite &&
          !isBlockingOverlayOpen
        }
        isSoloMode={isSoloMode}
        onStartDrawing={() => {
          setCurrentTool('pen');
          setShowEmptyGuide(false);
        }}
        onAddSticky={() => {
          setCurrentTool('sticky');
          setShowEmptyGuide(false);
        }}
        onOpenAiDiagram={() => {
          setShowEmptyGuide(false);
          whiteboardActions.actions.aiDiagram.handler();
        }}
        onDismiss={() => setShowEmptyGuide(false)}
      />

      {/* Compact Floating Tool Dock when sidebar is collapsed */}
      <FloatingToolDock
        visible={!isSidebarOpen && !isBlockingOverlayOpen}
        tools={whiteboardActions.tools}
        undo={whiteboardActions.actions.undo}
        redo={whiteboardActions.actions.redo}
        aiDiagram={whiteboardActions.actions.aiDiagram}
      />

      {/* Attribution: Activity Timeline Toggle */}
      <button
        id="version-history-btn"
        type="button"
        aria-pressed={showVersionHistory}
        aria-label={showVersionHistory ? 'Close version history' : 'Open board version history'}
        title="Version history & restore"
        disabled={isSoloMode}
        onClick={() => {
          setShowVersionHistory((prev) => !prev);
          setShowActivityTimeline(false);
        }}
        className={`fixed right-3 sm:right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+9.75rem)] sm:bottom-[158px] wb-right-chat-aware z-40 flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-2xl backdrop-blur-md border shadow-lg text-xs font-semibold transition-all cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed ${
          showVersionHistory
            ? 'bg-blue-600/95 border-blue-400 text-white shadow-blue-500/30 ring-2 ring-blue-400/40'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200/90 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Versions</span>
      </button>

      <button
        id="activity-timeline-btn"
        type="button"
        aria-pressed={showActivityTimeline}
        aria-label={showActivityTimeline ? 'Close activity timeline' : 'Open room activity timeline'}
        title="Activity Timeline & Command Palette (Ctrl+K)"
        onClick={() => {
          setShowActivityTimeline((prev) => !prev);
          setShowVersionHistory(false);
        }}
        className={`fixed right-3 sm:right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+7.25rem)] sm:bottom-[112px] wb-right-chat-aware z-40 flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-2xl backdrop-blur-md border shadow-lg text-xs font-semibold transition-all cursor-pointer select-none ${
          showActivityTimeline
            ? 'bg-blue-600/95 border-blue-400 text-white shadow-blue-500/30 ring-2 ring-blue-400/40'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200/90 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <History className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Activity</span>
      </button>

      {/* Activity & Attribution Timeline Drawer */}
      <ActivityTimelineDrawer
        isOpen={showActivityTimeline}
        onClose={() => setShowActivityTimeline(false)}
        entries={activityEntries}
        elements={elements}
        isLoading={isLoadingActivity}
        onFocusElement={(elementId) => {
          const target = elementsRef.current[elementId];
          if (!target) return;
          navigateToElementsRef.current?.([target]);
          highlightElementsRef.current?.([target], {
            navigateIfHidden: false,
            durationMs: 2200,
            badgeLabel: 'Focused',
          });
        }}
      />

      {/* Durable board versions with explicit restore confirmation */}
      <VersionHistoryPanel
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        snapshots={boardSnapshots}
        selectedSnapshot={selectedSnapshot}
        isLoading={isLoadingSnapshots}
        isRestoring={isRestoringSnapshot}
        canRestore={isHost && !isSoloMode}
        onPreview={handlePreviewSnapshot}
        onRestore={handleRequestRestoreSnapshot}
      />

      {/* Fuzzy Command Palette (Ctrl+K / Cmd+K) */}
      <CommandPaletteModal
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        items={commandPaletteItems}
      />

      {/* Attribution: Blame Mode toggle button */}
      <button
        id="blame-mode-toggle-btn"
        type="button"
        aria-pressed={blameMode}
        aria-label={blameMode ? 'Exit blame mode' : 'Enable blame mode — see who drew what'}
        title={blameMode ? 'Exit Blame Mode' : 'Blame Mode — see who drew what'}
        onClick={toggleBlameMode}
        className={`fixed right-3 sm:right-4 bottom-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] sm:bottom-[68px] wb-bottom-blame-aware wb-right-chat-aware z-40 flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-2xl backdrop-blur-md border shadow-lg text-xs font-semibold transition-all cursor-pointer select-none ${
          blameMode
            ? 'bg-indigo-600/95 border-indigo-400 text-white shadow-indigo-500/30 ring-2 ring-indigo-400/40'
            : 'bg-white/95 dark:bg-slate-900/95 border-slate-200/90 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
      >
        <span aria-hidden className="text-sm leading-none">👤</span>
        <span className="hidden sm:inline">{blameMode ? 'Exit Blame' : 'Blame Mode'}</span>
      </button>

      {/* Attribution: Blame Mode Legend */}
      {blameMode && <BlameModeLegend users={legendUsers} />}

      {/* Attribution: Hover tooltip */}
      {attributionHovered && (
        <AttributionTooltip
          attribution={attributionHovered.attribution}
          x={attributionHovered.x}
          y={attributionHovered.y}
        />
      )}

      {/* Vote to Clear Modal Banner */}
      {voteToClear && voteToClear.active && (
        <VoteToClearModal
          vote={voteToClear}
          currentUserId={currentUser.id}
          onCastVote={emitVoteClearCast}
          onCancelVote={emitVoteClearCancel}
        />
      )}

      {/* Authentication Modal */}
      <ErrorBoundary fallbackTitle="Authentication Dialog">
        <AuthModal
          // If session recovery failed, explain via toast and let the user
          // dismiss instead of trapping them in an unclosable login dialog.
          isOpen={(!authUser && !authError) || showAuthModal}
          onClose={() => {
            if (authUser || authError) setShowAuthModal(false);
          }}
          currentUser={authUser}
          onLogin={login}
          onRegister={register}
          onContinueAsGuest={continueAsGuest}
          onGoogleLogin={signInWithGoogle}
          onLogout={handleLogout}
        />
      </ErrorBoundary>

      {/* Account Profile & Identity Modal */}
      <ErrorBoundary fallbackTitle="Profile Dialog">
        <ProfileModal
          isOpen={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          currentUser={currentUser}
          authUser={authUser}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onUpdateUserName={updateUserName}
          onUpdateUserColor={updateUserColor}
          onOpenAuthModal={() => setShowAuthModal(true)}
          onLogout={handleLogout}
        />
      </ErrorBoundary>

      {/* Session Rooms Management Modal */}
      <ErrorBoundary fallbackTitle="Session Rooms Dialog">
        <CreateRoomModal
          isOpen={showCreateRoomModal}
          onClose={() => setShowCreateRoomModal(false)}
          currentRoomId={roomId}
          currentUserId={authUser?.id || currentUser.id}
          myRooms={myRooms}
          onSelectRoom={(id) => {
            switchRoom(id);
            setShowCreateRoomModal(false);
          }}
          onDeleteRoom={handleDeleteRoom}
          onCreateRoom={handleCreateRoom}
          onFetchRooms={fetchRooms}
        />
      </ErrorBoundary>

      {/* Share Room Code & Link Modal */}
      <ShareRoomModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        roomCode={roomId || ''}
        roomName={roomName}
        creatorName={creatorName}
        isHost={isHost}
        userCount={Object.keys(users).length || 1}
      />

      {/* Session Launcher Modal: Choose Solo vs Multiplayer room */}
      <SessionLauncherModal
        isOpen={Boolean(authUser && !roomId && !hasChosenSessionMode)}
        onClose={() => setHasChosenSessionMode(true)}
        authUser={authUser}
        myRooms={myRooms}
        onStartSolo={() => {
          setHasChosenSessionMode(true);
          addNotification('Started personal canvas. Click "Share & Go Live" anytime to invite friends!', 'info');
        }}
        onOpenCreateRoom={() => {
          setHasChosenSessionMode(true);
          setShowCreateRoomModal(true);
        }}
        onJoinRoomByCode={(code) => {
          setHasChosenSessionMode(true);
          switchRoom(code);
        }}
      />

      {/* Admin Panel & User Permissions Modal */}
      <AdminPanelModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        roomId={roomId ?? undefined}
        roomName={roomName}
        isHost={isHost}
        isLocked={isLocked}
        currentUserId={currentUser.id}
        users={users}
        onSetPermission={setParticipantPermission}
        onKickUser={kickParticipant}
        onToggleLock={toggleLockBoard}
        onDeleteRoom={handleDeleteRoom}
      />

      {/* Custom Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText={confirmModalState.confirmText}
        cancelText={confirmModalState.cancelText}
        variant={confirmModalState.variant}
        onConfirm={confirmModalState.onConfirm}
        onCancel={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      <ShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* About & Alternatives Comparison Modal */}
      <ErrorBoundary fallbackTitle="About Dialog">
        <AboutModal
          isOpen={showAboutModal}
          onClose={() => setShowAboutModal(false)}
          onOpenAiModal={whiteboardActions.actions.aiDiagram.handler}
        />
      </ErrorBoundary>

      {/* Export & Preview Modal */}
      <ErrorBoundary fallbackTitle="Export Dialog">
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          elements={elements}
          roomId={roomId}
          roomName={roomName}
          theme={theme}
          getViewportSnapshot={getExportViewportSnapshot}
          onExportSuccess={(message, variant = 'success') => addNotification(message, variant)}
        />
      </ErrorBoundary>

      {/* AI Diagram Generator Modal */}
      <AiGenerateModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        onGenerated={handleAiGenerated}
        boardKey={aiBoardKey}
        canvasCenter={
          getWorldCenterRef.current
            ? getWorldCenterRef.current()
            : {
                x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 500,
                y: typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 350,
              }
        }
        authToken={token}
        canClearBoard={canDirectClear}
        globalContext={globalAiContext}
        engineConfig={aiEngineConfig}
        preferredEngine={preferredAiEngine}
        onChangePreferredEngine={handleChangePreferredAiEngine}
      />

      {/* Docked follow-up chat for the current session (null session shows an empty state) */}
      <AiChatPanel
        isOpen={isAiChatOpen}
        boardKey={aiBoardKey}
        session={aiSession}
        onClose={closeAiChat}
        onNewDiagram={openAiDiagram}
        onApplyTurn={handleAiApplyTurn}
        onHighlightChanges={handleHighlightAiMessageElements}
        authToken={token}
        globalContext={globalAiContext}
        engineConfig={aiEngineConfig}
        preferredEngine={preferredAiEngine}
        onChangePreferredEngine={handleChangePreferredAiEngine}
      />

      {/* Reopen the AI chat after it has been minimized */}
      {aiSession && !isAiChatOpen && !(voteToClear && voteToClear.active) && (() => {
        const reopenMeta = getAiChatActionMeta(false);
        const ReopenIcon = reopenMeta.Icon;
        return (
          <button
            type="button"
            onClick={reopenAiChat}
            title={reopenMeta.title}
            aria-label={reopenMeta.ariaLabel}
            className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] sm:bottom-20 right-3 sm:right-4 z-30 inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-4 py-3 text-xs font-semibold text-white shadow-xl shadow-indigo-500/30 hover:from-indigo-500 hover:to-violet-500 active:scale-95 transition-all cursor-pointer"
          >
            <ReopenIcon className="w-4 h-4" />
            {reopenMeta.compactLabel}
          </button>
        );
      })()}

      {/* Kicked from Room Dialog */}
      {isKicked && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            ref={kickedDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="kicked-dialog-title"
            aria-describedby="kicked-dialog-description"
            tabIndex={-1}
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl text-center"
          >
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto mb-3">
              <UserX className="w-6 h-6" />
            </div>
            <h3 id="kicked-dialog-title" className="text-lg font-bold text-slate-900 dark:text-white mb-1">Removed from Room</h3>
            <p id="kicked-dialog-description" className="text-sm text-slate-600 dark:text-slate-300 mb-6">
              {kickedReason || 'An admin has removed you from this collaborative session.'}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  resetKickedState();
                  switchRoom(null);
                }}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Return to Solo Canvas
              </button>
              <button
                type="button"
                onClick={() => {
                  resetKickedState();
                  setShowCreateRoomModal(true);
                }}
                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Browse / Create Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brief onboarding toast (8s auto-dismiss, pauses on hover) */}
      <WelcomeHintToast
        isOpen={showWelcomeHint && !isBlockingOverlayOpen}
        onDismiss={() => setShowWelcomeHint(false)}
      />

      {/* Floating System Notifications */}
      <div
        id="system-notifications"
        role="status"
        aria-live="polite"
        aria-atomic="false"
        aria-label="Notifications"
        className="fixed top-16 sm:top-20 right-3 sm:right-4 wb-right-chat-aware z-40 flex flex-col items-end gap-2 pointer-events-none max-w-[90vw]"
      >
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-3 py-2 rounded-xl text-xs font-medium shadow-lg pointer-events-auto flex items-center gap-2 border transition-all animate-in slide-in-from-bottom-2 duration-150 ${
              n.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900/70'
                : n.type === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900/70'
                : 'bg-slate-900 dark:bg-slate-800 text-white border-slate-800 dark:border-slate-700'
            }`}
          >
            {n.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
            {n.type === 'warning' && <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />}
            {n.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
            <span>{n.text}</span>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissNotification(n.id)}
              className="ml-1 p-0.5 rounded text-current opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Clean Minimalism Status Footer (Desktop only) */}
      <footer
        id="whiteboard-status-footer"
        className="hidden sm:flex fixed bottom-0 left-0 right-0 h-7 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-xs border-t border-slate-200 dark:border-slate-800 px-6 items-center justify-between z-30 select-none text-[10px] text-slate-400 dark:text-slate-500 font-medium"
      >
        <div className="flex items-center gap-4 font-mono">
          <span>X: {cursorCoords.x.toFixed(0)}</span>
          <span>Y: {cursorCoords.y.toFixed(0)}</span>
          <span>{isSoloMode ? 'Mode: Solo (Personal)' : `Room: ${roomId}`}</span>
          {!isSoloMode && isHost && <span className="text-amber-600 dark:text-amber-400 font-semibold font-sans">★ Host</span>}
          {!isSoloMode && !canWrite && <span className="text-rose-500 dark:text-rose-400 font-semibold font-sans">🔒 View-Only</span>}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isSoloMode ? 'bg-blue-400' : (isConnected ? 'bg-emerald-500' : 'bg-rose-400')
            }`}
          />
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider font-sans">
            {isSoloMode ? 'Solo Mode' : (isConnected ? 'Socket.io Connected' : 'Socket.io Offline')}
          </span>
        </div>
      </footer>
    </div>
  );
}
