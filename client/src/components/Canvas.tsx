import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ToolType,
  CanvasElement,
  DrawingStroke,
  StickyNote,
  TextElement,
  ShapeElement,
  IconElement,
  ShapeType,
  RemoteUser,
  Point,
} from '../types';
import { StickyNoteItem } from './StickyNoteItem';
import { TextItem } from './TextItem';
import { ShapeItem } from './ShapeItem';
import { IconItem } from './IconItem';
import { ZoomControls } from './ZoomControls';

interface CanvasProps {
  currentTool: ToolType;
  currentColor: string;
  currentSize: number;
  currentUserId: string;
  currentUserName: string;
  canWrite?: boolean;
  selectedShapeType?: ShapeType;
  selectedIconName?: string;
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
  selectedShapeType = 'rectangle',
  selectedIconName = 'star',
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

  // Pan, Zoom & Viewport state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);

  // Active object selection state (keeps controls pinned open)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number }>({
    mouseX: 0,
    mouseY: 0,
    panX: 0,
    panY: 0,
  });

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);

  // Throttled cursor emission
  const lastCursorEmitRef = useRef<number>(0);

  // Spacebar pan listener and Escape deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setSpacePressed(true);
      }
      if (e.code === 'Escape') {
        setSelectedElementId(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    const handleAuxClick = (e: MouseEvent) => {
      // Prevent default autoscroll on middle click
      if (e.button === 1) e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('auxclick', handleAuxClick, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('auxclick', handleAuxClick);
    };
  }, []);

  // Native Wheel listener for Zooming (Ctrl+Wheel / Pinch) and Panning
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom centered at cursor position
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoom((prevZoom) => {
          const nextZoom = Math.max(0.2, Math.min(3.0, prevZoom * zoomFactor));
          setPan((prevPan) => {
            const worldX = (mouseX - prevPan.x) / prevZoom;
            const worldY = (mouseY - prevPan.y) / prevZoom;
            return {
              x: mouseX - worldX * nextZoom,
              y: mouseY - worldY * nextZoom,
            };
          });
          return nextZoom;
        });
      } else {
        // Two-finger trackpad or standard wheel scroll pans the canvas
        setPan((prevPan) => ({
          x: prevPan.x - e.deltaX,
          y: prevPan.y - e.deltaY,
        }));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Draw helper for a single stroke in world coords
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

  // Redraw all elements on canvas with Pan and Zoom transformation
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear entire screen
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    // Apply Pan and Zoom to the drawing context!
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

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
  }, [elements, liveStrokes, currentStroke, drawSingleStroke, pan, zoom]);

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

  // Re-render whenever strokes, pan, or zoom change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Eraser collision check in world coordinates
  const checkAndEraseAtPoint = useCallback(
    (point: Point) => {
      const eraserRadius = (currentSize * 2.5 + 8) / zoom;
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
    [elements, currentSize, zoom, onElementsBatchDelete]
  );

  // Convert screen mouse coordinates into world coordinates
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

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    // Check if Middle Mouse Button (button === 1), Hand Tool, or Spacebar Pan
    const isMiddleClick = 'button' in e && e.button === 1;
    const isHandTool = currentTool === 'hand';
    const isSpacePan = spacePressed;

    if (isMiddleClick || isHandTool || isSpacePan) {
      e.preventDefault();
      setIsPanning(true);
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      panStartRef.current = {
        mouseX: clientX,
        mouseY: clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    // Deselect any active element when clicking canvas background
    setSelectedElementId(null);

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
      onSelectTool?.('pen'); // Return to pen tool
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

    // Handle Shape placement
    if (currentTool === 'shape') {
      const shapeW = 160;
      const shapeH = 120;
      const newShape: ShapeElement = {
        id: 'shape_' + Math.random().toString(36).substring(2, 9),
        type: 'shape',
        shapeType: selectedShapeType || 'rectangle',
        x: Math.max(10, coords.x - shapeW / 2),
        y: Math.max(10, coords.y - shapeH / 2),
        width: shapeW,
        height: shapeH,
        color: currentColor,
        fillColor: `${currentColor}15`,
        strokeWidth: currentSize,
        userId: currentUserId,
        userName: currentUserName,
        updatedAt: Date.now(),
      };
      onElementCreate(newShape);
      setSelectedElementId(newShape.id);
      onSelectTool?.('pen'); // Return to pen tool
      return;
    }

    // Handle Icon placement
    if (currentTool === 'icon') {
      const iconSize = 48;
      const newIcon: IconElement = {
        id: 'icon_' + Math.random().toString(36).substring(2, 9),
        type: 'icon',
        iconName: selectedIconName || 'star',
        x: Math.max(10, coords.x - iconSize / 2),
        y: Math.max(10, coords.y - iconSize / 2),
        size: iconSize,
        color: currentColor,
        userId: currentUserId,
        userName: currentUserName,
        updatedAt: Date.now(),
      };
      onElementCreate(newIcon);
      setSelectedElementId(newIcon.id);
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
    // Handle Panning / Canvas Movement
    if (isPanning) {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      const deltaX = clientX - panStartRef.current.mouseX;
      const deltaY = clientY - panStartRef.current.mouseY;
      setPan({
        x: panStartRef.current.panX + deltaX,
        y: panStartRef.current.panY + deltaY,
      });
      return;
    }

    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Track cursor on screen for eraser
    if (currentTool === 'eraser') {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setEraserCursor({ x: clientX - rect.left, y: clientY - rect.top });
      }
    }

    // Emit live cursor coordinates in world space (throttled)
    const now = Date.now();
    if (now - lastCursorEmitRef.current > 40) {
      lastCursorEmitRef.current = now;
      onCursorMove({
        x: coords.x,
        y: coords.y,
        tool: currentTool,
        isDrawing: isDrawing && (currentTool === 'pen' || currentTool === 'highlighter'),
      });
    }

    if (!isDrawing) return;

    if (currentTool === 'eraser') {
      checkAndEraseAtPoint(coords);
      return;
    }

    if (!currentStroke) return;

    // Add point to stroke
    const updatedPoints = [...currentStroke.points, coords];
    setCurrentStroke({
      ...currentStroke,
      points: updatedPoints,
    });

    onStrokeLivePoint(currentStroke.id, coords);
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawing && currentStroke && currentStroke.points.length > 0) {
      onElementCreate(currentStroke);
    }
    setIsDrawing(false);
    setCurrentStroke(null);
  };

  // Sticky, Text, Shape, and Icon items
  const allElements = Object.values(elements) as CanvasElement[];
  const stickyNotes = allElements.filter((el) => el.type === 'sticky') as StickyNote[];
  const textElements = allElements.filter((el) => el.type === 'text') as TextElement[];
  const shapeElements = allElements.filter((el) => el.type === 'shape') as ShapeElement[];
  const iconElements = allElements.filter((el) => el.type === 'icon') as IconElement[];
  const userList = Object.values(remoteUsers) as RemoteUser[];

  const getCursorClass = () => {
    if (isPanning) return 'cursor-grabbing';
    if (currentTool === 'hand' || spacePressed) return 'cursor-grab';
    if (!canWrite) return 'cursor-default';
    if (currentTool === 'eraser') return 'cursor-none';
    return 'cursor-crosshair';
  };

  return (
    <div
      ref={containerRef}
      id="whiteboard-canvas-container"
      style={{
        backgroundImage: 'radial-gradient(#cbd5e1 1.3px, transparent 1.3px)',
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      className={`relative w-full h-screen overflow-hidden bg-white select-none ${getCursorClass()}`}
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

      {/* Interactive World Elements Layer (Pan & Zoom Transformed) */}
      <div
        id="whiteboard-world-layer"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className="absolute inset-0 pointer-events-none"
      >
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

        {/* Shapes Layer with Persistent Selection */}
        {shapeElements.map((shape) => (
          <ShapeItem
            key={shape.id}
            element={shape}
            currentUserId={currentUserId}
            canWrite={canWrite}
            isSelected={selectedElementId === shape.id}
            onSelect={() => setSelectedElementId(shape.id)}
            onUpdate={onElementUpdate}
            onDelete={onElementDelete}
          />
        ))}

        {/* Icons / Stickers Layer with Persistent Selection */}
        {iconElements.map((icon) => (
          <IconItem
            key={icon.id}
            element={icon}
            currentUserId={currentUserId}
            canWrite={canWrite}
            isSelected={selectedElementId === icon.id}
            onSelect={() => setSelectedElementId(icon.id)}
            onUpdate={onElementUpdate}
            onDelete={onElementDelete}
          />
        ))}

        {/* Remote Multiplayer Live Cursors (projected in world space) */}
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
              <svg
                className="w-5 h-5 drop-shadow-sm"
                viewBox="0 0 24 24"
                fill={user.color || '#3b82f6'}
                stroke="#ffffff"
                strokeWidth="1.5"
              >
                <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35z" />
              </svg>

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

      {/* Floating Zoom & Pan Navigation Controls */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(3.0, Number((z + 0.2).toFixed(2))))}
        onZoomOut={() => setZoom((z) => Math.max(0.25, Number((z - 0.2).toFixed(2))))}
        onResetZoom={() => {
          setZoom(1.0);
          setPan({ x: 0, y: 0 });
        }}
      />
    </div>
  );
};
