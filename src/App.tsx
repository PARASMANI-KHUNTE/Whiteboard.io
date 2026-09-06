import React, { useState, useCallback, useRef } from 'react';
import { ToolType, CanvasElement, DrawingStroke, StickyNote, TextElement } from './types';
import { useSocket } from './hooks/useSocket';
import { useAudioVisualizer } from './hooks/useAudioVisualizer';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { VoteToClearModal } from './components/VoteToClearModal';
import { Info, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [currentColor, setCurrentColor] = useState<string>('#0f172a'); // Ink charcoal
  const [currentSize, setCurrentSize] = useState<number>(3); // Fine default
  const [myCreatedElementIds, setMyCreatedElementIds] = useState<string[]>([]);
  const [showWelcomeHint, setShowWelcomeHint] = useState<boolean>(true);

  // Real-time WebSocket connection hook
  const {
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
  } = useSocket();

  // Audio reactivity & mic hook ("The Wow Feature")
  const {
    isMicActive,
    audioLevel,
    isSpeaking,
    frequencyData,
    isSimulated,
    toggleMic,
    toggleSimulated,
  } = useAudioVisualizer();

  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle local element creation & track for undo
  const handleElementCreate = useCallback(
    (element: CanvasElement) => {
      emitElementCreate(element);
      setMyCreatedElementIds((prev) => [...prev, element.id]);
    },
    [emitElementCreate]
  );

  // Undo last locally created element
  const handleUndo = useCallback(() => {
    if (myCreatedElementIds.length === 0) return;
    const lastId = myCreatedElementIds[myCreatedElementIds.length - 1];
    setMyCreatedElementIds((prev) => prev.slice(0, -1));
    emitElementDelete(lastId);
  }, [myCreatedElementIds, emitElementDelete]);

  // Request clear board
  const handleRequestClear = useCallback(() => {
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
      const ok = window.confirm('Clear all drawings and notes from the board?');
      if (ok) {
        emitClearBoardDirect();
        setMyCreatedElementIds([]);
        addNotification('Whiteboard cleared', 'info');
      }
    }
  }, [users, elements, emitVoteClearStart, emitClearBoardDirect, addNotification]);

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

    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    addNotification('Whiteboard exported as PNG', 'success');
  }, [elements, roomId, addNotification]);

  const isMultiplayer = Object.keys(users).length > 1;

  return (
    <div id="collaborative-whiteboard-app" className="relative w-screen h-screen overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        roomId={roomId}
        currentUser={currentUser}
        users={users}
        isConnected={isConnected}
        isHost={isHost}
        onUpdateUserName={updateUserName}
        onUpdateUserColor={updateUserColor}
        onSwitchRoom={switchRoom}
        isMicActive={isMicActive}
        audioLevel={audioLevel}
        isSpeaking={isSpeaking}
        frequencyData={frequencyData}
        isSimulated={isSimulated}
        onToggleMic={toggleMic}
        onToggleSimulated={toggleSimulated}
        onAudioLevelChange={emitAudioLevel}
      />

      {/* Main Interactive Canvas Area */}
      <Canvas
        currentTool={currentTool}
        currentColor={currentColor}
        currentSize={currentSize}
        currentUserId={currentUser.id}
        currentUserName={currentUser.name}
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
      />

      {/* Bottom Floating Toolbar */}
      <Toolbar
        currentTool={currentTool}
        currentColor={currentColor}
        currentSize={currentSize}
        canUndo={myCreatedElementIds.length > 0}
        onSelectTool={setCurrentTool}
        onSelectColor={setCurrentColor}
        onSelectSize={setCurrentSize}
        onUndo={handleUndo}
        onRequestClear={handleRequestClear}
        onExport={handleExport}
        isMultiplayer={isMultiplayer}
      />

      {/* Vote to Clear Modal Banner ("The Wow Feature") */}
      {voteToClear && voteToClear.active && (
        <VoteToClearModal
          vote={voteToClear}
          currentUserId={currentUser.id}
          onCastVote={emitVoteClearCast}
          onCancelVote={emitVoteClearCancel}
        />
      )}

      {/* Quick Start Prompt & Instructions */}
      {showWelcomeHint && (
        <div
          id="welcome-hint-pill"
          className="fixed top-20 left-6 z-30 bg-white border border-slate-200 shadow-xl rounded-2xl p-4 max-w-xs text-xs text-slate-700 animate-in fade-in duration-300 select-none"
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
            Click <strong className="text-slate-700 font-semibold">Share Link</strong> to invite friends to draw together in real-time. Use the <strong className="text-slate-700 font-semibold">Audio Wave</strong> to visualize speaking activity!
          </p>
        </div>
      )}

      {/* Floating System Notifications */}
      <div id="system-notifications" className="fixed bottom-12 right-6 z-50 flex flex-col gap-2 pointer-events-none">
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

      {/* Clean Minimalism Status Footer */}
      <footer
        id="whiteboard-status-footer"
        className="fixed bottom-0 left-0 right-0 h-8 bg-slate-50 border-t border-slate-200 px-6 flex items-center justify-between z-30 select-none text-[10px] text-slate-400 font-medium"
      >
        <div className="flex items-center gap-4 font-mono">
          <span>X: {cursorCoords.x.toFixed(1)}</span>
          <span>Y: {cursorCoords.y.toFixed(1)}</span>
          <span>Zoom: 100%</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-rose-400'
            }`}
          />
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider font-sans">
            System Online — Socket.io {isConnected ? 'Connected' : 'Offline'}
          </span>
        </div>
      </footer>
    </div>
  );
}
