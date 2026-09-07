import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { CanvasElement, RemoteUser, VoteToClearState, ToolType, Point, AuthUser } from '../types';
import { BACKEND_URL } from '../config';

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
  if (typeof window === 'undefined') {
    return { id: 'user_ssr', name: 'Artist Guest', color: '#3b82f6' };
  }

  // Generate a distinct tab session ID to ensure seamless collaboration across multiple tabs/windows
  let tabId = (window as any).__collab_tab_session_id;
  if (!tabId) {
    tabId = 'u_' + Math.random().toString(36).substring(2, 9);
    (window as any).__collab_tab_session_id = tabId;
  }

  const storedName = sessionStorage.getItem('collab_user_name');
  const storedColor = sessionStorage.getItem('collab_user_color');

  const animal = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
  const name = storedName || `Artist ${animal}`;
  const color = storedColor || USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

  sessionStorage.setItem('collab_user_name', name);
  sessionStorage.setItem('collab_user_color', color);

  return { id: tabId, name, color };
}

export function generateRandomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 3; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${p1}-${p2}`;
}

export function getRoomIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam && roomParam.trim()) {
    return roomParam.trim().toUpperCase();
  }
  // Check hash
  if (window.location.hash && window.location.hash.length > 1) {
    return window.location.hash.replace('#', '').toUpperCase();
  }
  return null;
}

export function setRoomIdInUrl(roomId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set('room', roomId);
  } else {
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url.toString());
}

export function useSocket(initialRoomId?: string | null, authUser?: AuthUser | null, authToken?: string | null) {
  const [roomId, setRoomId] = useState<string | null>(() => {
    if (initialRoomId !== undefined) return initialRoomId;
    return getRoomIdFromUrl();
  });
  const [currentUser, setCurrentUser] = useState<RemoteUser>(() => {
    if (authUser) {
      return {
        id: authUser.id,
        name: authUser.name,
        color: authUser.color,
        role: 'editor',
        canWrite: true,
        isGuest: authUser.isGuest,
        username: authUser.username,
      };
    }
    const initial = getInitialUser();
    return {
      id: initial.id,
      name: initial.name,
      color: initial.color,
      role: 'editor',
      canWrite: true,
      isGuest: true,
    };
  });

  const [isHost, setIsHost] = useState(false);
  const [canWrite, setCanWrite] = useState<boolean>(true);
  const [roomName, setRoomName] = useState<string>('');
  const [creatorId, setCreatorId] = useState<string>('');
  const [creatorName, setCreatorName] = useState<string>('');
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isKicked, setIsKicked] = useState<boolean>(false);
  const [kickedReason, setKickedReason] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [elements, setElements] = useState<Record<string, CanvasElement>>({});
  const [users, setUsers] = useState<Record<string, RemoteUser>>({});
  const [voteToClear, setVoteToClear] = useState<VoteToClearState | null>(null);
  const [liveStrokes, setLiveStrokes] = useState<
    Record<string, { strokeId: string; userId: string; points: Point[]; color: string; size: number; isHighlighter?: boolean }>
  >({});
  const [notifications, setNotifications] = useState<{ id: string; text: string; type: 'info' | 'success' | 'warning' }[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const isSoloMigrationRef = useRef<boolean>(false);
  const connectErrorNotifiedRef = useRef<boolean>(false);
  const currentUserRef = useRef<RemoteUser>(currentUser);
  currentUserRef.current = currentUser;
  const authTokenRef = useRef<string | null | undefined>(authToken);
  authTokenRef.current = authToken;

  // Sync currentUser with authUser if provided
  useEffect(() => {
    if (authUser) {
      setCurrentUser((prev) => ({
        ...prev,
        name: authUser.name,
        color: authUser.color,
        username: authUser.username,
        isGuest: authUser.isGuest,
      }));
    }
  }, [authUser]);

  const addNotification = useCallback((text: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev.slice(-3), { id, text, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 4000);
  }, []);

  const elementsRef = useRef<Record<string, CanvasElement>>(elements);
  elementsRef.current = elements;

  // Connect socket
  useEffect(() => {
    if (!roomId) {
      setIsConnected(false);
      setIsHost(true);
      setCanWrite(true);
      setIsLocked(false);
      setIsKicked(false);
      setKickedReason(null);
      setUsers({});
      setLiveStrokes({});
      setVoteToClear(null);
      return;
    }

    setRoomIdInUrl(roomId);
    setIsKicked(false);
    setKickedReason(null);

    const socket = io(BACKEND_URL || undefined, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      timeout: 20000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      connectErrorNotifiedRef.current = false;
      setIsConnected(true);
      socket.emit('join-room', {
        roomId,
        user: currentUserRef.current,
        token: authTokenRef.current || undefined,
      });
    });

    socket.on('connect_error', (err) => {
      console.warn('Realtime connection issue (reconnecting):', err.message);
      if (!connectErrorNotifiedRef.current) {
        connectErrorNotifiedRef.current = true;
        addNotification('Realtime connection lost — reconnecting...', 'warning');
      }
    });

    socket.on('reconnect', () => {
      setIsConnected(true);
      socket.emit('join-room', {
        roomId,
        user: currentUserRef.current,
        token: authTokenRef.current || undefined,
      });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on(
      'room-init',
      (data: {
        roomId: string;
        roomName?: string;
        creatorId?: string;
        creatorName?: string;
        isLocked?: boolean;
        elements: Record<string, CanvasElement>;
        users: Record<string, RemoteUser>;
        voteToClear: VoteToClearState | null;
        yourRole: 'admin' | 'editor' | 'viewer';
        canWrite: boolean;
        isHost: boolean;
      }) => {
        const serverElements = data.elements || {};
        if (isSoloMigrationRef.current) {
          const localElements = elementsRef.current || {};
          const merged = { ...serverElements, ...localElements };
          setElements(merged);
          isSoloMigrationRef.current = false;
          const localItems = Object.values(localElements);
          if (localItems.length > 0) {
            socket.emit('elements-batch-create', localItems);
          }
        } else {
          setElements(serverElements);
        }
        setUsers(data.users || {});
        setVoteToClear(data.voteToClear);
        setIsHost(data.isHost);
        setCanWrite(data.canWrite);
        if (data.roomName) setRoomName(data.roomName);
        if (data.creatorId) setCreatorId(data.creatorId);
        if (data.creatorName) setCreatorName(data.creatorName);
        if (typeof data.isLocked === 'boolean') setIsLocked(data.isLocked);
      }
    );

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

    // Admin & Permissions Events
    socket.on('permission-updated', (data: { canWrite: boolean; role: 'editor' | 'viewer'; message?: string }) => {
      setCanWrite(data.canWrite);
      addNotification(
        data.message || (data.canWrite ? 'Drawing permission restored by host.' : 'Drawing permission revoked by host.'),
        data.canWrite ? 'success' : 'warning'
      );
    });

    socket.on('user-permission-changed', (data: { userId: string; canWrite: boolean; role: 'editor' | 'viewer' }) => {
      setUsers((prev) => {
        const u = prev[data.userId];
        if (!u) return prev;
        return {
          ...prev,
          [data.userId]: {
            ...u,
            canWrite: data.canWrite,
            role: data.role,
          },
        };
      });
    });

    socket.on('user-kicked', (data: { userId: string; userName: string; reason: string }) => {
      addNotification(`${data.userName} was removed by room host`, 'info');
    });

    socket.on('room-host-migrated', (data: { newHostId: string; newHostName: string; message: string }) => {
      setCreatorId(data.newHostId);
      setCreatorName(data.newHostName);
      if (currentUserRef.current.id === data.newHostId) {
        setIsHost(true);
        setCanWrite(true);
        addNotification('You are now the host of this room.', 'success');
      } else {
        addNotification(data.message || `${data.newHostName} is now the host.`, 'info');
      }
      setUsers((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((id) => {
          if (id === data.newHostId) {
            next[id] = { ...next[id], isHost: true, role: 'admin', canWrite: true };
          } else if (next[id].isHost) {
            next[id] = { ...next[id], isHost: false };
          }
        });
        return next;
      });
    });

    socket.on('kicked', (data: { reason: string }) => {
      setIsKicked(true);
      setKickedReason(data.reason || 'You have been removed from this room by the host.');
      socket.disconnect();
    });

    socket.on('room-deleted', (data: { roomId: string; message?: string }) => {
      setIsKicked(true);
      setKickedReason(data.message || 'This room has been permanently deleted by the host.');
      addNotification(data.message || 'Room was deleted by the host.', 'warning');
      socket.disconnect();
    });

    socket.on('room-lock-changed', (data: { isLocked: boolean; users?: Record<string, RemoteUser> }) => {
      setIsLocked(data.isLocked);
      if (data.users) {
        setUsers(data.users);
      }
      if (!isHost) {
        setCanWrite(!data.isLocked);
        addNotification(
          data.isLocked ? 'Board was locked by host (View-Only).' : 'Board was unlocked by host.',
          'info'
        );
      }
    });

    socket.on('permission-denied', (data: { message: string }) => {
      addNotification(data.message || 'Permission Denied: Writing is restricted.', 'warning');
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

    // Voice Chat status update from other users
    socket.on('voice-status-updated', (data: { userId: string; isMuted?: boolean; isDeafened?: boolean; voiceConnected?: boolean }) => {
      setUsers((prev) => {
        const user = prev[data.userId];
        if (!user) return prev;
        return {
          ...prev,
          [data.userId]: {
            ...user,
            isMuted: typeof data.isMuted === 'boolean' ? data.isMuted : user.isMuted,
            isDeafened: typeof data.isDeafened === 'boolean' ? data.isDeafened : user.isDeafened,
            voiceConnected: typeof data.voiceConnected === 'boolean' ? data.voiceConnected : user.voiceConnected,
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
  }, [roomId, addNotification]);

  // Emitters
  const emitStrokeLiveStart = useCallback((strokeId: string, point: Point, color: string, size: number, isHighlighter?: boolean) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('stroke-live-start', { strokeId, point, color, size, isHighlighter });
    }
  }, [roomId]);

  const emitStrokeLivePoint = useCallback((strokeId: string, point: Point) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('stroke-live-point', { strokeId, point });
    }
  }, [roomId]);

  const emitElementCreate = useCallback((element: CanvasElement) => {
    // Optimistic local update
    setElements((prev) => ({ ...prev, [element.id]: element }));
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('element-create', element);
    }
  }, [roomId]);

  const emitElementUpdate = useCallback((element: CanvasElement) => {
    setElements((prev) => ({
      ...prev,
      [element.id]: { ...(prev[element.id] || {}), ...element },
    }));
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('element-update', element);
    }
  }, [roomId]);

  const emitElementDelete = useCallback((elementId: string) => {
    setElements((prev) => {
      const next = { ...prev };
      delete next[elementId];
      return next;
    });
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('element-delete', { elementId });
    }
  }, [roomId]);

  const emitElementsBatchDelete = useCallback((elementIds: string[]) => {
    setElements((prev) => {
      const next = { ...prev };
      elementIds.forEach((id) => delete next[id]);
      return next;
    });
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('elements-batch-delete', { elementIds });
    }
  }, [roomId]);

  const emitCursorMove = useCallback((cursor: { x: number; y: number; tool?: ToolType; isDrawing?: boolean }) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('cursor-move', cursor);
    }
  }, [roomId]);

  const emitAudioLevel = useCallback((level: number, isSpeaking: boolean) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('audio-level', { level, isSpeaking });
    }
  }, [roomId]);

  const emitVoteClearStart = useCallback(() => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('vote-clear-start');
    }
  }, [roomId]);

  const emitVoteClearCast = useCallback((vote: boolean) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('vote-clear-cast', { vote });
    }
  }, [roomId]);

  const emitVoteClearCancel = useCallback(() => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('vote-clear-cancel');
    }
  }, [roomId]);

  const emitClearBoardDirect = useCallback(() => {
    setElements({});
    setLiveStrokes({});
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('clear-board-direct');
    }
  }, [roomId]);

  const updateUserName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    sessionStorage.setItem('collab_user_name', trimmed);
    setCurrentUser((prev) => ({ ...prev, name: trimmed }));
    // Re-join with updated identity
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('join-room', {
        roomId,
        user: { ...currentUser, name: trimmed },
      });
    }
  }, [currentUser, roomId]);

  const updateUserColor = useCallback((color: string) => {
    sessionStorage.setItem('collab_user_color', color);
    setCurrentUser((prev) => ({ ...prev, color }));
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('join-room', {
        roomId,
        user: { ...currentUser, color },
      });
    }
  }, [currentUser, roomId]);

  const switchRoom = useCallback((newRoomId: string | null) => {
    isSoloMigrationRef.current = false;
    setElements({});
    elementsRef.current = {};
    setLiveStrokes({});
    setUsers({});
    if (!newRoomId) {
      setRoomId(null);
      setRoomIdInUrl(null);
      return;
    }
    const cleaned = newRoomId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-');
    if (!cleaned || cleaned === roomId) return;
    setRoomId(cleaned);
    setRoomIdInUrl(cleaned);
  }, [roomId]);

  const convertToMultiplayerRoom = useCallback((customCode?: string): string => {
    isSoloMigrationRef.current = true;
    const code = customCode ? customCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '-') : generateRandomRoomCode();
    setRoomId(code);
    setRoomIdInUrl(code);
    return code;
  }, []);

  // Admin Privileges Emitters
  const setParticipantPermission = useCallback((targetUserId: string, targetCanWrite: boolean) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('admin-set-permission', { targetUserId, canWrite: targetCanWrite });
    }
  }, [roomId]);

  const kickParticipant = useCallback((targetUserId: string, reason?: string) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('admin-kick-user', { targetUserId, reason });
    }
  }, [roomId]);

  const toggleLockBoard = useCallback((targetIsLocked: boolean) => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('admin-toggle-lock', { isLocked: targetIsLocked });
    }
  }, [roomId]);

  const deleteCurrentRoom = useCallback(() => {
    if (socketRef.current?.connected && roomId) {
      socketRef.current.emit('admin-delete-room', { roomId });
    }
  }, [roomId]);

  const resetKickedState = useCallback(() => {
    setIsKicked(false);
    setKickedReason(null);
  }, []);

  return {
    roomId,
    isSoloMode: !roomId,
    convertToMultiplayerRoom,
    roomName,
    creatorId,
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
    socket: socketRef.current,
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
    setParticipantPermission,
    kickParticipant,
    toggleLockBoard,
    deleteCurrentRoom,
    resetKickedState,
    updateUserName,
    updateUserColor,
    switchRoom,
    addNotification,
  };
}
