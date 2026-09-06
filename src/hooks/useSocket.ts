import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { CanvasElement, RemoteUser, VoteToClearState, ToolType, Point } from '../types';

const USER_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
];

const ANIMAL_NAMES = ['Fox', 'Panda', 'Otter', 'Falcon', 'Lynx', 'Koala', 'Owl', 'Badger', 'Dolphin'];

function getInitialUser() {
  const storedId = sessionStorage.getItem('collab_user_id');
  const storedName = sessionStorage.getItem('collab_user_name');
  const storedColor = sessionStorage.getItem('collab_user_color');

  const id = storedId || 'user_' + Math.random().toString(36).substring(2, 9);
  const animal = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
  const name = storedName || `Artist ${animal}`;
  const color = storedColor || USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

  sessionStorage.setItem('collab_user_id', id);
  sessionStorage.setItem('collab_user_name', name);
  sessionStorage.setItem('collab_user_color', color);

  return { id, name, color };
}

export function getRoomIdFromUrl(): string {
  if (typeof window === 'undefined') return 'main-board';
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam && roomParam.trim()) {
    return roomParam.trim();
  }
  // Check hash
  if (window.location.hash && window.location.hash.length > 1) {
    return window.location.hash.replace('#', '');
  }
  return 'collab-room';
}

export function setRoomIdInUrl(roomId: string) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', url.toString());
}

export function useSocket(initialRoomId?: string) {
  const [roomId, setRoomId] = useState<string>(() => initialRoomId || getRoomIdFromUrl());
  const [currentUser, setCurrentUser] = useState(getInitialUser);
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [elements, setElements] = useState<Record<string, CanvasElement>>({});
  const [users, setUsers] = useState<Record<string, RemoteUser>>({});
  const [voteToClear, setVoteToClear] = useState<VoteToClearState | null>(null);
  const [liveStrokes, setLiveStrokes] = useState<
    Record<string, { strokeId: string; userId: string; points: Point[]; color: string; size: number; isHighlighter?: boolean }>
  >({});
  const [notifications, setNotifications] = useState<{ id: string; text: string; type: 'info' | 'success' | 'warning' }[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const liveStrokesTimeoutRef = useRef<Record<string, number>>({});

  const addNotification = useCallback((text: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev.slice(-3), { id, text, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  }, []);

  // Connect socket
  useEffect(() => {
    setRoomIdInUrl(roomId);

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-room', {
        roomId,
        user: currentUser,
      });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('room-init', (data: { roomId: string; elements: Record<string, CanvasElement>; users: Record<string, RemoteUser>; voteToClear: VoteToClearState | null; yourRole: string }) => {
      setElements(data.elements || {});
      setUsers(data.users || {});
      setVoteToClear(data.voteToClear);
      setIsHost(data.yourRole === 'host');
    });

    socket.on('user-joined', (user: RemoteUser) => {
      setUsers((prev) => ({ ...prev, [user.id]: user }));
      addNotification(`${user.name} joined the whiteboard`, 'info');
    });

    socket.on('user-left', (data: { userId: string }) => {
      setUsers((prev) => {
        const next = { ...prev };
        const leftUser = next[data.userId];
        if (leftUser) {
          addNotification(`${leftUser.name} left`, 'info');
          delete next[data.userId];
        }
        return next;
      });
    });

    // Real-time live stroke events from other users
    socket.on('stroke-live-started', (data: { userId: string; strokeId: string; point: Point; color: string; size: number; isHighlighter?: boolean }) => {
      setLiveStrokes((prev) => ({
        ...prev,
        [data.strokeId]: {
          strokeId: data.strokeId,
          userId: data.userId,
          points: [data.point],
          color: data.color,
          size: data.size,
          isHighlighter: data.isHighlighter,
        },
      }));
    });

    socket.on('stroke-live-pointed', (data: { strokeId: string; point: Point }) => {
      setLiveStrokes((prev) => {
        const current = prev[data.strokeId];
        if (!current) return prev;
        return {
          ...prev,
          [data.strokeId]: {
            ...current,
            points: [...current.points, data.point],
          },
        };
      });
    });

    // Persistent element events
    socket.on('element-created', (element: CanvasElement) => {
      setElements((prev) => ({ ...prev, [element.id]: element }));
      // Clean up live stroke representation if applicable
      setLiveStrokes((prev) => {
        if (!prev[element.id]) return prev;
        const next = { ...prev };
        delete next[element.id];
        return next;
      });
    });

    socket.on('element-updated', (element: CanvasElement) => {
      setElements((prev) => ({
        ...prev,
        [element.id]: { ...(prev[element.id] || {}), ...element },
      }));
    });

    socket.on('element-deleted', (payload: { elementId: string }) => {
      setElements((prev) => {
        const next = { ...prev };
        delete next[payload.elementId];
        return next;
      });
    });

    socket.on('elements-batch-deleted', (payload: { elementIds: string[] }) => {
      setElements((prev) => {
        const next = { ...prev };
        payload.elementIds.forEach((id) => delete next[id]);
        return next;
      });
    });

    // Remote multiplayer cursor tracking
    socket.on('cursor-moved', (data: { userId: string; cursor: { x: number; y: number; tool?: ToolType; isDrawing?: boolean } }) => {
      setUsers((prev) => {
        const user = prev[data.userId];
        if (!user) return prev;
        return {
          ...prev,
          [data.userId]: {
            ...user,
            cursor: data.cursor,
          },
        };
      });
    });

    // Audio reactivity / Speaking indicator from others
    socket.on('audio-level-updated', (data: { userId: string; level: number; isSpeaking: boolean }) => {
      setUsers((prev) => {
        const user = prev[data.userId];
        if (!user) return prev;
        return {
          ...prev,
          [data.userId]: {
            ...user,
            audioLevel: data.level,
            isSpeaking: data.isSpeaking,
          },
        };
      });
    });

    // Vote to clear board events
    socket.on('vote-clear-started', (vote: VoteToClearState) => {
      setVoteToClear(vote);
      addNotification(`${vote.initiatorName} initiated a vote to clear the whiteboard`, 'warning');
    });

    socket.on('vote-clear-updated', (vote: VoteToClearState) => {
      setVoteToClear(vote);
    });

    socket.on('vote-clear-ended', (result: { passed: boolean; yesCount: number; totalEligible: number; reason: string }) => {
      setVoteToClear(null);
      if (result.passed) {
        addNotification(`Vote passed (${result.yesCount}/${result.totalEligible})! Board was cleared.`, 'success');
      } else if (result.reason === 'cancelled_by_initiator') {
        addNotification('Vote to clear was cancelled by initiator.', 'info');
      } else {
        addNotification(`Vote failed to clear board (${result.yesCount}/${result.totalEligible} votes).`, 'info');
      }
    });

    socket.on('board-cleared', (info: { initiatorName: string; wasVoted: boolean }) => {
      setElements({});
      setLiveStrokes({});
      if (!info.wasVoted) {
        addNotification(`${info.initiatorName} cleared the whiteboard`, 'info');
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, currentUser.id, addNotification]);

  // Emitters
  const emitStrokeLiveStart = useCallback((strokeId: string, point: Point, color: string, size: number, isHighlighter?: boolean) => {
    socketRef.current?.emit('stroke-live-start', { strokeId, point, color, size, isHighlighter });
  }, []);

  const emitStrokeLivePoint = useCallback((strokeId: string, point: Point) => {
    socketRef.current?.emit('stroke-live-point', { strokeId, point });
  }, []);

  const emitElementCreate = useCallback((element: CanvasElement) => {
    // Optimistic local update
    setElements((prev) => ({ ...prev, [element.id]: element }));
    socketRef.current?.emit('element-create', element);
  }, []);

  const emitElementUpdate = useCallback((element: CanvasElement) => {
    setElements((prev) => ({
      ...prev,
      [element.id]: { ...(prev[element.id] || {}), ...element },
    }));
    socketRef.current?.emit('element-update', element);
  }, []);

  const emitElementDelete = useCallback((elementId: string) => {
    setElements((prev) => {
      const next = { ...prev };
      delete next[elementId];
      return next;
    });
    socketRef.current?.emit('element-delete', { elementId });
  }, []);

  const emitElementsBatchDelete = useCallback((elementIds: string[]) => {
    setElements((prev) => {
      const next = { ...prev };
      elementIds.forEach((id) => delete next[id]);
      return next;
    });
    socketRef.current?.emit('elements-batch-delete', { elementIds });
  }, []);

  const emitCursorMove = useCallback((cursor: { x: number; y: number; tool?: ToolType; isDrawing?: boolean }) => {
    socketRef.current?.emit('cursor-move', cursor);
  }, []);

  const emitAudioLevel = useCallback((level: number, isSpeaking: boolean) => {
    socketRef.current?.emit('audio-level', { level, isSpeaking });
  }, []);

  const emitVoteClearStart = useCallback(() => {
    socketRef.current?.emit('vote-clear-start');
  }, []);

  const emitVoteClearCast = useCallback((vote: boolean) => {
    socketRef.current?.emit('vote-clear-cast', { vote });
  }, []);

  const emitVoteClearCancel = useCallback(() => {
    socketRef.current?.emit('vote-clear-cancel');
  }, []);

  const emitClearBoardDirect = useCallback(() => {
    setElements({});
    socketRef.current?.emit('clear-board-direct');
  }, []);

  const updateUserName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    sessionStorage.setItem('collab_user_name', trimmed);
    setCurrentUser((prev) => ({ ...prev, name: trimmed }));
    // Re-join with updated identity
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-room', {
        roomId,
        user: { ...currentUser, name: trimmed },
      });
    }
  }, [currentUser, roomId]);

  const updateUserColor = useCallback((color: string) => {
    sessionStorage.setItem('collab_user_color', color);
    setCurrentUser((prev) => ({ ...prev, color }));
    if (socketRef.current?.connected) {
      socketRef.current.emit('join-room', {
        roomId,
        user: { ...currentUser, color },
      });
    }
  }, [currentUser, roomId]);

  const switchRoom = useCallback((newRoomId: string) => {
    const cleaned = newRoomId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!cleaned || cleaned === roomId) return;
    setRoomId(cleaned);
  }, [roomId]);

  return {
    roomId,
    currentUser,
    isHost,
    isConnected,
    elements,
    users,
    liveStrokes,
    voteToClear,
    notifications,
    emitStrokeLiveStart,
    emitStrokeLivePoint,
    emitElementCreate,
    emitElementUpdate,
    emitElementDelete,
    emitElementsBatchDelete,
    emitCursorMove,
    emitAudioLevel,
    emitVoteClearStart,
    emitVoteClearCast,
    emitVoteClearCancel,
    emitClearBoardDirect,
    updateUserName,
    updateUserColor,
    switchRoom,
    addNotification,
  };
}
