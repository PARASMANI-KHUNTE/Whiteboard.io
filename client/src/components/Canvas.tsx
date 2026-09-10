import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  ToolType,
  CanvasElement,
  DrawingStroke,
  StickyNote,
  TextElement,
  ShapeElement,
  IconElement,
  WireElement,
  WireStyle,
  AnchorPosition,
  ShapeType,
  RemoteUser,
  Point,
} from '../types';
import { StickyNoteItem } from './StickyNoteItem';
import { TextItem } from './TextItem';
import { ShapeItem } from './ShapeItem';
import { IconItem } from './IconItem';
import { WireItem, WireOverlay } from './WireItem';
import { ZoomControls } from './ZoomControls';
import { CheckSquare, Copy, Trash2, X, MousePointer } from 'lucide-react';
import { getAdaptiveDisplayColor, isColorBlack, isColorWhite } from '../utils/themeColors';
import { getElementBounds, getElementAnchors, routeDraftWire } from '../utils/wireGeometry';

interface CanvasProps {
  currentTool: ToolType;
  currentColor: string;
  currentSize: number;
  currentUserId: string;
  currentUserName: string;
  canWrite?: boolean;
  theme?: 'light' | 'dark';
  selectedShapeType?: ShapeType;
  selectedIconName?: string;
  selectedWireStyle?: WireStyle;
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
  onRegisterSelectAll?: (fn: () => void) => void;
  onRegisterNavigateToElements?: (fn: (elements: CanvasElement[]) => void) => void;
  onRegisterGetWorldCenter?: (fn: () => { x: number; y: number }) => void;
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
  theme = 'light',
  selectedShapeType = 'rectangle',
  selectedIconName = 'star',
  selectedWireStyle = 'curve',
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
  onRegisterSelectAll,
  onRegisterNavigateToElements,
  onRegisterGetWorldCenter,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan, Zoom & Viewport state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1.0);
  const [isPanning, setIsPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);

  // Synchronized refs to avoid stale closures during high-frequency native touch events
  const panRef = useRef<{ x: number; y: number }>(pan);
  panRef.current = pan;
  const zoomRef = useRef<number>(zoom);
  zoomRef.current = zoom;

  // Multi-touch pinch-to-zoom & two-finger pan gesture state
  const touchPinchRef = useRef<{
    initialDist: number;
    initialZoom: number;
    initialPan: { x: number; y: number };
    initialCenter: { x: number; y: number };
  } | null>(null);

  // Active object selection state (multi-select capable)
  const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set());

  // Marquee selection box state
  const [marqueeRect, setMarqueeRect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const isMarqueeRef = useRef(false);

  // Wire drafting and hover anchor state
  const [wireDraft, setWireDraft] = useState<{
    fromId: string;
    fromAnchor?: AnchorPosition;
    currentPoint: Point;
    targetHoverId?: string;
  } | null>(null);
  const wireDraftStartPointRef = useRef<Point | null>(null);
  const [wireHoveredElementId, setWireHoveredElementId] = useState<string | null>(null);

  useEffect(() => {
    if (currentTool !== 'wire') {
      setWireDraft(null);
      setWireHoveredElementId(null);
      wireDraftStartPointRef.current = null;
    }
  }, [currentTool]);

  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number }>({
    mouseX: 0,
    mouseY: 0,
    panX: 0,
    panY: 0,
  });

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  const lastEraserPointRef = useRef<Point | null>(null);
  const elementsRef = useRef<Record<string, CanvasElement>>(elements);
  elementsRef.current = elements;

  // Throttled cursor emission
  const lastCursorEmitRef = useRef<number>(0);

  // Find connectable element at point for wire connections
  const findConnectableElementAtCoords = useCallback((pt: Point): CanvasElement | null => {
    const list = (Object.values(elementsRef.current) as CanvasElement[]).reverse();
    for (const el of list) {
      if (el.type === 'shape' || el.type === 'sticky' || el.type === 'text' || el.type === 'icon') {
        const bounds = getElementBounds(el);
        if (
          pt.x >= bounds.x - 8 &&
          pt.x <= bounds.x + bounds.width + 8 &&
          pt.y >= bounds.y - 8 &&
          pt.y <= bounds.y + bounds.height + 8
        ) {
          return el;
        }
      }
    }
    return null;
  }, []);

  // Selection management helpers
  const handleSelectElement = useCallback((id: string, isMulti = false) => {
    setSelectedElementIds((prev) => {
      const next = new Set(isMulti ? prev : []);
      if (isMulti && next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = Object.keys(elementsRef.current);
    setSelectedElementIds(new Set(allIds));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedElementIds(new Set());
  }, []);

  const cloneElementWithOffset = useCallback((el: CanvasElement, dx = 24, dy = 24): CanvasElement => {
    const newId = `${el.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (el.type === 'stroke') {
      return {
        ...el,
        id: newId,
        points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        createdAt: Date.now(),
      };
    }
    return {
      ...el,
      id: newId,
      x: el.x + dx,
      y: el.y + dy,
      updatedAt: Date.now(),
    } as CanvasElement;
  }, []);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedElementIds.size === 0) return;
    const newIds: string[] = [];
    selectedElementIds.forEach((id) => {
      const el = elementsRef.current[id];
      if (el) {
        const cloned = cloneElementWithOffset(el, 24, 24);
        onElementCreate(cloned);
        newIds.push(cloned.id);
      }
    });
    if (newIds.length > 0) {
      setSelectedElementIds(new Set(newIds));
    }
  }, [selectedElementIds, cloneElementWithOffset, onElementCreate]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedElementIds.size === 0) return;
    const idsToDeleteSet = new Set(selectedElementIds);
    Object.values(elementsRef.current).forEach((el) => {
      if (el.type === 'wire') {
        const w = el as WireElement;
        if (idsToDeleteSet.has(w.fromId) || idsToDeleteSet.has(w.toId)) {
          idsToDeleteSet.add(w.id);
        }
      }
    });
    onElementsBatchDelete(Array.from(idsToDeleteSet));
    setSelectedElementIds(new Set());
  }, [selectedElementIds, onElementsBatchDelete]);

  // When user picks a color in Toolbar while elements are selected, apply to them immediately
  const prevColorRef = useRef(currentColor);
  useEffect(() => {
    if (prevColorRef.current !== currentColor) {
      prevColorRef.current = currentColor;
      if (selectedElementIds.size > 0 && canWrite) {
        selectedElementIds.forEach((id) => {
          const el = elementsRef.current[id];
          if (el) {
            onElementUpdate({
              ...el,
              color: currentColor,
              updatedAt: Date.now(),
            } as CanvasElement);
          }
        });
      }
    }
  }, [currentColor, selectedElementIds, canWrite, onElementUpdate]);

  // When user changes stroke size in Toolbar while wires or elements are selected, apply to them
  const prevSizeRef = useRef(currentSize);
  useEffect(() => {
    if (prevSizeRef.current !== currentSize) {
      prevSizeRef.current = currentSize;
      if (selectedElementIds.size > 0 && canWrite) {
        selectedElementIds.forEach((id) => {
          const el = elementsRef.current[id];
          if (el && el.type === 'wire') {
            onElementUpdate({
              ...el,
              strokeWidth: currentSize,
              updatedAt: Date.now(),
            });
          }
        });
      }
    }
  }, [currentSize, selectedElementIds, canWrite, onElementUpdate]);


  // Cascade-delete any connected wires when an element is deleted
  const handleElementDelete = useCallback(
    (id: string) => {
      const idsToDelete = [id];
      Object.values(elementsRef.current).forEach((el) => {
        if (el.type === 'wire') {
          const w = el as WireElement;
          if (w.fromId === id || w.toId === id) {
            idsToDelete.push(w.id);
          }
        }
      });
      if (idsToDelete.length > 1) {
        onElementsBatchDelete(idsToDelete);
      } else {
        onElementDelete(id);
      }
    },
    [onElementDelete, onElementsBatchDelete]
  );

  // Register external select-all callback
  useEffect(() => {
    onRegisterSelectAll?.(handleSelectAll);
  }, [onRegisterSelectAll, handleSelectAll]);

  // Compute current screen center in world coordinates
  const getWorldCenter = useCallback((): { x: number; y: number } => {
    const container = containerRef.current;
    const w = container ? container.clientWidth : window.innerWidth;
    const h = container ? container.clientHeight : window.innerHeight;
    return {
      x: Math.round((w / 2 - panRef.current.x) / zoomRef.current),
      y: Math.round((h / 2 - panRef.current.y) / zoomRef.current),
    };
  }, []);

  // Smoothly pan & zoom viewport to fit and focus on a set of elements (e.g. newly generated AI diagram)
  const navigateToElements = useCallback((newElements: CanvasElement[]) => {
    if (!newElements || newElements.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    newElements.forEach((el) => {
      const bounds = getElementBounds(el);
      if (bounds.x < minX) minX = bounds.x;
      if (bounds.y < minY) minY = bounds.y;
      if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
      if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
    });

    if (!isFinite(minX) || !isFinite(maxX)) return;

    const container = containerRef.current;
    const viewportW = container ? container.clientWidth : window.innerWidth;
    const viewportH = container ? container.clientHeight : window.innerHeight;

    const diagramW = Math.max(120, maxX - minX);
    const diagramH = Math.max(100, maxY - minY);
    const diagramCenterX = minX + diagramW / 2;
    const diagramCenterY = minY + diagramH / 2;

    // Target zoom with comfortable margins around the diagram
    const paddingX = 160;
    const paddingY = 180;
    const fitZoomX = (viewportW - paddingX) / diagramW;
    const fitZoomY = (viewportH - paddingY) / diagramH;
    const targetZoom = Math.max(0.45, Math.min(1.15, Number(Math.min(fitZoomX, fitZoomY).toFixed(2))));

    const targetPanX = Math.round(viewportW / 2 - diagramCenterX * targetZoom);
    const targetPanY = Math.round(viewportH / 2 - diagramCenterY * targetZoom);

    // Smooth easeOutCubic animation over 500ms
    const startPan = { ...panRef.current };
    const startZoom = zoomRef.current;
    const startTime = performance.now();
    const duration = 520;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentPanX = Math.round(startPan.x + (targetPanX - startPan.x) * ease);
      const currentPanY = Math.round(startPan.y + (targetPanY - startPan.y) * ease);
      const currentZ = Number((startZoom + (targetZoom - startZoom) * ease).toFixed(3));

      setPan({ x: currentPanX, y: currentPanY });
      setZoom(currentZ);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Highlight newly generated diagram elements with selection
        setSelectedElementIds(new Set(newElements.map((e) => e.id)));
      }
    };

    requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    onRegisterNavigateToElements?.(navigateToElements);
  }, [onRegisterNavigateToElements, navigateToElements]);

  useEffect(() => {
    onRegisterGetWorldCenter?.(getWorldCenter);
  }, [onRegisterGetWorldCenter, getWorldCenter]);

  // Spacebar pan listener, keyboard shortcuts & selection actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName);
      if (!isInput) {
        if (e.code === 'Space') {
          setSpacePressed(true);
        } else if (e.key === 'v' || e.key === 'V') {
          onSelectTool?.('select');
        } else if (e.key === 'h' || e.key === 'H') {
          onSelectTool?.('hand');
        }

        // Select All: Ctrl+A / Cmd+A
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
          e.preventDefault();
          handleSelectAll();
          return;
        }

        // Duplicate: Ctrl+D / Cmd+D
        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
          e.preventDefault();
          handleDuplicateSelected();
          return;
        }

        // Delete selected: Delete or Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedElementIds.size > 0) {
            e.preventDefault();
            handleDeleteSelected();
            return;
          }
        }
      }

      if (e.code === 'Escape') {
        handleClearSelection();
        setWireDraft(null);
        setWireHoveredElementId(null);
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
  }, [handleSelectAll, handleDuplicateSelected, handleDeleteSelected, handleClearSelection, selectedElementIds, onSelectTool]);

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
          const nextZoom = Math.max(0.25, Math.min(3.0, prevZoom * zoomFactor));
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

  // Native non-passive touch listeners on canvas container to prevent browser scroll & pull-to-refresh
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onNativeTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2 || currentTool === 'hand') {
        e.preventDefault();
      }
    };

    const onNativeTouchMove = (e: TouchEvent) => {
      // Always prevent page-level scroll when interacting with whiteboard canvas
      e.preventDefault();
    };

    container.addEventListener('touchstart', onNativeTouchStart, { passive: false });
    container.addEventListener('touchmove', onNativeTouchMove, { passive: false });

    return () => {
      container.removeEventListener('touchstart', onNativeTouchStart);
      container.removeEventListener('touchmove', onNativeTouchMove);
    };
  }, [currentTool]);

  // Draw helper for a single stroke in world coords
  const drawSingleStroke = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: { points: Point[]; color: string; size: number; isHighlighter?: boolean }) => {
      const points = stroke.points;
      if (points.length < 1) return;

      const strokeColor = getAdaptiveDisplayColor(stroke.color, theme);

      ctx.save();
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.isHighlighter ? stroke.size * 2.5 : stroke.size;

      if (stroke.isHighlighter) {
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = 0.35;
      } else {
        ctx.strokeStyle = strokeColor;
        ctx.globalAlpha = 1.0;
      }

      if (points.length === 1) {
        ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = strokeColor;
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
    [theme]
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
        const stroke = el as DrawingStroke;
        drawSingleStroke(ctx, stroke);

        // Highlight selected stroke
        if (selectedElementIds.has(stroke.id) && stroke.points && stroke.points.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of stroke.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          const pad = 6;
          ctx.save();
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1.5 / zoom;
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          ctx.strokeRect(minX - pad, minY - pad, Math.max(12, maxX - minX + pad * 2), Math.max(12, maxY - minY + pad * 2));
          ctx.restore();
        }
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
  }, [elements, liveStrokes, currentStroke, drawSingleStroke, pan, zoom, selectedElementIds, theme]);

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

  // Re-render whenever strokes, pan, zoom, or theme change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas, theme]);

  // Continuous eraser collision check in world coordinates (interpolates between mouse moves)
  const checkAndEraseAlongSegment = useCallback(
    (from: Point, to: Point) => {
      const allElements = elementsRef.current || {};
      const elList = Object.values(allElements) as CanvasElement[];
      if (elList.length === 0) return;

      const eraserRadius = Math.max(16, currentSize * 3 + 12) / zoom;
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const stepDist = Math.max(4, eraserRadius * 0.4);
      const steps = Math.max(1, Math.ceil(dist / stepDist));

      const elementsToDelete = new Set<string>();

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const pt = {
          x: from.x + t * (to.x - from.x),
          y: from.y + t * (to.y - from.y),
        };

        for (const el of elList) {
          if (elementsToDelete.has(el.id)) continue;

          // Check if stroke (by type or points array presence)
          const rawPoints = (el as any).points;
          if (el.type === 'stroke' || (Array.isArray(rawPoints) && rawPoints.length > 0)) {
            const points: Point[] = rawPoints || [];
            if (!points || points.length === 0) continue;
            const strokeSize = (el as any).size || 3;
            const effectiveR = eraserRadius + strokeSize / 2;

            // Single-dot stroke (length === 1)
            if (points.length === 1) {
              const d = Math.hypot(pt.x - points[0].x, pt.y - points[0].y);
              if (d <= effectiveR) {
                elementsToDelete.add(el.id);
              }
              continue;
            }

            // Multi-point stroke segments
            for (let i = 0; i < points.length - 1; i++) {
              const d = distanceToSegment(pt, points[i], points[i + 1]);
              if (d <= effectiveR) {
                elementsToDelete.add(el.id);
                break;
              }
            }
          } else {
            // Bounding box collision check for shapes, stickies, text, icons
            const w = (el as any).width || (el as any).size || (el.type === 'sticky' ? 224 : el.type === 'text' ? 180 : 100);
            const h = (el as any).height || (el as any).size || (el.type === 'sticky' ? 150 : el.type === 'text' ? 60 : 100);
            const elX = (el as any).x ?? 0;
            const elY = (el as any).y ?? 0;

            if (
              pt.x + eraserRadius >= elX &&
              pt.x - eraserRadius <= elX + w &&
              pt.y + eraserRadius >= elY &&
              pt.y - eraserRadius <= elY + h
            ) {
              elementsToDelete.add(el.id);
            }
          }
        }
      }

      if (elementsToDelete.size > 0) {
        onElementsBatchDelete(Array.from(elementsToDelete));
      }
    },
    [currentSize, zoom, onElementsBatchDelete]
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
    // Multi-touch: If 2 or more fingers touch the screen, immediately enter pinch-to-zoom & two-finger pan
    if ('touches' in e && e.touches.length >= 2) {
      if ('preventDefault' in e && typeof (e as any).preventDefault === 'function') {
        e.preventDefault();
      }
      // Cancel any active drawing, eraser or marquee so no accidental strokes are made
      setIsDrawing(false);
      setCurrentStroke(null);
      lastEraserPointRef.current = null;
      isMarqueeRef.current = false;
      setMarqueeRect(null);

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchPinchRef.current = {
        initialDist: Math.max(dist, 1),
        initialZoom: zoomRef.current,
        initialPan: { ...panRef.current },
        initialCenter: { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 },
      };
      return;
    }

    // Check if Middle Mouse Button (button === 1), Hand Tool, or Spacebar Pan
    const isMiddleClick = 'button' in e && e.button === 1;
    const isHandTool = currentTool === 'hand';
    const isSpacePan = spacePressed;

    if (isMiddleClick || isHandTool || isSpacePan) {
      if ('preventDefault' in e && typeof (e as any).preventDefault === 'function') {
        e.preventDefault();
      }
      setIsPanning(true);
      const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
      panStartRef.current = {
        mouseX: clientX,
        mouseY: clientY,
        panX: pan.x,
        panY: pan.y,
      };
      if (currentTool === 'hand') {
        setSelectedElementIds(new Set());
      }
      return;
    }

    const coords = getCanvasCoords(e);
    if (!coords) return;

    // Handle Select tool (Single click selection, Shift+click multi-select, or drag marquee)
    if (currentTool === 'select') {
      const isMulti = 'shiftKey' in e && (e.shiftKey || e.ctrlKey || e.metaKey);
      const clicked = (Object.values(elements) as CanvasElement[]).reverse().find((el) => {
        if (el.type === 'shape' || el.type === 'icon') {
          const w = (el as any).width || (el as any).size || 100;
          const h = (el as any).height || (el as any).size || 100;
          return coords.x >= el.x && coords.x <= el.x + w && coords.y >= el.y && coords.y <= el.y + h;
        }
        if (el.type === 'sticky') {
          return coords.x >= el.x && coords.x <= el.x + 224 && coords.y >= el.y && coords.y <= el.y + 150;
        }
        if (el.type === 'text') {
          return coords.x >= el.x && coords.x <= el.x + 200 && coords.y >= el.y && coords.y <= el.y + 60;
        }
        if (el.type === 'stroke' && (el as DrawingStroke).points) {
          const stroke = el as DrawingStroke;
          return stroke.points.some((p) => Math.hypot(p.x - coords.x, p.y - coords.y) <= Math.max(12, stroke.size * 2));
        }
        return false;
      });

      if (clicked) {
        handleSelectElement(clicked.id, isMulti);
      } else {
        if (!isMulti) {
          handleClearSelection();
        }
        // Start marquee selection drag on empty canvas
        isMarqueeRef.current = true;
        setMarqueeRect({
          startX: coords.x,
          startY: coords.y,
          currentX: coords.x,
          currentY: coords.y,
        });
      }
      return;
    }

    // Handle Wire tool (connect 2 objects with line or curve)
    if (currentTool === 'wire') {
      if (!canWrite) {
        onRestrictedAttempt?.();
        return;
      }
      const clicked = findConnectableElementAtCoords(coords);
      if (!wireDraft) {
        if (clicked) {
          setWireDraft({ fromId: clicked.id, currentPoint: coords });
          wireDraftStartPointRef.current = coords;
        }
      } else {
        // If already drafting and user clicks an element (different from source)
        if (clicked && clicked.id !== wireDraft.fromId) {
          const wireColor =
            theme === 'dark' && isColorBlack(currentColor)
              ? '#ffffff'
              : theme === 'light' && isColorWhite(currentColor)
              ? '#0f172a'
              : currentColor;
          const newWire: WireElement = {
            id: 'wire_' + Math.random().toString(36).substring(2, 9),
            type: 'wire',
            fromId: wireDraft.fromId,
            toId: clicked.id,
            wireType: selectedWireStyle || 'curve',
            color: wireColor,
            strokeWidth: currentSize || 3,
            arrowEnd: true,
            userId: currentUserId,
            userName: currentUserName,
            updatedAt: Date.now(),
          };
          onElementCreate(newWire);
          setSelectedElementIds(new Set([newWire.id]));
          setWireDraft(null);
          wireDraftStartPointRef.current = null;
        } else if (!clicked) {
          setWireDraft(null);
          wireDraftStartPointRef.current = null;
        }
      }
      return;
    }

    // Deselect any active elements when clicking canvas background with other tools
    handleClearSelection();

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
      setSelectedElementIds(new Set([newSticky.id]));
      onSelectTool?.('select'); // Switch to select tool
      return;
    }

    // Handle Text placement
    if (currentTool === 'text') {
      const textColor =
        theme === 'dark' && isColorBlack(currentColor)
          ? '#ffffff'
          : theme === 'light' && isColorWhite(currentColor)
          ? '#0f172a'
          : currentColor;
      const newText: TextElement = {
        id: 'text_' + Math.random().toString(36).substring(2, 9),
        type: 'text',
        x: coords.x,
        y: coords.y,
        text: '',
        color: textColor,
        fontSize: currentSize === 3 ? 16 : currentSize === 6 ? 22 : 30,
        userId: currentUserId,
        userName: currentUserName,
        updatedAt: Date.now(),
      };
      onElementCreate(newText);
      setSelectedElementIds(new Set([newText.id]));
      onSelectTool?.('select'); // Switch to select tool so user can type immediately
      return;
    }

    // Handle Shape placement
    if (currentTool === 'shape') {
      const shapeW = 160;
      const shapeH = 120;
      const shapeColor =
        theme === 'dark' && isColorBlack(currentColor)
          ? '#ffffff'
          : theme === 'light' && isColorWhite(currentColor)
          ? '#0f172a'
          : currentColor;
      const newShape: ShapeElement = {
        id: 'shape_' + Math.random().toString(36).substring(2, 9),
        type: 'shape',
        shapeType: selectedShapeType || 'rectangle',
        x: Math.max(10, coords.x - shapeW / 2),
        y: Math.max(10, coords.y - shapeH / 2),
        width: shapeW,
        height: shapeH,
        color: shapeColor,
        fillColor: `${shapeColor}15`,
        strokeWidth: currentSize,
        userId: currentUserId,
        userName: currentUserName,
        updatedAt: Date.now(),
      };
      onElementCreate(newShape);
      setSelectedElementIds(new Set([newShape.id]));
      onSelectTool?.('select'); // Keep in select mode
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
      setSelectedElementIds(new Set([newIcon.id]));
      onSelectTool?.('select'); // Keep in select mode
      return;
    }

    // Handle Eraser
    if (currentTool === 'eraser') {
      setIsDrawing(true);
      lastEraserPointRef.current = coords;
      checkAndEraseAlongSegment(coords, coords);
      return;
    }

    // Handle Drawing (Pen or Highlighter)
    if (currentTool === 'pen' || currentTool === 'highlighter') {
      setIsDrawing(true);
      const strokeId = 'stroke_' + Math.random().toString(36).substring(2, 9);
      const effectiveColor =
        currentTool === 'pen'
          ? theme === 'dark' && isColorBlack(currentColor)
            ? '#ffffff'
            : theme === 'light' && isColorWhite(currentColor)
            ? '#0f172a'
            : currentColor
          : currentColor;
      const newStroke: DrawingStroke = {
        id: strokeId,
        type: 'stroke',
        points: [coords],
        color: effectiveColor,
        size: currentSize,
        isHighlighter: currentTool === 'highlighter',
        userId: currentUserId,
        createdAt: Date.now(),
      };

      setCurrentStroke(newStroke);
      onStrokeLiveStart(strokeId, coords, effectiveColor, currentSize, currentTool === 'highlighter');
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    // Multi-touch pinch-to-zoom & two-finger pan
    if ('touches' in e && e.touches.length >= 2) {
      if ('preventDefault' in e && typeof (e as any).preventDefault === 'function') {
        e.preventDefault();
      }
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const currentMidX = (t1.clientX + t2.clientX) / 2;
      const currentMidY = (t1.clientY + t2.clientY) / 2;

      if (!touchPinchRef.current) {
        touchPinchRef.current = {
          initialDist: Math.max(currentDist, 1),
          initialZoom: zoomRef.current,
          initialPan: { ...panRef.current },
          initialCenter: { x: currentMidX, y: currentMidY },
        };
        return;
      }

      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      const { initialDist, initialZoom, initialPan, initialCenter } = touchPinchRef.current;
      const scale = currentDist / initialDist;
      const nextZoom = Math.max(0.25, Math.min(3.0, Number((initialZoom * scale).toFixed(3))));

      // World point at initial midpoint
      const initialWorldX = (initialCenter.x - rect.left - initialPan.x) / initialZoom;
      const initialWorldY = (initialCenter.y - rect.top - initialPan.y) / initialZoom;

      // New pan keeping the world point under the current midpoint
      const nextPanX = (currentMidX - rect.left) - initialWorldX * nextZoom;
      const nextPanY = (currentMidY - rect.top) - initialWorldY * nextZoom;

      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
      return;
    }

    // Handle Panning / Canvas Movement (Hand tool, Middle click, Spacebar pan)
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

    // In Wire tool mode: track hovered connectable elements and update drafting endpoint
    if (currentTool === 'wire') {
      const hovered = findConnectableElementAtCoords(coords);
      setWireHoveredElementId(hovered ? hovered.id : null);
      if (wireDraft) {
        setWireDraft((prev) => (prev ? { ...prev, currentPoint: coords, targetHoverId: hovered?.id } : null));
      }
    }

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

    // Update marquee selection drag rectangle
    if (isMarqueeRef.current && marqueeRect) {
      setMarqueeRect((prev) => (prev ? { ...prev, currentX: coords.x, currentY: coords.y } : null));
    }

    if (!isDrawing) return;

    if (currentTool === 'eraser') {
      const fromPt = lastEraserPointRef.current || coords;
      lastEraserPointRef.current = coords;
      checkAndEraseAlongSegment(fromPt, coords);
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

  const handlePointerUp = (e?: React.MouseEvent | React.TouchEvent) => {
    // Reset multi-touch pinch state when fingers are released
    if (touchPinchRef.current) {
      touchPinchRef.current = null;
      if (e && 'touches' in e && e.touches.length === 1 && currentTool === 'hand') {
        panStartRef.current = {
          mouseX: e.touches[0].clientX,
          mouseY: e.touches[0].clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        setIsPanning(true);
        return;
      }
    }

    if (isPanning) {
      setIsPanning(false);
      return;
    }

    // Handle Wire drafting completion on drag-and-release
    if (currentTool === 'wire' && wireDraft && wireDraftStartPointRef.current) {
      const coords = e ? getCanvasCoords(e) : null;
      if (coords) {
        const dragDist = Math.hypot(
          coords.x - wireDraftStartPointRef.current.x,
          coords.y - wireDraftStartPointRef.current.y
        );
        if (dragDist > 16) {
          const target = findConnectableElementAtCoords(coords);
          if (target && target.id !== wireDraft.fromId) {
            const wireColor =
              theme === 'dark' && isColorBlack(currentColor)
                ? '#ffffff'
                : theme === 'light' && isColorWhite(currentColor)
                ? '#0f172a'
                : currentColor;
            const newWire: WireElement = {
              id: 'wire_' + Math.random().toString(36).substring(2, 9),
              type: 'wire',
              fromId: wireDraft.fromId,
              toId: target.id,
              wireType: selectedWireStyle || 'curve',
              color: wireColor,
              strokeWidth: currentSize || 3,
              arrowEnd: true,
              userId: currentUserId,
              userName: currentUserName,
              updatedAt: Date.now(),
            };
            onElementCreate(newWire);
            setSelectedElementIds(new Set([newWire.id]));
          }
          setWireDraft(null);
          wireDraftStartPointRef.current = null;
        }
      }
    }

    // Finalize marquee selection
    if (isMarqueeRef.current && marqueeRect) {
      isMarqueeRef.current = false;
      const minX = Math.min(marqueeRect.startX, marqueeRect.currentX);
      const maxX = Math.max(marqueeRect.startX, marqueeRect.currentX);
      const minY = Math.min(marqueeRect.startY, marqueeRect.currentY);
      const maxY = Math.max(marqueeRect.startY, marqueeRect.currentY);
      const width = maxX - minX;
      const height = maxY - minY;

      if (width > 5 || height > 5) {
        const enclosedIds: string[] = [];
        (Object.values(elementsRef.current) as CanvasElement[]).forEach((el) => {
          if (el.type === 'shape' || el.type === 'icon') {
            const w = (el as any).width || (el as any).size || 100;
            const h = (el as any).height || (el as any).size || 100;
            if (el.x + w >= minX && el.x <= maxX && el.y + h >= minY && el.y <= maxY) {
              enclosedIds.push(el.id);
            }
          } else if (el.type === 'sticky') {
            if (el.x + 224 >= minX && el.x <= maxX && el.y + 150 >= minY && el.y <= maxY) {
              enclosedIds.push(el.id);
            }
          } else if (el.type === 'text') {
            if (el.x + 200 >= minX && el.x <= maxX && el.y + 60 >= minY && el.y <= maxY) {
              enclosedIds.push(el.id);
            }
          } else if (el.type === 'stroke' && (el as DrawingStroke).points) {
            const hasPoint = (el as DrawingStroke).points.some(
              (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
            );
            if (hasPoint) {
              enclosedIds.push(el.id);
            }
          }
        });

        setSelectedElementIds(new Set(enclosedIds));
      }
      setMarqueeRect(null);
      return;
    }

    if (isDrawing && currentStroke && currentStroke.points.length > 0) {
      onElementCreate(currentStroke);
    }
    setIsDrawing(false);
    setCurrentStroke(null);
    lastEraserPointRef.current = null;
  };

  // Sticky, Text, Shape, Icon, and Wire items
  const allElements = Object.values(elements) as CanvasElement[];
  const wireElements = allElements.filter((el) => el.type === 'wire') as WireElement[];
  const stickyNotes = allElements.filter((el) => el.type === 'sticky') as StickyNote[];
  const textElements = allElements.filter((el) => el.type === 'text') as TextElement[];
  const shapeElements = allElements.filter((el) => el.type === 'shape') as ShapeElement[];
  const iconElements = allElements.filter((el) => el.type === 'icon') as IconElement[];
  const userList = Object.values(remoteUsers) as RemoteUser[];

  const getCursorClass = () => {
    if (isPanning) return 'cursor-grabbing';
    if (currentTool === 'hand' || spacePressed) return 'cursor-grab';
    if (!canWrite) return 'cursor-default';
    if (currentTool === 'select') return 'cursor-default';
    if (currentTool === 'eraser') return 'cursor-none';
    if (currentTool === 'wire') return 'cursor-crosshair';
    return 'cursor-crosshair';
  };

  const handleDuplicateElement = useCallback(
    (el: CanvasElement) => {
      let cloned: CanvasElement;
      const newId = `${el.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      if (el.type === 'stroke') {
        cloned = {
          ...el,
          id: newId,
          points: el.points.map((p) => ({ x: p.x + 24, y: p.y + 24 })),
          createdAt: Date.now(),
        };
      } else {
        cloned = {
          ...el,
          id: newId,
          x: el.x + 24,
          y: el.y + 24,
          updatedAt: Date.now(),
        } as CanvasElement;
      }
      onElementCreate(cloned);
      setSelectedElementIds(new Set([cloned.id]));
    },
    [onElementCreate]
  );

  return (
    <div
      ref={containerRef}
      id="whiteboard-canvas-container"
      style={{
        backgroundImage:
          theme === 'dark'
            ? 'radial-gradient(#334155 1.3px, transparent 1.3px)'
            : 'radial-gradient(#cbd5e1 1.3px, transparent 1.3px)',
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      className={`relative w-full h-screen overflow-hidden bg-white dark:bg-[#0b0f19] select-none touch-none ${getCursorClass()}`}
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
      onTouchCancel={handlePointerUp}
    >
      {/* Underlying Canvas for high-fps strokes */}
      <canvas ref={canvasRef} className="absolute inset-0 block touch-none" />

      {/* Eraser Cursor Indicator */}
      {canWrite && currentTool === 'eraser' && eraserCursor && (
        <div
          style={{
            transform: `translate(${eraserCursor.x}px, ${eraserCursor.y}px)`,
            width: `${Math.max(16, currentSize * 3 + 12) * 2}px`,
            height: `${Math.max(16, currentSize * 3 + 12) * 2}px`,
          }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rose-500 bg-rose-400/25 z-40 shadow-sm"
        />
      )}

      {/* Interactive World Elements Layer (Pan & Zoom Transformed) */}
      <div
        id="whiteboard-world-layer"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
        className={`absolute inset-0 pointer-events-none ${
          currentTool === 'eraser' || currentTool === 'wire' ? '[&_*]:pointer-events-none' : ''
        }`}
      >
        {/* Wires Layer (Line & Curve Connectors) */}
        <svg
          id="whiteboard-wires-svg-layer"
          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-10"
        >
          {wireElements.map((wire) => (
            <WireItem
              key={wire.id}
              wire={wire}
              sourceEl={elements[wire.fromId]}
              targetEl={elements[wire.toId]}
              zoom={zoom}
              theme={theme}
              canWrite={canWrite}
              isSelected={selectedElementIds.has(wire.id)}
              onSelect={() => handleSelectElement(wire.id, false)}
              onUpdate={onElementUpdate}
              onDelete={handleElementDelete}
            />
          ))}

          {/* Active Wire Drafting Preview */}
          {wireDraft && elements[wireDraft.fromId] && (
            <path
              d={routeDraftWire(elements[wireDraft.fromId], wireDraft.currentPoint, selectedWireStyle || 'curve').svgPath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={(currentSize || 3) + 1}
              strokeDasharray="6,6"
              strokeLinecap="round"
              className="pointer-events-none animate-pulse"
            />
          )}

          {/* Magnetic Anchor Snap Indicator Dots for Hovered Object in Wire Mode */}
          {currentTool === 'wire' && wireHoveredElementId && elements[wireHoveredElementId] && (() => {
            const bounds = getElementBounds(elements[wireHoveredElementId]);
            const anchors = getElementAnchors(bounds);
            return (
              <g className="pointer-events-none">
                <rect
                  x={bounds.x - 4}
                  y={bounds.y - 4}
                  width={bounds.width + 8}
                  height={bounds.height + 8}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4,4"
                  rx={6}
                  className="opacity-75"
                />
                {(Object.entries(anchors) as [string, Point][]).map(([name, pt]) => (
                  <circle
                    key={name}
                    cx={pt.x}
                    cy={pt.y}
                    r={5}
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth={2}
                    className="drop-shadow-md"
                  />
                ))}
              </g>
            );
          })()}
        </svg>

        {/* Sticky Notes Layer */}
        {stickyNotes.map((note) => (
          <StickyNoteItem
            key={note.id}
            note={note}
            currentUserId={currentUserId}
            canWrite={canWrite}
            zoom={zoom}
            isSelected={selectedElementIds.has(note.id)}
            isMultiSelection={selectedElementIds.size > 1}
            onSelect={(isMulti) => handleSelectElement(note.id, isMulti)}
            onUpdate={onElementUpdate}
            onDelete={handleElementDelete}
          />
        ))}

        {/* Text Elements Layer */}
        {textElements.map((el) => (
          <TextItem
            key={el.id}
            element={el}
            currentUserId={currentUserId}
            canWrite={canWrite}
            zoom={zoom}
            theme={theme}
            isSelected={selectedElementIds.has(el.id)}
            isMultiSelection={selectedElementIds.size > 1}
            onSelect={(isMulti) => handleSelectElement(el.id, isMulti)}
            onUpdate={onElementUpdate}
            onDelete={handleElementDelete}
            onDuplicate={handleDuplicateElement}
          />
        ))}

        {/* Shapes Layer with Persistent Selection */}
        {shapeElements.map((shape) => (
          <ShapeItem
            key={shape.id}
            element={shape}
            currentUserId={currentUserId}
            canWrite={canWrite}
            zoom={zoom}
            theme={theme}
            isSelected={selectedElementIds.has(shape.id)}
            isMultiSelection={selectedElementIds.size > 1}
            onSelect={(isMulti) => handleSelectElement(shape.id, isMulti)}
            onUpdate={onElementUpdate}
            onDelete={handleElementDelete}
            onDuplicate={handleDuplicateElement}
          />
        ))}

        {/* Icons / Stickers Layer with Persistent Selection */}
        {iconElements.map((icon) => (
          <IconItem
            key={icon.id}
            element={icon}
            currentUserId={currentUserId}
            canWrite={canWrite}
            zoom={zoom}
            isSelected={selectedElementIds.has(icon.id)}
            isMultiSelection={selectedElementIds.size > 1}
            onSelect={(isMulti) => handleSelectElement(icon.id, isMulti)}
            onUpdate={onElementUpdate}
            onDelete={handleElementDelete}
            onDuplicate={handleDuplicateElement}
          />
        ))}

        {/* Wire Interactive Overlays Layer (Floating Action Bar, Color Picker, and Midpoint Label) */}
        {wireElements.map((wire) => (
          <WireOverlay
            key={`wire-overlay-${wire.id}`}
            wire={wire}
            sourceEl={elements[wire.fromId]}
            targetEl={elements[wire.toId]}
            theme={theme}
            canWrite={canWrite}
            isSelected={selectedElementIds.has(wire.id)}
            onUpdate={onElementUpdate}
            onDelete={handleElementDelete}
          />
        ))}


        {/* Marquee Drag Selection Box */}
        {marqueeRect && (
          <div
            style={{
              left: Math.min(marqueeRect.startX, marqueeRect.currentX),
              top: Math.min(marqueeRect.startY, marqueeRect.currentY),
              width: Math.abs(marqueeRect.currentX - marqueeRect.startX),
              height: Math.abs(marqueeRect.currentY - marqueeRect.startY),
            }}
            className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/15 rounded-sm z-50 transition-none"
          />
        )}

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
        isHandTool={currentTool === 'hand'}
        onToggleHand={onSelectTool ? () => onSelectTool(currentTool === 'hand' ? 'pen' : 'hand') : undefined}
      />

      {/* Floating Multi-Selection Action Bar (Rendered only when > 1 element selected, eliminating overlaps with single-element menus) */}
      {selectedElementIds.size > 1 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3.5 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-150 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 rounded-lg text-blue-600 dark:text-blue-400 font-semibold text-xs border border-blue-200/80 dark:border-blue-900/50">
            <MousePointer className="w-3.5 h-3.5" />
            <span>{selectedElementIds.size} selected</span>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* Select All */}
          <button
            onClick={handleSelectAll}
            title="Select All Elements (Ctrl+A)"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <CheckSquare className="w-3.5 h-3.5 text-blue-500" />
            <span>Select All</span>
          </button>

          {/* Duplicate */}
          {canWrite && (
            <button
              onClick={handleDuplicateSelected}
              title="Duplicate Selected (Ctrl+D)"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-emerald-500" />
              <span>Duplicate</span>
            </button>
          )}

          {/* Delete */}
          {canWrite && (
            <button
              onClick={handleDeleteSelected}
              title="Delete Selected (Del / Backspace)"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}

          {/* Clear / Deselect */}
          <button
            onClick={handleClearSelection}
            title="Deselect All (Esc)"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
