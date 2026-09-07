import { useState, useCallback, useEffect, useRef } from 'react';
import { ToolType, ShapeType, CanvasElement, DrawingStroke, StickyNote, TextElement, ShapeElement, IconElement } from './types';
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
import { ErrorBoundary } from './components/ErrorBoundary';
import { Info, Sparkles, AlertCircle, CheckCircle2, UserX } from 'lucide-react';

export default function App() {
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState<string>('#0f172a'); // Ink charcoal
  const [currentSize, setCurrentSize] = useState<number>(3); // Fine default
  const [selectedShapeType, setSelectedShapeType] = useState<ShapeType>('rectangle');
  const [selectedIconName, setSelectedIconName] = useState<string>('star');
  const [myCreatedElementIds, setMyCreatedElementIds] = useState<string[]>([]);
  const [showWelcomeHint, setShowWelcomeHint] = useState<boolean>(true);
  const [hasChosenSessionMode, setHasChosenSessionMode] = useState<boolean>(false);

  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState<boolean>(false);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
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

  // Theme hook
  const { theme, toggleTheme } = useTheme();

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

  const handleLogout = useCallback(async () => {
    await logout();
    addNotification('Logged out successfully. Switched to guest session.', 'info');
  }, [logout]);

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
    socket,
  } = useSocket(undefined, authUser, token);

  const handleDeleteRoom = useCallback(async (targetRoomId: string) => {
    const isCurrent = targetRoomId === roomId;
    if (isCurrent) {
      deleteCurrentRoom();
    }
    const res = await deleteRoom(targetRoomId);
    if (res.success) {
      addNotification(`Room ${targetRoomId} deleted successfully.`, 'success');
      if (isCurrent) {
        switchRoom(null);
      }
    } else {
      addNotification(res.error || `Failed to delete room ${targetRoomId}.`, 'warning');
    }
    return res;
  }, [roomId, deleteCurrentRoom, deleteRoom, addNotification, switchRoom]);

  // Convert current solo canvas to a collaborative multiplayer room
  const handleShareAndGoLive = useCallback(() => {
    const newRoomCode = convertToMultiplayerRoom();
    setShowShareModal(true);
    addNotification(`Canvas converted to multiplayer room ${newRoomCode}!`, 'success');
  }, [convertToMultiplayerRoom, addNotification]);

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

  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle local element creation & track for undo
  const handleElementCreate = useCallback(
    (element: CanvasElement) => {
      if (!canWrite) {
        addNotification('Drawing is restricted by the room host', 'warning');
        return;
      }
      emitElementCreate(element);
      setMyCreatedElementIds((prev) => [...prev, element.id]);
    },
    [canWrite, emitElementCreate, addNotification]
  );

  // Reset undo history on room change
  useEffect(() => {
    setMyCreatedElementIds([]);
  }, [roomId]);

  // Undo last locally created element
  const handleUndo = useCallback(() => {
    if (!canWrite) return;
    if (myCreatedElementIds.length === 0) return;
    const lastId = myCreatedElementIds[myCreatedElementIds.length - 1];
    setMyCreatedElementIds((prev) => prev.slice(0, -1));
    if (elements[lastId]) {
      emitElementDelete(lastId);
    }
  }, [canWrite, myCreatedElementIds, elements, emitElementDelete]);

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
          setMyCreatedElementIds([]);
          addNotification('Whiteboard cleared', 'info');
          setConfirmModalState((prev) => ({ ...prev, isOpen: false }));
        },
      });
    }
  }, [canWrite, users, elements, emitVoteClearStart, emitClearBoardDirect, addNotification]);

  // Export board as PNG
  const handleExport = useCallback(() => {
    const canvas = document.createElement('canvas');
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw strokes
    (Object.values(elements) as CanvasElement[]).forEach((el) => {
      if (el.type === 'stroke') {
        const stroke = el as DrawingStroke;
        const points = stroke.points;
        if (points.length < 1) return;

        ctx.save();
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = stroke.isHighlighter ? stroke.size * 2.5 : stroke.size;
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = stroke.isHighlighter ? 0.35 : 1.0;

        if (points.length === 1) {
          ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle;
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

    // Draw sticky notes
    (Object.values(elements) as CanvasElement[]).forEach((el) => {
      if (el.type === 'sticky') {
        const note = el as StickyNote;
        ctx.save();
        ctx.fillStyle = note.color || '#fef08a';
        ctx.strokeStyle = '#e2e8f0';
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(note.x, note.y, note.width || 200, note.height || 140, 8);
        ctx.fill();
        ctx.stroke();

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#1e293b';
        ctx.font = '14px sans-serif';
        const lines = (note.text || '').split('\n');
        lines.forEach((line, idx) => {
          ctx.fillText(line, note.x + 12, note.y + 28 + idx * 18, (note.width || 200) - 24);
        });
        ctx.restore();
      }
    });

    // Draw text elements
    (Object.values(elements) as CanvasElement[]).forEach((el) => {
      if (el.type === 'text') {
        const t = el as TextElement;
        ctx.save();
        ctx.fillStyle = t.color || '#1e293b';
        ctx.font = `${t.fontSize || 18}px sans-serif`;
        ctx.fillText(t.text || '', t.x, t.y + (t.fontSize || 18));
        ctx.restore();
      }
    });

    // Draw shapes
    (Object.values(elements) as CanvasElement[]).forEach((el) => {
      if (el.type === 'shape') {
        const s = el as ShapeElement;
        ctx.save();
        ctx.strokeStyle = s.color || '#0f172a';
        ctx.fillStyle = s.fillColor && s.fillColor !== 'transparent' ? s.fillColor : 'transparent';
        ctx.lineWidth = s.strokeWidth || 3;
        ctx.lineJoin = 'round';
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
        ctx.restore();
      }
    });

    // Draw icons
    (Object.values(elements) as CanvasElement[]).forEach((el) => {
      if (el.type === 'icon') {
        const ic = el as IconElement;
        ctx.save();
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
        ctx.fillText(symbol, ic.x + (ic.size + 16) / 2, ic.y + (ic.size + 16) / 2);
        ctx.restore();
      }
    });

    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    addNotification('Whiteboard exported as PNG', 'success');
  }, [elements, roomId, addNotification]);

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
        onUpdateUserName={updateUserName}
        onUpdateUserColor={updateUserColor}
        onSwitchRoom={switchRoom}
        onLogout={handleLogout}
        theme={theme}
        onToggleTheme={toggleTheme}
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
        onJoinVoice={startVoiceChat}
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
        onElementUpdate={emitElementUpdate}
        onElementDelete={emitElementDelete}
        onElementsBatchDelete={emitElementsBatchDelete}
        onCursorMove={(pos) => {
          setCursorCoords(pos);
          emitCursorMove(pos);
        }}
        onStrokeLiveStart={emitStrokeLiveStart}
        onStrokeLivePoint={emitStrokeLivePoint}
        onSelectTool={setCurrentTool}
        selectedShapeType={selectedShapeType}
        selectedIconName={selectedIconName}
        onRegisterSelectAll={(fn) => {
          selectAllHandlerRef.current = fn;
        }}
      />

      {/* Bottom Floating Toolbar */}
      <Toolbar
        currentTool={currentTool}
        currentColor={currentColor}
        currentSize={currentSize}
        canUndo={myCreatedElementIds.length > 0}
        canWrite={canWrite}
        selectedShapeType={selectedShapeType}
        selectedIconName={selectedIconName}
        onSelectTool={setCurrentTool}
        onSelectColor={setCurrentColor}
        onSelectSize={setCurrentSize}
        onSelectShape={setSelectedShapeType}
        onSelectIcon={setSelectedIconName}
        onUndo={handleUndo}
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
          onCreateRoom={createRoom}
          onFetchRooms={fetchRooms}
        />
      </ErrorBoundary>

      {/* Share Room Code & Link Modal */}
      <ShareRoomModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        roomCode={roomId || ''}
        roomName={roomName}
        isHost={isHost}
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
