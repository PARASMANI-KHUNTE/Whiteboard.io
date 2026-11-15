import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ToolType,
  ShapeType,
  CanvasElement,
  DrawingStroke,
  StickyNote,
  TextElement,
  ShapeElement,
  IconElement,
  WireElement,
  WireStyle,
} from './types';
import { useAuth } from './hooks/useAuth';
import { useSocket } from './hooks/useSocket';
import { useVoiceChat } from './hooks/useVoiceChat';
import { useTheme } from './hooks/useTheme';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { VoteToClearModal } from './components/VoteToClearModal';
import { AuthModal } from './components/AuthModal';
import { CreateRoomModal } from './components/CreateRoomModal';
import { ShareRoomModal } from './components/ShareRoomModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { SessionLauncherModal } from './components/SessionLauncherModal';
import { ConfirmModal } from './components/ConfirmModal';
import { AiGenerateModal } from './components/AiGenerateModal';
import { AiChatPanel } from './components/AiChatPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Info, Sparkles, AlertCircle, CheckCircle2, UserX } from 'lucide-react';
import { isColorBlack, isColorWhite } from './utils/themeColors';
import { routeWire } from './utils/wireGeometry';
import { loadAiSession, saveAiSession, clearAiSession } from './utils/aiSessionStorage';
import { forgetRecentRoom, rememberRecentRoom } from './utils/recentRooms';
import type { AiDiagramPayload, AiSessionState } from './ai/types';

/** A reversible local edit recorded for Ctrl+Z / Ctrl+Shift+Z. */
type HistoryOperation =
  | { kind: 'create'; elements: CanvasElement[]; at: number }
  | { kind: 'delete'; elements: CanvasElement[]; at: number }
  | { kind: 'update'; before: CanvasElement[]; after: CanvasElement[]; at: number }
  | {
      /** A single AI turn: creations, deletions and updates applied atomically. */
      kind: 'batch';
      created: CanvasElement[];
      deleted: CanvasElement[];
      before: CanvasElement[];
      after: CanvasElement[];
      at: number;
    };

/**
 * Compare two canvas elements ignoring `updatedAt`, which changes on every
 * server revision even when the visible content is identical.
 */
function sameElementContent(a: CanvasElement, b: CanvasElement): boolean {
  if (a === b) return true;
  const normalize = (element: CanvasElement) => {
    const copy: Record<string, unknown> = { ...(element as unknown as Record<string, unknown>) };
    delete copy.updatedAt;
    return JSON.stringify(copy);
  };
  return normalize(a) === normalize(b);
}

const HISTORY_LIMIT = 100;

export default function App() {
  // Theme hook
  const { theme, toggleTheme } = useTheme();

  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState<string>(() => (theme === 'dark' ? '#ffffff' : '#0f172a'));
  const [currentSize, setCurrentSize] = useState<number>(3); // Fine default
  const [selectedShapeType, setSelectedShapeType] = useState<ShapeType>('rectangle');
  const [selectedIconName, setSelectedIconName] = useState<string>('star');
  const [selectedWireStyle, setSelectedWireStyle] = useState<WireStyle>('curve');
  const [showWelcomeHint, setShowWelcomeHint] = useState<boolean>(true);
  const [hasChosenSessionMode, setHasChosenSessionMode] = useState<boolean>(false);

  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiSession, setAiSession] = useState<AiSessionState | null>(null);
  const [isAiChatOpen, setIsAiChatOpen] = useState<boolean>(false);
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

  const selectAllHandlerRef = useRef<(() => void) | null>(null);
  const navigateToElementsRef = useRef<((elements: CanvasElement[]) => void) | null>(null);
  const getWorldCenterRef = useRef<(() => { x: number; y: number }) | null>(null);
  const getViewportRef = useRef<(() => { pan: { x: number; y: number }; zoom: number }) | null>(null);

  // Authentication hook
  const {
    authUser,
    token,
    isLoading: isAuthLoading,
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
    setParticipantPermission,
    kickParticipant,
    toggleLockBoard,
    deleteCurrentRoom,
    resetKickedState,
    updateUserName,
    updateUserColor,
    switchRoom,
    addNotification,
    socket,
  } = useSocket(undefined, authUser, token);

  // Keep the latest element map available to undo/redo without re-creating
  // callbacks on every room update.
  const elementsRef = useRef<Record<string, CanvasElement>>(elements);
  elementsRef.current = elements;

  // AI chat is persisted per board (room code, or "solo") so a reload brings
  // back the same conversation and diagram context.
  const aiBoardKey = roomId || 'solo';
  const aiBoardKeyRef = useRef(aiBoardKey);
  aiBoardKeyRef.current = aiBoardKey;

  const applyAiSession = useCallback((next: AiSessionState | null) => {
    setAiSession(next);
    const key = aiBoardKeyRef.current;
    if (next) {
      saveAiSession(key, next);
    } else {
      clearAiSession(key);
    }
  }, []);

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

  const handleLogout = useCallback(async () => {
    await logout();
    addNotification('Logged out successfully. Switched to guest session.', 'info');
  }, [logout, addNotification]);

  const handleDeleteRoom = useCallback(async (targetRoomId: string) => {
    const isCurrent = targetRoomId === roomId;
    if (isCurrent) {
      deleteCurrentRoom();
    }
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
  }, [roomId, deleteCurrentRoom, deleteRoom, addNotification, switchRoom]);

  // Attach the caller's stable identity when creating a room. Authenticated
  // users are resolved from their token server-side; guests need this so they
  // become (and stay) the host of the room they just created.
  const handleCreateRoom = useCallback(
    (data: { name: string; customCode?: string; isLocked?: boolean }) =>
      createRoom({
        ...data,
        creatorId: currentUser.id,
        creatorName: currentUser.name,
      }),
    [createRoom, currentUser.id, currentUser.name]
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

    // 2. Convert all existing board elements for theme consistency
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

    // 3. Toggle theme state
    toggleTheme();
  }, [theme, currentColor, elements, emitElementsBatchCreate, toggleTheme]);

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
    },
    [canWrite, emitElementCreate, addNotification, pushHistory]
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
    },
    [emitElementUpdate, pushHistory]
  );

  const handleElementDelete = useCallback(
    (elementId: string) => {
      const target = elementsRef.current[elementId];
      if (target) {
        pushHistory({ kind: 'delete', elements: [target], at: Date.now() });
      }
      emitElementDelete(elementId);
    },
    [emitElementDelete, pushHistory]
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
    (sessionId: string, nextElements: CanvasElement[]) => {
      const prefix = `ai_${sessionId}_`;
      const current = (Object.values(elementsRef.current) as CanvasElement[]).filter(
        (element) => element && element.id.startsWith(prefix)
      );

      const currentById = new Map(current.map((element) => [element.id, element]));
      const nextById = new Map(nextElements.map((element) => [element.id, element]));

      const created = nextElements.filter((element) => !currentById.has(element.id));
      const deleted = current.filter((element) => !nextById.has(element.id));
      const updated = nextElements.filter((element) => {
        const before = currentById.get(element.id);
        return before ? !sameElementContent(before, element) : false;
      });
      const updatedBefore = updated
        .map((element) => currentById.get(element.id))
        .filter((element) => Boolean(element)) as CanvasElement[];

      if (created.length === 0 && deleted.length === 0 && updated.length === 0) {
        return;
      }

      // Delete first so a revision that reuses an id never shows a duplicate.
      if (deleted.length > 0) {
        emitElementsBatchDelete(deleted.map((element) => element.id));
      }
      if (created.length > 0) {
        emitElementsBatchCreate(created);
      }
      updated.forEach((element) => emitElementUpdate(element));

      pushHistory({
        kind: 'batch',
        created,
        deleted,
        before: updatedBefore,
        after: updated,
        at: Date.now(),
      });
    },
    [emitElementsBatchCreate, emitElementsBatchDelete, emitElementUpdate, pushHistory]
  );

  const handleAiGenerated = useCallback(
    (payload: AiDiagramPayload, options: { origin: { x: number; y: number }; replaceBoard: boolean }) => {
      if (!canWrite) {
        addNotification('You do not have permission to edit this board', 'warning');
        return;
      }

      if (options.replaceBoard) {
        aiClearGuardUntilRef.current = Date.now() + 2500;
        emitClearBoardDirect();
        // The clear is intentional and not undoable; the AI turn itself is.
        resetHistory();
      }

      applyAiElements(payload.sessionId, payload.elements);

      const now = Date.now();
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
        messages: [
          {
            id: `ai-msg-${now}-0`,
            role: 'assistant',
            content:
              [payload.summary, payload.notice].filter(Boolean).join('\n\n') ||
              'Your diagram is ready. Tell me what to change.',
            changes: payload.changes,
            suggestions: payload.suggestions,
            notice: payload.notice,
            at: now,
          },
        ],
      });
      setIsAiChatOpen(true);

      addNotification(
        `✨ Gemini generated ${payload.elements.length} elements. Use the chat to refine it.`,
        'success'
      );

      // Frame the diagram on first generation only; follow-ups keep the view steady.
      setTimeout(() => {
        navigateToElementsRef.current?.(payload.elements);
      }, 120);
    },
    [
      canWrite,
      addNotification,
      applyAiElements,
      applyAiSession,
      emitClearBoardDirect,
      resetHistory,
    ]
  );

  const handleAiApplyTurn = useCallback(
    (payload: AiDiagramPayload, instruction: string) => {
      if (!canWrite) {
        addNotification('You do not have permission to edit this board', 'warning');
        return;
      }
      if (!aiSession) return;

      applyAiElements(aiSession.sessionId, payload.elements);

      const now = Date.now();
      const userMessage = {
        id: `ai-msg-${now}-u`,
        role: 'user' as const,
        content: instruction,
        at: now,
      };
      const assistantMessage = {
        id: `ai-msg-${now}-a`,
        role: 'assistant' as const,
        content:
          payload.summary && payload.summary !== aiSession.summary
            ? payload.summary
            : 'Done — the canvas is updated.',
        changes: payload.changes,
        suggestions: payload.suggestions,
        notice: payload.notice,
        at: now + 1,
      };

      applyAiSession({
        ...aiSession,
        type: payload.type,
        detail: payload.detail,
        direction: payload.direction,
        graph: payload.graph,
        title: payload.title,
        summary: payload.summary,
        suggestions: payload.suggestions,
        messages: [...aiSession.messages, userMessage, assistantMessage],
      });

      addNotification(
        `✨ Applied: ${payload.changes[0] ?? 'diagram updated'}`,
        'success'
      );
    },
    [aiSession, canWrite, addNotification, applyAiElements, applyAiSession]
  );

  // Reset undo history and restore the AI chat that belongs to this board.
  useEffect(() => {
    resetHistory();
    const stored = loadAiSession(roomId || 'solo');
    setAiSession(stored);
    setIsAiChatOpen(Boolean(stored));
  }, [roomId, resetHistory]);

  // An explicit board clear ends the diagram conversation it was based on.
  useEffect(() => {
    if (boardClearCount === 0) return;
    if (Date.now() < aiClearGuardUntilRef.current) return;
    if (Object.keys(elementsRef.current).length > 0) return;
    applyAiSession(null);
    setIsAiChatOpen(false);
  }, [boardClearCount, applyAiSession]);

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
      // Cascade to connectors attached to created objects.
      const ids = new Set(operation.elements.map((element) => element.id));
      (Object.values(elementsRef.current) as CanvasElement[]).forEach((element) => {
        if (element.type === 'wire' && (ids.has(element.fromId) || ids.has(element.toId))) {
          ids.add(element.id);
        }
      });
      emitElementsBatchDelete(Array.from(ids));
    } else if (operation.kind === 'delete') {
      emitElementsBatchCreate(operation.elements);
    } else if (operation.kind === 'batch') {
      // Drop the turn's creations (plus any connectors now dangling off them),
      // restore anything it removed, then roll updates back.
      const ids = new Set(operation.created.map((element) => element.id));
      (Object.values(elementsRef.current) as CanvasElement[]).forEach((element) => {
        if (
          element.type === 'wire' &&
          !ids.has(element.id) &&
          (ids.has(element.fromId) || ids.has(element.toId))
        ) {
          ids.add(element.id);
        }
      });
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
    } else if (operation.kind === 'delete') {
      emitElementsBatchDelete(operation.elements.map((element) => element.id));
    } else if (operation.kind === 'batch') {
      if (operation.created.length > 0) emitElementsBatchCreate(operation.created);
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
        message: 'This will erase all strokes, sticky notes, text, shapes, and stickers from your canvas. This action cannot be undone.',
        confirmText: 'Clear Board',
        cancelText: 'Cancel',
        variant: 'danger',
        onConfirm: () => {
          emitClearBoardDirect();
          resetHistory();
          addNotification('Whiteboard cleared', 'info');
          setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
        },
      });
    }
  }, [canWrite, users, elements, emitVoteClearStart, emitClearBoardDirect, addNotification, resetHistory]);

  // Export board as PNG (matches the current viewport pan & zoom)
  const handleExport = useCallback(() => {
    const canvas = document.createElement('canvas');
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = 2;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const viewport = getViewportRef.current?.() ?? { pan: { x: 0, y: 0 }, zoom: 1 };
    const pan = viewport.pan;
    const zoom = viewport.zoom > 0 ? viewport.zoom : 1;

    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = theme === 'dark' ? '#0b0f19' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Grid, aligned with the current viewport offset
    const gridSize = 24 * zoom;
    if (gridSize >= 4) {
      ctx.strokeStyle = theme === 'dark' ? '#1e293b' : '#f1f5f9';
      ctx.lineWidth = 1;
      const startX = ((pan.x % gridSize) + gridSize) % gridSize;
      const startY = ((pan.y % gridSize) + gridSize) % gridSize;
      for (let x = startX; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = startY; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // Enter world space so element coordinates line up with the on-screen canvas
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const allElements = Object.values(elements) as CanvasElement[];

    // Word-wrap helper used for sticky notes / shapes / text elements
    const wrapLines = (text: string, maxWidth: number): string[] => {
      const result: string[] = [];
      if (!text) return result;
      for (const paragraph of text.split('\n')) {
        if (paragraph === '') {
          result.push('');
          continue;
        }
        const words = paragraph.split(/\s+/);
        let current = '';
        for (const word of words) {
          const candidate = current ? `${current} ${word}` : word;
          if (ctx.measureText(candidate).width > maxWidth && current) {
            result.push(current);
            current = word;
          } else {
            current = candidate;
          }
        }
        if (current) result.push(current);
      }
      return result;
    };

    // Draw strokes
    allElements.forEach((el) => {
      if (el.type === 'stroke') {
        const stroke = el as DrawingStroke;
        const points = stroke.points;
        if (points.length < 1) return;

        ctx.save();
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.isHighlighter ? stroke.size * 2.5 : stroke.size;
        const strokeColor =
          theme === 'dark' && isColorBlack(stroke.color)
            ? '#ffffff'
            : theme === 'light' && isColorWhite(stroke.color)
            ? '#0f172a'
            : stroke.color;
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = stroke.isHighlighter ? 0.35 : 1.0;

        if (points.length === 1) {
          ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fillStyle = strokeColor;
          ctx.fill();
        } else {
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length - 1; i++) {
            const midX = (points[i].x + points[i + 1].x) / 2;
            const midY = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
          }
          ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
          ctx.stroke();
        }
        ctx.restore();
      }
    });

    // Draw wires (Line & Curve connectors between objects)
    allElements.forEach((el) => {
      if (el.type === 'wire') {
        const w = el as WireElement;
        const sourceEl = elements[w.fromId];
        const targetEl = elements[w.toId];
        if (!sourceEl || !targetEl) return;
        const route = routeWire(sourceEl, targetEl, w.wireType || 'curve', w.fromAnchor, w.toAnchor);
        if (!route) return;

        ctx.save();
        const effectiveWireColor =
          theme === 'dark' && isColorBlack(w.color)
            ? '#ffffff'
            : theme === 'light' && isColorWhite(w.color)
            ? '#0f172a'
            : w.color || '#3b82f6';

        ctx.strokeStyle = effectiveWireColor;
        ctx.fillStyle = effectiveWireColor;
        ctx.lineWidth = w.strokeWidth || 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (w.strokeStyle === 'dashed') {
          ctx.setLineDash([9, 6]);
        } else if (w.strokeStyle === 'dotted') {
          ctx.setLineDash([3, 4]);
        }

        const path2d = new Path2D(route.svgPath);
        ctx.stroke(path2d);

        const drawArrowHead = (pt: { x: number; y: number }, angle: number) => {
          const headLen = Math.max(8, (w.strokeWidth || 3) * 2.5);
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x - headLen * Math.cos(angle - Math.PI / 6), pt.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(pt.x - headLen * Math.cos(angle + Math.PI / 6), pt.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        };

        // End arrow
        if (w.arrowEnd !== false) {
          const endPt = route.toPoint;
          let angle = 0;
          if (route.controlPoints) {
            const cp2 = route.controlPoints[1];
            angle = Math.atan2(endPt.y - cp2.y, endPt.x - cp2.x);
          } else {
            angle = Math.atan2(endPt.y - route.fromPoint.y, endPt.x - route.fromPoint.x);
          }
          drawArrowHead(endPt, angle);
        }

        // Start arrow
        if (w.arrowStart) {
          const startPt = route.fromPoint;
          let angle = 0;
          if (route.controlPoints) {
            const cp1 = route.controlPoints[0];
            angle = Math.atan2(startPt.y - cp1.y, startPt.x - cp1.x);
          } else {
            angle = Math.atan2(startPt.y - route.toPoint.y, startPt.x - route.toPoint.x);
          }
          drawArrowHead(startPt, angle);
        }

        // Draw midpoint label if present
        if (w.label) {
          ctx.setLineDash([]);
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textMetrics = ctx.measureText(w.label);
          const bgW = textMetrics.width + 12;
          const bgH = 18;
          ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#ffffff';
          ctx.beginPath();
          ctx.roundRect(route.midpoint.x - bgW / 2, route.midpoint.y - bgH / 2, bgW, bgH, 9);
          ctx.fill();
          ctx.strokeStyle = effectiveWireColor;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = effectiveWireColor;
          ctx.fillText(w.label, route.midpoint.x, route.midpoint.y);
        }

        ctx.restore();
      }
    });

    // Draw sticky notes
    allElements.forEach((el) => {
      if (el.type === 'sticky') {
        const note = el as StickyNote;
        const noteWidth = note.width || 224;
        const noteHeight = note.height || 150;
        ctx.save();
        ctx.fillStyle = note.color || '#fef08a';
        ctx.strokeStyle = '#e2e8f0';
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(note.x, note.y, noteWidth, noteHeight, 8);
        ctx.fill();
        ctx.stroke();

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = theme === 'dark' ? '#0f172a' : '#1e293b';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.beginPath();
        ctx.rect(note.x + 8, note.y + 8, noteWidth - 16, noteHeight - 16);
        ctx.clip();
        const lines = wrapLines(note.text || '', noteWidth - 24);
        lines.forEach((line, idx) => {
          ctx.fillText(line, note.x + 12, note.y + 18 + idx * 18);
        });
        ctx.restore();
      }
    });

    // Draw text elements
    allElements.forEach((el) => {
      if (el.type === 'text') {
        const t = el as TextElement;
        ctx.save();
        const textColor =
          theme === 'dark' && (!t.color || isColorBlack(t.color))
            ? '#ffffff'
            : theme === 'light' && isColorWhite(t.color)
            ? '#0f172a'
            : t.color || '#0f172a';
        const fontSize = t.fontSize || 18;
        const fontStyle = t.fontStyle || 'normal';
        const fontWeight = t.fontWeight || 'normal';
        ctx.fillStyle = textColor;
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${t.fontFamily || 'sans-serif'}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = t.textAlign || 'left';

        const lines = (t.text || '').split('\n');
        const maxWidth = Math.max(
          0,
          ...lines.map((line) => ctx.measureText(line || ' ').width)
        );
        let anchorX = t.x;
        if (t.textAlign === 'center') anchorX = t.x + maxWidth / 2;
        else if (t.textAlign === 'right') anchorX = t.x + maxWidth;

        const lineHeight = fontSize * 1.25;
        lines.forEach((line, idx) => {
          const lineY = t.y + idx * lineHeight;
          ctx.fillText(line, anchorX, lineY);
          if (t.textDecoration === 'underline' && line) {
            const lineWidth = ctx.measureText(line).width;
            let startX = anchorX;
            if (t.textAlign === 'center') startX = anchorX - lineWidth / 2;
            else if (t.textAlign === 'right') startX = anchorX - lineWidth;
            ctx.beginPath();
            ctx.strokeStyle = textColor;
            ctx.lineWidth = Math.max(1, fontSize / 14);
            ctx.moveTo(startX, lineY + fontSize + 1);
            ctx.lineTo(startX + lineWidth, lineY + fontSize + 1);
            ctx.stroke();
          }
        });
        ctx.restore();
      }
    });

    // Draw shapes
    allElements.forEach((el) => {
      if (el.type === 'shape') {
        const s = el as ShapeElement;
        ctx.save();
        ctx.globalAlpha = typeof s.opacity === 'number' ? s.opacity : 1;
        if (s.rotation) {
          const cx = s.x + s.width / 2;
          const cy = s.y + s.height / 2;
          ctx.translate(cx, cy);
          ctx.rotate((s.rotation * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }
        ctx.strokeStyle = s.color || '#0f172a';
        ctx.fillStyle = s.fillColor && s.fillColor !== 'transparent' ? s.fillColor : 'transparent';
        ctx.lineWidth = s.strokeWidth || 3;
        ctx.lineJoin = 'round';
        if (s.strokeStyle === 'dashed') {
          ctx.setLineDash([9, 6]);
        } else if (s.strokeStyle === 'dotted') {
          ctx.setLineDash([3, 4]);
        }
        ctx.beginPath();

        if (s.shapeType === 'rectangle') {
          ctx.roundRect(s.x, s.y, s.width, s.height, 8);
        } else if (s.shapeType === 'circle') {
          ctx.ellipse(s.x + s.width / 2, s.y + s.height / 2, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
        } else if (s.shapeType === 'diamond') {
          ctx.moveTo(s.x + s.width / 2, s.y);
          ctx.lineTo(s.x + s.width, s.y + s.height / 2);
          ctx.lineTo(s.x + s.width / 2, s.y + s.height);
          ctx.lineTo(s.x, s.y + s.height / 2);
          ctx.closePath();
        } else if (s.shapeType === 'triangle') {
          ctx.moveTo(s.x + s.width / 2, s.y);
          ctx.lineTo(s.x + s.width, s.y + s.height);
          ctx.lineTo(s.x, s.y + s.height);
          ctx.closePath();
        } else if (s.shapeType === 'star') {
          const spikes = 5;
          const outerR = Math.min(s.width, s.height) / 2;
          const innerR = outerR * 0.45;
          const cx = s.x + s.width / 2;
          const cy = s.y + s.height / 2;
          for (let i = 0; i < spikes * 2; i++) {
            const r = i % 2 === 0 ? outerR : innerR;
            const a = (Math.PI / spikes) * i - Math.PI / 2;
            const px = cx + Math.cos(a) * r;
            const py = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
        } else if (s.shapeType === 'arrow') {
          const arrowH = s.height * 0.4;
          const headW = Math.min(s.width * 0.4, s.height * 0.8);
          const yCenter = s.y + s.height / 2;
          ctx.moveTo(s.x, yCenter - arrowH / 2);
          ctx.lineTo(s.x + s.width - headW, yCenter - arrowH / 2);
          ctx.lineTo(s.x + s.width - headW, s.y);
          ctx.lineTo(s.x + s.width, yCenter);
          ctx.lineTo(s.x + s.width - headW, s.y + s.height);
          ctx.lineTo(s.x + s.width - headW, yCenter + arrowH / 2);
          ctx.lineTo(s.x, yCenter + arrowH / 2);
          ctx.closePath();
        } else {
          ctx.rect(s.x, s.y, s.width, s.height);
        }

        if (s.fillColor && s.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();

        if (s.text) {
          const fontSize = s.fontSize || 16;
          ctx.setLineDash([]);
          ctx.fillStyle = s.textColor || (theme === 'dark' ? '#f8fafc' : '#0f172a');
          ctx.font = `normal ${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.beginPath();
          ctx.rect(s.x + 6, s.y + 6, Math.max(0, s.width - 12), Math.max(0, s.height - 12));
          ctx.clip();
          const lines = wrapLines(s.text, Math.max(10, s.width - 16));
          const lineHeight = fontSize * 1.25;
          const startY = s.y + s.height / 2 - ((lines.length - 1) * lineHeight) / 2;
          lines.forEach((line, idx) => {
            ctx.fillText(line, s.x + s.width / 2, startY + idx * lineHeight);
          });
        }

        ctx.restore();
      }
    });

    // Draw icons
    allElements.forEach((el) => {
      if (el.type === 'icon') {
        const ic = el as IconElement;
        const boxSize = ic.size + 16;
        const cx = ic.x + boxSize / 2;
        const cy = ic.y + boxSize / 2;
        ctx.save();
        ctx.globalAlpha = typeof ic.opacity === 'number' ? ic.opacity : 1;
        ctx.translate(cx, cy);
        if (ic.rotation) ctx.rotate((ic.rotation * Math.PI) / 180);
        if (ic.flipH || ic.flipV) ctx.scale(ic.flipH ? -1 : 1, ic.flipV ? -1 : 1);

        // Background shape
        if (ic.bgShape && ic.bgShape !== 'none') {
          ctx.fillStyle = ic.bgColor || 'rgba(148, 163, 184, 0.2)';
          ctx.beginPath();
          if (ic.bgShape === 'circle') {
            ctx.arc(0, 0, boxSize / 2, 0, Math.PI * 2);
          } else if (ic.bgShape === 'square') {
            ctx.rect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
          } else {
            ctx.roundRect(-boxSize / 2, -boxSize / 2, boxSize, boxSize, 8);
          }
          ctx.fill();
        }

        ctx.fillStyle = ic.color || '#3b82f6';
        ctx.font = `bold ${Math.max(16, ic.size * 0.65)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const emojiMap: Record<string, string> = {
          star: '⭐',
          heart: '❤️',
          sparkles: '✨',
          flame: '🔥',
          lightbulb: '💡',
          user: '👤',
          cloud: '☁️',
          database: '🗄️',
          code: '💻',
          shield: '🛡️',
          message: '💬',
          'thumbs-up': '👍',
          alert: '⚠️',
          rocket: '🚀',
          smile: '😊',
          compass: '🧭',
          check: '✅',
        };
        const symbol = emojiMap[ic.iconName] || '★';
        ctx.fillText(symbol, 0, 0);
        ctx.restore();
      }
    });

    ctx.restore();

    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    addNotification('Whiteboard exported as PNG', 'success');
  }, [elements, roomId, addNotification, theme]);

  const isMultiplayer = Object.keys(users).length > 1;

  if (isAuthLoading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-white font-sans">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center font-bold text-2xl mb-4 shadow-xl shadow-blue-500/20 animate-pulse">
          W
        </div>
        <p className="text-sm font-medium text-slate-300">Checking authentication...</p>
      </div>
    );
  }

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
        creatorName={creatorName}
        currentUser={currentUser}
        users={users}
        isConnected={isConnected}
        isHost={isHost}
        canWrite={canWrite}
        isLocked={isLocked}
        authUser={authUser}
        onOpenAuthModal={() => setShowAuthModal(true)}
        onOpenCreateRoomModal={() => setShowCreateRoomModal(true)}
        onOpenShareModal={() => setShowShareModal(true)}
        onShareAndGoLive={handleShareAndGoLive}
        onOpenAdminModal={() => setShowAdminModal(true)}
        onOpenAiModal={() => setShowAiModal(true)}
        onToggleAiChat={() => setIsAiChatOpen((open) => !open)}
        isAiChatOpen={isAiChatOpen}
        onUpdateUserName={updateUserName}
        onUpdateUserColor={updateUserColor}
        onSwitchRoom={switchRoom}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={handleToggleTheme}
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
        isIframeRestricted={isIframeRestricted}
        activeSpeakers={activeSpeakers}
        onJoinVoice={handleJoinVoiceWithSoloCheck}
        onLeaveVoice={leaveVoiceChat}
        onToggleMute={toggleMute}
        onToggleDeafen={toggleDeafen}
        onToggleSimulated={toggleSimulated}
        onOpenInNewTab={openInNewTab}
        onAudioLevelChange={emitAudioLevel}
      />

      {/* Main Interactive Canvas Area */}
      <Canvas
        currentTool={currentTool}
        currentColor={currentColor}
        currentSize={currentSize}
        currentUserId={currentUser.id}
        currentUserName={currentUser.name}
        canWrite={canWrite}
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
        onNotify={addNotification}
        onCursorMove={(pos) => {
          setCursorCoords(pos);
          emitCursorMove(pos);
        }}
        onStrokeLiveStart={emitStrokeLiveStart}
        onStrokeLivePoint={emitStrokeLivePoint}
        onSelectTool={setCurrentTool}
        selectedShapeType={selectedShapeType}
        selectedIconName={selectedIconName}
        selectedWireStyle={selectedWireStyle}
        onRegisterSelectAll={(fn) => {
          selectAllHandlerRef.current = fn;
        }}
        onRegisterNavigateToElements={(fn) => {
          navigateToElementsRef.current = fn;
        }}
        onRegisterGetWorldCenter={(fn) => {
          getWorldCenterRef.current = fn;
        }}
        onRegisterGetViewport={(fn) => {
          getViewportRef.current = fn;
        }}
      />

      {/* Bottom Floating Toolbar */}
      <Toolbar
        currentTool={currentTool}
        currentColor={currentColor}
        currentSize={currentSize}
        canUndo={canUndo}
        canRedo={canRedo}
        canWrite={canWrite}
        selectedShapeType={selectedShapeType}
        selectedIconName={selectedIconName}
        selectedWireStyle={selectedWireStyle}
        onSelectTool={setCurrentTool}
        onSelectColor={setCurrentColor}
        onSelectSize={setCurrentSize}
        onSelectShape={setSelectedShapeType}
        onSelectIcon={setSelectedIconName}
        onSelectWireStyle={setSelectedWireStyle}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRequestClear={handleRequestClear}
        onExport={handleExport}
        onSelectAll={() => selectAllHandlerRef.current?.()}
        isMultiplayer={isMultiplayer}
      />

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
          isOpen={!authUser || showAuthModal}
          onClose={() => {
            if (authUser) setShowAuthModal(false);
          }}
          currentUser={authUser}
          onLogin={login}
          onRegister={register}
          onContinueAsGuest={continueAsGuest}
          onGoogleLogin={signInWithGoogle}
          onLogout={logout}
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

      {/* Gemini AI Diagram Generator Modal */}
      <AiGenerateModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        onGenerated={handleAiGenerated}
        canvasCenter={
          getWorldCenterRef.current
            ? getWorldCenterRef.current()
            : {
                x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2) : 500,
                y: typeof window !== 'undefined' ? Math.round(window.innerHeight / 2) : 350,
              }
        }
        authToken={token}
      />

      {/* Docked follow-up chat for the current session (null session shows an empty state) */}
      <AiChatPanel
        isOpen={isAiChatOpen}
        session={aiSession}
        onClose={() => setIsAiChatOpen(false)}
        onNewDiagram={() => setShowAiModal(true)}
        onApplyTurn={handleAiApplyTurn}
        authToken={token}
      />

      {/* Reopen the AI chat after it has been minimized */}
      {aiSession && !isAiChatOpen && (
        <button
          type="button"
          onClick={() => setIsAiChatOpen(true)}
          title="Open AI diagram chat"
          className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 px-4 py-3 text-xs font-semibold text-white shadow-xl shadow-indigo-500/30 hover:from-indigo-500 hover:to-violet-500 active:scale-95 transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          AI chat
        </button>
      )}

      {/* Kicked from Room Dialog */}
      {isKicked && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md border border-slate-200 shadow-2xl text-center">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <UserX className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">Removed from Room</h3>
            <p className="text-sm text-slate-600 mb-6">
              {kickedReason || 'An admin has removed you from this collaborative session.'}
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => {
                  resetKickedState();
                  switchRoom(null);
                }}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                Return to Solo Canvas
              </button>
              <button
                onClick={() => {
                  resetKickedState();
                  setShowCreateRoomModal(true);
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Browse / Create Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Start Prompt & Instructions (Auto dismissible, hidden on mobile) */}
      {showWelcomeHint && (
        <div
          id="welcome-hint-pill"
          className="hidden sm:block fixed top-20 left-6 z-30 bg-white border border-slate-200 shadow-xl rounded-2xl p-4 max-w-xs text-xs text-slate-700 animate-in fade-in duration-300 select-none"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Real-time Whiteboard</span>
            </div>
            <button
              onClick={() => setShowWelcomeHint(false)}
              className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p className="mt-1.5 text-slate-500 leading-relaxed">
            Click <strong className="text-slate-700 font-semibold">Share</strong> to invite friends via room code or link. Room creators can manage participants and toggle write permissions.
          </p>
        </div>
      )}

      {/* Floating System Notifications */}
      <div
        id="system-notifications"
        className="fixed top-16 sm:bottom-12 right-3 sm:right-6 z-50 flex flex-col gap-2 pointer-events-none max-w-[90vw]"
      >
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`px-3 py-2 rounded-xl text-xs font-medium shadow-lg pointer-events-auto flex items-center gap-2 border transition-all animate-in slide-in-from-bottom-2 duration-150 ${
              n.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : n.type === 'warning'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            {n.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            {n.type === 'warning' && <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
            {n.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
            <span>{n.text}</span>
          </div>
        ))}
      </div>

      {/* Clean Minimalism Status Footer (Desktop only) */}
      <footer
        id="whiteboard-status-footer"
        className="hidden sm:flex fixed bottom-0 left-0 right-0 h-7 bg-slate-50/90 backdrop-blur-xs border-t border-slate-200 px-6 items-center justify-between z-30 select-none text-[10px] text-slate-400 font-medium"
      >
        <div className="flex items-center gap-4 font-mono">
          <span>X: {cursorCoords.x.toFixed(0)}</span>
          <span>Y: {cursorCoords.y.toFixed(0)}</span>
          <span>{isSoloMode ? 'Mode: Solo (Personal)' : `Room: ${roomId}`}</span>
          {!isSoloMode && isHost && <span className="text-amber-600 font-semibold font-sans">★ Host</span>}
          {!isSoloMode && !canWrite && <span className="text-rose-500 font-semibold font-sans">🔒 View-Only</span>}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isSoloMode ? 'bg-blue-400' : (isConnected ? 'bg-emerald-500' : 'bg-rose-400')
            }`}
          />
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider font-sans">
            {isSoloMode ? 'Solo Mode' : (isConnected ? 'Socket.io Connected' : 'Socket.io Offline')}
          </span>
        </div>
      </footer>
    </div>
  );
}
