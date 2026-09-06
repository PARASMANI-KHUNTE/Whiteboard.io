import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ToolType,
  CanvasElement,
  DrawingStroke,
  StickyNote,
  TextElement,
  RemoteUser,
  Point,
} from '../types';
import { StickyNoteItem } from './StickyNoteItem';
import { TextItem } from './TextItem';

interface CanvasProps {
  currentTool: ToolType;
  currentColor: string;
  currentSize: number;
  currentUserId: string;
  currentUserName: string;
  canWrite?: boolean;
  onRestrictedAttempt?: () => void;
  elements: Record<string, CanvasElement>;
  liveStrokes: Record<
    string,
    { strokeId: string; userId: string; points: Point[]; color: string; size: number; isHighlighter?: boolean }
  >;
  remoteUsers: Record<string, RemoteUser>;
  onElementCreate: (element: CanvasElement) => void;
  onElementUpdate: (element: CanvasElement) => void;
  onElementDelete: (id: string) => void;
  onElementsBatchDelete: (ids: string[]) => void;
  onCursorMove: (cursor: { x: number; y: number; tool?: ToolType; isDrawing?: boolean }) => void;
  onStrokeLiveStart: (strokeId: string, point: Point, color: string, size: number, isHighlighter?: boolean) => void;
  onStrokeLivePoint: (strokeId: string, point: Point) => void;
  onSelectTool?: (tool: ToolType) => void;
}

// Distance from point to line segment
function distanceToSegment(p: Point, v: Point, w: Point) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

export const Canvas: React.FC<CanvasProps> = ({
  currentTool,
  currentColor,
  currentSize,
  currentUserId,
  currentUserName,
  canWrite = true,
  onRestrictedAttempt,
  elements,
  liveStrokes,
  remoteUsers,
  onElementCreate,
  onElementUpdate,
  onElementDelete,
  onElementsBatchDelete,
  onCursorMove,
  onStrokeLiveStart,
  onStrokeLivePoint,
  onSelectTool,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);

  // Throttled cursor emission
  const lastCursorEmitRef = useRef<number>(0);

  // Draw helper for a single stroke
  const drawSingleStroke = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: { points: Point[]; color: string; size: number; isHighlighter?: boolean }) => {
      const points = stroke.points;
      if (points.length < 1) return;

      ctx.save();
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.isHighlighter ? stroke.size * 2.5 : stroke.size;

      if (stroke.isHighlighter) {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 0.35;
      } else {
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 1.0;
      }

      if (points.length === 1) {
        ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        ctx.restore();
        return;
      }

      // Smooth path with quadratic curves
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.stroke();
      ctx.restore();
    },
    []
  );

  // Redraw all elements on canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background for crisp transparent rendering over the clean dot grid
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Render all persistent strokes
    const elementList = Object.values(elements) as CanvasElement[];
    for (const el of elementList) {
      if (el.type === 'stroke') {
        drawSingleStroke(ctx, el as DrawingStroke);
      }
    }

    // Render live strokes streaming from remote collaborators
    const liveList = Object.values(liveStrokes);
    for (const ls of liveList) {
      drawSingleStroke(ctx, ls);
    }

    // Render locally active drawing stroke
    if (currentStroke) {
      drawSingleStroke(ctx, currentStroke);
    }

    ctx.restore();
  }, [elements, liveStrokes, currentStroke, drawSingleStroke]);

  // Handle canvas sizing and DPI scaling
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      renderCanvas();
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [renderCanvas]);

  // Re-render whenever strokes or elements change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Eraser collision check
  const checkAndEraseAtPoint = useCallback(
    (point: Point) => {
      const eraserRadius = currentSize * 2.5 + 8;
      const elementsToDelete: string[] = [];

      (Object.values(elements) as CanvasElement[]).forEach((el) => {
        if (el.type === 'stroke') {
          const stroke = el as DrawingStroke;
          for (let i = 0; i < stroke.points.length - 1; i++) {
            const dist = distanceToSegment(point, stroke.points[i], stroke.points[i + 1]);
            if (dist <= eraserRadius + stroke.size / 2) {
              elementsToDelete.push(stroke.id);
              break;
            }
          }
        }
      });

      if (elementsToDelete.length > 0) {
        onElementsBatchDelete(elementsToDelete);
      }
    },
    [elements, currentSize, onElementsBatchDelete]
  );

  // Mouse & Touch coordinate helper
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (!canWrite) {
      onRestrictedAttempt?.();
      return;
    }

    // Handle Sticky Note placement
    if (currentTool === 'sticky') {
      const newSticky: StickyNote = {
        id: 'sticky_' + Math.random().toString(36).substring(2, 9),
        type: 'sticky',
        x: Math.max(10, coords.x - 20),
        y: Math.max(10, coords.y - 20),
        width: 224,
        height: 150,
        text: '',
        color: '#fef08a', // Default pastel yellow
        userId: currentUserId,
        userName: currentUserName,
        updatedAt: Date.now(),
      };
      onElementCreate(newSticky);
      onSelectTool?.('pen'); // Return to pen tool so subsequent canvas interactions don't drop duplicate notes
      return;
    }

    // Handle Text placement
    if (currentTool === 'text') {
      const newText: TextElement = {
        id: 'text_' + Math.random().toString(36).substring(2, 9),
        type: 'text',
        x: coords.x,
        y: coords.y,
        text: '',
        color: currentColor,
        fontSize: currentSize === 3 ? 16 : currentSize === 6 ? 22 : 30,
        userId: currentUserId,
        userName: currentUserName,
        updatedAt: Date.now(),
      };
      onElementCreate(newText);
      onSelectTool?.('pen'); // Return to pen tool
      return;
    }

    // Handle Eraser
    if (currentTool === 'eraser') {
      setIsDrawing(true);
      checkAndEraseAtPoint(coords);
      return;
    }

    // Handle Drawing (Pen or Highlighter)
    if (currentTool === 'pen' || currentTool === 'highlighter') {
      setIsDrawing(true);
      const strokeId = 'stroke_' + Math.random().toString(36).substring(2, 9);
      const newStroke: DrawingStroke = {
        id: strokeId,
        type: 'stroke',
        points: [coords],
        color: currentColor,
        size: currentSize,
        isHighlighter: currentTool === 'highlighter',
        userId: currentUserId,
        createdAt: Date.now(),
      };

      setCurrentStroke(newStroke);
      onStrokeLiveStart(strokeId, coords, currentColor, currentSize, currentTool === 'highlighter');
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Broadcast cursor position (throttled ~30fps)
    const now = Date.now();
    if (now - lastCursorEmitRef.current > 33) {
      lastCursorEmitRef.current = now;
      onCursorMove({
        x: coords.x,
        y: coords.y,
        tool: currentTool,
        isDrawing,
      });
    }

    if (currentTool === 'eraser') {
      setEraserCursor(coords);
      if (isDrawing) {
        checkAndEraseAtPoint(coords);
      }
      return;
    } else {
      setEraserCursor(null);
    }

    if (!isDrawing || !currentStroke) return;

    // Point distance thresholding (filters micro-jitter & reduces payload size significantly)
    const lastPoint = currentStroke.points[currentStroke.points.length - 1];
    if (lastPoint) {
      const dist = Math.hypot(coords.x - lastPoint.x, coords.y - lastPoint.y);
      if (dist < 2.5) return;
    }

    // Add point to stroke
    const updatedPoints = [...currentStroke.points, coords];
    setCurrentStroke({
      ...currentStroke,
      points: updatedPoints,
    });

    onStrokeLivePoint(currentStroke.id, coords);
  };

  const handlePointerUp = () => {
    if (isDrawing && currentStroke && currentStroke.points.length > 0) {
      onElementCreate(currentStroke);
    }
    setIsDrawing(false);
    setCurrentStroke(null);
  };

  // Sticky and Text items
  const allElements = Object.values(elements) as CanvasElement[];
  const stickyNotes = allElements.filter((el) => el.type === 'sticky') as StickyNote[];
  const textElements = allElements.filter((el) => el.type === 'text') as TextElement[];
  const userList = Object.values(remoteUsers) as RemoteUser[];

  return (
    <div
      ref={containerRef}
      id="whiteboard-canvas-container"
      style={{
        backgroundImage: 'radial-gradient(#e2e8f0 1.25px, transparent 1.25px)',
        backgroundSize: '24px 24px',
      }}
      className={`relative w-full h-screen overflow-hidden bg-white select-none ${
        canWrite ? 'cursor-crosshair' : 'cursor-default'
      }`}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={() => {
        handlePointerUp();
        setEraserCursor(null);
      }}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
    >
      {/* Underlying Canvas for high-fps strokes */}
      <canvas ref={canvasRef} className="absolute inset-0 block touch-none" />

      {/* Eraser Cursor Indicator */}
      {canWrite && currentTool === 'eraser' && eraserCursor && (
        <div
          style={{
            transform: `translate(${eraserCursor.x}px, ${eraserCursor.y}px)`,
            width: `${(currentSize * 2.5 + 8) * 2}px`,
            height: `${(currentSize * 2.5 + 8) * 2}px`,
          }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-rose-400 bg-rose-200/30 z-30"
        />
      )}

      {/* Sticky Notes Layer */}
      {stickyNotes.map((note) => (
        <StickyNoteItem
          key={note.id}
          note={note}
          currentUserId={currentUserId}
          canWrite={canWrite}
          onUpdate={onElementUpdate}
          onDelete={onElementDelete}
        />
      ))}

      {/* Text Elements Layer */}
      {textElements.map((el) => (
        <TextItem
          key={el.id}
          element={el}
          currentUserId={currentUserId}
          canWrite={canWrite}
          onUpdate={onElementUpdate}
          onDelete={onElementDelete}
        />
      ))}

      {/* Remote Multiplayer Live Cursors */}
      {userList.map((user) => {
        if (!user.cursor || user.id === currentUserId) return null;
        const speaking = user.isSpeaking;

        return (
          <div
            key={user.id}
            id={`remote-cursor-${user.id}`}
            style={{
              transform: `translate(${user.cursor.x}px, ${user.cursor.y}px)`,
              transition: 'transform 0.08s ease-out',
            }}
            className="pointer-events-none absolute top-0 left-0 z-30 flex flex-col items-start"
          >
            {/* SVG Cursor Pointer */}
            <svg
              className="w-5 h-5 drop-shadow-sm"
              viewBox="0 0 24 24"
              fill={user.color || '#3b82f6'}
              stroke="#ffffff"
              strokeWidth="1.5"
            >
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35z" />
            </svg>

            {/* Remote User Name & Activity Tag */}
            <div
              style={{ backgroundColor: user.color || '#3b82f6' }}
              className={`-mt-1 ml-3 px-2 py-0.5 rounded-full text-white text-[10px] font-semibold whitespace-nowrap shadow-sm flex items-center gap-1.5 transition-all ${
                speaking ? 'ring-2 ring-blue-400 scale-105' : ''
              }`}
            >
              {speaking && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              )}
              <span>{user.name}</span>
              {user.cursor.isDrawing && (
                <span className="text-[9px] opacity-80 font-normal">✍️</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
