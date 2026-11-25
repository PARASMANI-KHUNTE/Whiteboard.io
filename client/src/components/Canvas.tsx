import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
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
import { ContextMenu, ContextMenuEntry } from './ContextMenu';
import { ShortcutsLauncherButton } from './ui/ShortcutsLauncherButton';
import { CANVAS_TOOL_DEFINITIONS } from './ui/toolActions';
import type { WhiteboardActionRegistry } from '../hooks/useWhiteboardActions';
import {
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  X,
  MousePointer,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  Lock,
  Unlock,
  Sparkles,
} from 'lucide-react';
import { getAdaptiveDisplayColor, isColorBlack, isColorWhite } from '../utils/themeColors';
import {
  isElementLocked,
  setElementLocked,
  translateElement,
} from '../utils/elementMutations';
import { getElementBounds, getElementAnchors, routeDraftWire, routeWire } from '../utils/wireGeometry';
import { reorderZIndex, getElementZ } from '../utils/zOrder';
import { toggleSelection } from '../utils/selection';
import { isStrokeHit, computeStrokeHitTolerance } from '../utils/hitTesting';
import { isPanInteraction, isWorldLayerPointerEventsDisabled } from '../utils/canvasPan';
import { getTouchClientPoint, isScrollableTextInput } from '../utils/touchInteractions';
import { SpatialIndex, IndexedElement } from '../utils/spatialIndex';
import { writeClipboard, readClipboard, cloneElementsForPaste, hasClipboardContent } from '../utils/clipboard';
import {
  cancelNavigationAnimation,
  computeNavigationStep,
  scheduleNavigationFrame,
  computeSafeViewportInsets,
  computeSafeFitCamera,
  areBoundsVisibleInSafeViewport,
} from '../utils/canvasNavigation';
import { dprMediaQuery, resizeCanvasBackingStore } from '../utils/canvasSizing';
import {
  distanceToSegment,
  segmentDistance,
  segmentIntersectsRect,
} from '../utils/strokeSimplification';
import { finalizeStrokeForCommit } from '../utils/strokeCommit';

interface CanvasProps {
  currentTool: ToolType;
  currentColor: string;
  currentSize: number;
  currentUserId: string;
  currentUserName: string;
  canWrite?: boolean;
  /** Suppress all canvas keyboard shortcuts while a blocking dialog is open. */
  shortcutsBlocked?: boolean;
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
  onElementsBatchCreate?: (elements: CanvasElement[]) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Ends the current coalescing window so the next edit is a separate undo step. */
  onHistoryBarrier?: () => void;
  onNotify?: (message: string, type?: 'info' | 'success' | 'warning') => void;
  onCursorMove: (cursor: { x: number; y: number; tool?: ToolType; isDrawing?: boolean }) => void;
  onStrokeLiveStart: (strokeId: string, point: Point, color: string, size: number, isHighlighter?: boolean) => void;
  onStrokeLivePoint: (strokeId: string, point: Point) => void;
  onSelectTool?: (tool: ToolType) => void;
  actions: WhiteboardActionRegistry;
  onRegisterSelectAll?: (fn: () => void) => void;
  onRegisterNavigateToElements?: (fn: (elements: CanvasElement[]) => void) => void;
  onRegisterHighlightElements?: (
    fn: (
      elements: CanvasElement[],
      options?: { navigateIfHidden?: boolean; durationMs?: number; badgeLabel?: string }
    ) => void
  ) => void;
  onRegisterGetWorldCenter?: (fn: () => { x: number; y: number }) => void;
  onRegisterGetViewport?: (fn: () => { pan: { x: number; y: number }; zoom: number }) => void;
  isShortcutsOpen?: boolean;
  onCloseShortcuts?: () => void;
}

const TOOL_KEY_MAP: Record<string, ToolType> = Object.fromEntries(
  CANVAS_TOOL_DEFINITIONS.map((def) => [def.shortcut.toLowerCase(), def.tool])
) as Record<string, ToolType>;

export const Canvas: React.FC<CanvasProps> = ({
  currentTool,
  currentColor,
  currentSize,
  currentUserId,
  currentUserName,
  canWrite = true,
  shortcutsBlocked = false,
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
  onElementsBatchCreate,
  onUndo,
  onRedo,
  onHistoryBarrier,
  onNotify,
  onCursorMove,
  onStrokeLiveStart,
  onStrokeLivePoint,
  onSelectTool,
  actions,
  onRegisterSelectAll,
  onRegisterNavigateToElements,
  onRegisterHighlightElements,
  onRegisterGetWorldCenter,
  onRegisterGetViewport,
  isShortcutsOpen = false,
  onCloseShortcuts,
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

  // Right-click / long-press context menu (fixed viewport coordinates)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

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
  const navAnimationRef = useRef<number | null>(null);
  const [aiHighlightIds, setAiHighlightIds] = useState<Set<string>>(new Set());
  const [aiHighlightBadge, setAiHighlightBadge] = useState<string>('AI updated');
  const aiHighlightTimerRef = useRef<number | null>(null);

  const cancelNavAnimation = useCallback(() => {
    cancelNavigationAnimation(navAnimationRef);
  }, []);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke | null>(null);
  // Synchronous mirror of currentStroke so an interrupting gesture can commit
  // the latest points even if React has not re-rendered yet.
  const strokeInProgressRef = useRef<DrawingStroke | null>(null);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  const lastEraserPointRef = useRef<Point | null>(null);
  const elementsRef = useRef<Record<string, CanvasElement>>(elements);
  elementsRef.current = elements;

  // Snapshot taken when a multi-selection drag starts. Absolute deltas are
  // applied to this snapshot so throttled moves never compound on each other.
  const selectionDragRef = useRef<{
    base: Map<string, CanvasElement>;
    lastDelta: Point;
  } | null>(null);

  // Throttled cursor emission
  const lastCursorEmitRef = useRef<number>(0);

  // Spatial index cache: rebuilt only when the elements map identity changes,
  // so repeated pointer events between renders reuse the same grid.
  const spatialIndexRef = useRef<{ elements: Record<string, CanvasElement>; index: SpatialIndex } | null>(null);
  const newlyCreatedElementIdsRef = useRef<Set<string>>(new Set());
  const getSpatialIndex = useCallback((): SpatialIndex => {
    const currentElements = elementsRef.current;
    const cached = spatialIndexRef.current;
    if (cached && cached.elements === currentElements) return cached.index;
    const index = new SpatialIndex(currentElements);
    spatialIndexRef.current = { elements: currentElements, index };
    return index;
  }, []);

  // Find connectable element at point for wire connections
  const findConnectableElementAtCoords = useCallback(
    (pt: Point): CanvasElement | null => {
      const candidates = getSpatialIndex().queryPoint(pt);
      let best: IndexedElement | null = null;
      for (const item of candidates) {
        const el = item.element;
        if (el.type !== 'shape' && el.type !== 'sticky' && el.type !== 'text' && el.type !== 'icon') {
          continue;
        }
        const bounds = item.bounds;
        if (
          pt.x >= bounds.x - 8 &&
          pt.x <= bounds.x + bounds.width + 8 &&
          pt.y >= bounds.y - 8 &&
          pt.y <= bounds.y + bounds.height + 8
        ) {
          // Later elements are drawn on top; prefer them like the old reverse scan.
          if (!best || getElementZ(item.element, item.order) >= getElementZ(best.element, best.order)) best = item;
        }
      }
      return best ? best.element : null;
    },
    [getSpatialIndex]
  );

  // Topmost element under the cursor (strokes use zoom-normalized proximity test).
  const findElementsAtCoords = useCallback(
    (pt: Point): CanvasElement | null => {
      const currentZoom = zoomRef.current || 1;
      const hitTolerance = computeStrokeHitTolerance(12, currentZoom);
      const candidates = getSpatialIndex().queryRect({
        x: pt.x - hitTolerance,
        y: pt.y - hitTolerance,
        width: hitTolerance * 2,
        height: hitTolerance * 2,
      });
      let best: IndexedElement | null = null;
      for (const item of candidates) {
        const el = item.element;
        if (el.type === 'wire') continue;
        if (el.type === 'stroke') {
          const stroke = el as DrawingStroke;
          if (!isStrokeHit(stroke, pt, currentZoom)) {
            continue;
          }
        } else {
          const bounds = item.bounds;
          if (
            pt.x < bounds.x ||
            pt.x > bounds.x + bounds.width ||
            pt.y < bounds.y ||
            pt.y > bounds.y + bounds.height
          ) {
            continue;
          }
        }
        if (!best || getElementZ(item.element, item.order) >= getElementZ(best.element, best.order)) best = item;
      }
      return best ? best.element : null;
    },
    [getSpatialIndex]
  );

  // Selection management helpers
  const handleSelectElement = useCallback((id: string, isMulti = false) => {
    // Interactive items call this once per gesture; click handlers only focus/edit.
    setSelectedElementIds((prev) => toggleSelection(prev, id, isMulti));
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = Object.keys(elementsRef.current);
    setSelectedElementIds(new Set(allIds));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedElementIds(new Set());
  }, []);

  const cloneElementWithOffset = useCallback((el: CanvasElement, dx = 24, dy = 24): CanvasElement | null => {
    // Wires reference other elements by id; duplicating them in place would be
    // meaningless (and the endpoints are not duplicated), so skip them.
    if (el.type === 'wire') return null;
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
      zIndex: Date.now(),
    } as CanvasElement;
  }, []);

  const handleDuplicateSelected = useCallback(() => {
    if (selectedElementIds.size === 0) return;
    const newIds: string[] = [];
    selectedElementIds.forEach((id) => {
      const el = elementsRef.current[id];
      if (el) {
        const cloned = cloneElementWithOffset(el, 24, 24);
        if (!cloned) return;
        onElementCreate(cloned);
        newIds.push(cloned.id);
      }
    });
    if (newIds.length > 0) {
      setSelectedElementIds(new Set(newIds));
    }
  }, [selectedElementIds, cloneElementWithOffset, onElementCreate]);

  // ---------------------------------------------------------------------------
  // Multi-selection move and lock
  // ---------------------------------------------------------------------------

  const beginSelectionDrag = useCallback(() => {
    if (!canWrite) return;
    const base = new Map<string, CanvasElement>();
    selectedElementIds.forEach((id) => {
      const element = elementsRef.current[id];
      // Wires follow their endpoints and locked elements never move.
      if (element && element.type !== 'wire' && !isElementLocked(element)) {
        base.set(id, element);
      }
    });
    selectionDragRef.current = { base, lastDelta: { x: 0, y: 0 } };
  }, [canWrite, selectedElementIds]);

  const moveSelectionByDelta = useCallback(
    (deltaX: number, deltaY: number) => {
      const drag = selectionDragRef.current;
      if (!drag || (deltaX === drag.lastDelta.x && deltaY === drag.lastDelta.y)) return;

      const now = Date.now();
      drag.base.forEach((element) => {
        onElementUpdate(translateElement(element, deltaX, deltaY, now));
      });
      drag.lastDelta = { x: deltaX, y: deltaY };
    },
    [onElementUpdate]
  );

  const endSelectionDrag = useCallback(() => {
    selectionDragRef.current = null;
  }, []);

  const handleSetSelectionLock = useCallback(
    (locked: boolean) => {
      if (!canWrite || selectedElementIds.size === 0) return;

      // A lock change is a discrete action: give it its own undo step instead
      // of merging it into a drag that just finished.
      onHistoryBarrier?.();
      const now = Date.now();
      let changed = 0;
      selectedElementIds.forEach((id) => {
        const element = elementsRef.current[id];
        if (!element || isElementLocked(element) === locked) return;
        onElementUpdate(setElementLocked(element, locked, now));
        changed += 1;
      });

      if (changed > 0) {
        onNotify?.(
          `${locked ? 'Locked' : 'Unlocked'} ${changed} object${changed === 1 ? '' : 's'}`,
          'success'
        );
      }
    },
    [canWrite, selectedElementIds, onElementUpdate, onHistoryBarrier, onNotify]
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedElementIds.size === 0) return;
    const idsToDeleteSet = new Set<string>();
    selectedElementIds.forEach((id) => {
      const element = elementsRef.current[id];
      if (element && !isElementLocked(element)) idsToDeleteSet.add(id);
    });
    if (idsToDeleteSet.size === 0) return;

    Object.values(elementsRef.current).forEach((el) => {
      if (el.type === 'wire' && !isElementLocked(el)) {
        const w = el as WireElement;
        if (idsToDeleteSet.has(w.fromId) || idsToDeleteSet.has(w.toId)) {
          idsToDeleteSet.add(w.id);
        }
      }
    });
    onElementsBatchDelete(Array.from(idsToDeleteSet));
    setSelectedElementIds(new Set());
  }, [selectedElementIds, onElementsBatchDelete]);

  // ---------------------------------------------------------------------------
  // Clipboard, nudging and stacking order
  // ---------------------------------------------------------------------------

  const handleCopySelected = useCallback(() => {
    if (selectedElementIds.size === 0) return;
    const selected: CanvasElement[] = [];
    selectedElementIds.forEach((id) => {
      const el = elementsRef.current[id];
      if (el) selected.push(el);
    });

    // Include wires whose both endpoints are part of the selection so a copied
    // diagram keeps its connectors.
    const wireIds = new Set(selected.map((el) => el.id));
    const connectedWires = (Object.values(elementsRef.current) as CanvasElement[]).filter(
      (el): el is WireElement =>
        el.type === 'wire' && wireIds.has(el.fromId) && wireIds.has(el.toId)
    );

    const payload = [...selected, ...connectedWires];
    writeClipboard(payload);
    onNotify?.(
      `Copied ${selected.length} object${selected.length === 1 ? '' : 's'}${
        connectedWires.length > 0 ? ` and ${connectedWires.length} connector${connectedWires.length === 1 ? '' : 's'}` : ''
      }`,
      'success'
    );
  }, [selectedElementIds, onNotify]);

  const handleCutSelected = useCallback(() => {
    if (selectedElementIds.size === 0) return;
    handleCopySelected();
    handleDeleteSelected();
  }, [selectedElementIds.size, handleCopySelected, handleDeleteSelected]);

  // Cascade repeated pastes so stacked copies don't land exactly on top of each
  // other. The counter resets whenever the clipboard content changes.
  const pasteCascadeRef = useRef<{ signature: string; count: number }>({ signature: '', count: 0 });

  const handlePaste = useCallback(() => {
    const clipboard = readClipboard();
    if (clipboard.length === 0) {
      onNotify?.('Clipboard is empty — copy something first', 'info');
      return;
    }

    const signature = clipboard.map((el) => el.id).join('|');
    if (pasteCascadeRef.current.signature !== signature) {
      pasteCascadeRef.current = { signature, count: 0 };
    }
    const step = 32 * (Math.min(pasteCascadeRef.current.count, 11) + 1);
    pasteCascadeRef.current.count += 1;

    const pasted = cloneElementsForPaste(clipboard, step, step);
    if (pasted.length === 0) {
      onNotify?.('Clipboard has no pasteable objects', 'warning');
      return;
    }

    if (onElementsBatchCreate) {
      onElementsBatchCreate(pasted);
    } else {
      pasted.forEach((el) => onElementCreate(el));
    }
    setSelectedElementIds(new Set(pasted.map((el) => el.id)));
    onNotify?.(`Pasted ${pasted.length} object${pasted.length === 1 ? '' : 's'}`, 'success');
  }, [onElementsBatchCreate, onElementCreate, onNotify]);

  const handleNudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!canWrite || selectedElementIds.size === 0) return;
      selectedElementIds.forEach((id) => {
        const el = elementsRef.current[id];
        if (!el || isElementLocked(el)) return;
        onElementUpdate(translateElement(el, dx, dy));
      });
    },
    [canWrite, selectedElementIds, onElementUpdate]
  );

  const handleZOrder = useCallback(
    (action: 'front' | 'forward' | 'backward' | 'back') => {
      if (!canWrite || selectedElementIds.size === 0) return;
      const { changed } = reorderZIndex(elementsRef.current, selectedElementIds, action);
      changed.forEach((el) => onElementUpdate(el));
    },
    [canWrite, selectedElementIds, onElementUpdate]
  );

  // ---------------------------------------------------------------------------
  // Context menu (right-click + touch long-press)
  // ---------------------------------------------------------------------------

  const selectedHasStackable = useMemo(() => {
    let stackable = false;
    selectedElementIds.forEach((id) => {
      const el = elementsRef.current[id];
      if (el && el.type !== 'wire' && el.type !== 'stroke' && !isElementLocked(el)) stackable = true;
    });
    return stackable;
  }, [selectedElementIds, elements]);

  const allSelectedLocked = useMemo(() => {
    const selected = Array.from(selectedElementIds)
      .map((id) => elements[id])
      .filter((element): element is CanvasElement => Boolean(element));
    return selected.length > 0 && selected.every(isElementLocked);
  }, [selectedElementIds, elements]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  }, []);

  useEffect(() => cancelLongPress, [cancelLongPress]);

  const openContextMenuAt = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const world = {
        x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
        y: (clientY - rect.top - panRef.current.y) / zoomRef.current,
      };
      const hit = findElementsAtCoords(world);
      if (hit) {
        setSelectedElementIds((prev) => (prev.has(hit.id) ? prev : new Set([hit.id])));
      } else {
        setSelectedElementIds(new Set());
      }
      setContextMenu({ x: clientX, y: clientY });
    },
    [findElementsAtCoords]
  );

  const selectionActionDefs = useMemo(() => {
    const hasSelection = selectedElementIds.size > 0;
    // Only touch localStorage while the menu is actually visible.
    const clipboardReady = contextMenu ? hasClipboardContent() : false;

    return {
      selectAll: {
        id: 'select-all',
        label: actions.actions.selectAll.label,
        title: actions.actions.selectAll.title,
        shortcut: actions.actions.selectAll.shortcut,
        icon: actions.actions.selectAll.icon,
        iconClassName: 'text-blue-500',
        disabled: false,
        handler: handleSelectAll,
      },
      copy: {
        id: 'copy',
        label: 'Copy',
        title: 'Copy Selected (Ctrl+C)',
        shortcut: 'Ctrl C',
        icon: Copy,
        iconClassName: 'text-sky-500',
        disabled: !hasSelection,
        handler: handleCopySelected,
      },
      cut: {
        id: 'cut',
        label: 'Cut',
        title: 'Cut Selected (Ctrl+X)',
        shortcut: 'Ctrl X',
        icon: Scissors,
        iconClassName: '',
        disabled: !hasSelection || !canWrite,
        handler: handleCutSelected,
      },
      paste: {
        id: 'paste',
        label: 'Paste',
        title: 'Paste (Ctrl+V)',
        shortcut: 'Ctrl V',
        icon: ClipboardPaste,
        iconClassName: '',
        disabled: !clipboardReady || !canWrite,
        handler: handlePaste,
      },
      duplicate: {
        id: 'duplicate',
        label: 'Duplicate',
        title: 'Duplicate Selected (Ctrl+D)',
        shortcut: 'Ctrl D',
        icon: Copy,
        iconClassName: 'text-emerald-500',
        disabled: !hasSelection || !canWrite,
        handler: handleDuplicateSelected,
      },
      lockToggle: {
        id: allSelectedLocked ? 'unlock-selection' : 'lock-selection',
        label: allSelectedLocked ? 'Unlock selection' : 'Lock selection',
        shortLabel: allSelectedLocked ? 'Unlock' : 'Lock',
        title: allSelectedLocked ? 'Unlock selected objects' : 'Lock selected objects',
        icon: allSelectedLocked ? Unlock : Lock,
        iconClassName: 'text-amber-500',
        disabled: !hasSelection || !canWrite,
        handler: () => handleSetSelectionLock(!allSelectedLocked),
      },
      delete: {
        id: 'delete',
        label: 'Delete',
        title: 'Delete Selected (Del / Backspace)',
        shortcut: 'Del',
        icon: Trash2,
        iconClassName: '',
        danger: true,
        disabled: !hasSelection || !canWrite,
        handler: handleDeleteSelected,
      },
    };
  }, [
    actions.actions.selectAll,
    allSelectedLocked,
    canWrite,
    contextMenu,
    handleCopySelected,
    handleCutSelected,
    handleDeleteSelected,
    handleDuplicateSelected,
    handlePaste,
    handleSelectAll,
    handleSetSelectionLock,
    selectedElementIds.size,
  ]);

  const contextMenuItems = useMemo<ContextMenuEntry[]>(() => {
    const shortcutsAction = actions.actions.shortcuts;
    const ShortcutsIcon = shortcutsAction.icon;
    const toMenuEntry = (def: {
      id: string;
      label: string;
      shortcut?: string;
      icon: React.ComponentType<{ className?: string }>;
      disabled: boolean;
      danger?: boolean;
      handler: () => void;
    }): ContextMenuEntry => {
      const Icon = def.icon;
      return {
        type: 'item',
        id: def.id,
        label: def.label,
        shortcut: def.shortcut,
        danger: def.danger,
        icon: <Icon className="w-3.5 h-3.5" />,
        disabled: def.disabled,
        onSelect: def.handler,
      };
    };

    return [
      toMenuEntry(selectionActionDefs.copy),
      toMenuEntry(selectionActionDefs.cut),
      toMenuEntry(selectionActionDefs.paste),
      { type: 'separator' },
      toMenuEntry(selectionActionDefs.duplicate),
      toMenuEntry(selectionActionDefs.lockToggle),
      toMenuEntry(selectionActionDefs.delete),
      { type: 'separator' },
      {
        type: 'item',
        id: 'bring-front',
        label: 'Bring to front',
        icon: <ChevronsUp className="w-3.5 h-3.5" />,
        disabled: !selectedHasStackable || !canWrite,
        onSelect: () => handleZOrder('front'),
      },
      {
        type: 'item',
        id: 'bring-forward',
        label: 'Bring forward',
        icon: <ChevronUp className="w-3.5 h-3.5" />,
        disabled: !selectedHasStackable || !canWrite,
        onSelect: () => handleZOrder('forward'),
      },
      {
        type: 'item',
        id: 'send-backward',
        label: 'Send backward',
        icon: <ChevronDown className="w-3.5 h-3.5" />,
        disabled: !selectedHasStackable || !canWrite,
        onSelect: () => handleZOrder('backward'),
      },
      {
        type: 'item',
        id: 'send-back',
        label: 'Send to back',
        icon: <ChevronsDown className="w-3.5 h-3.5" />,
        disabled: !selectedHasStackable || !canWrite,
        onSelect: () => handleZOrder('back'),
      },
      { type: 'separator' },
      {
        type: 'item',
        id: 'shortcuts',
        label: shortcutsAction.label,
        shortcut: shortcutsAction.shortcut,
        icon: <ShortcutsIcon className="w-3.5 h-3.5" />,
        onSelect: shortcutsAction.handler,
      },
    ];
  }, [
    actions.actions.shortcuts,
    canWrite,
    handleZOrder,
    selectedHasStackable,
    selectionActionDefs,
  ]);

  // When user picks a color in Toolbar while elements are selected, apply to them immediately
  const prevColorRef = useRef(currentColor);
  useEffect(() => {
    if (prevColorRef.current !== currentColor) {
      prevColorRef.current = currentColor;
      if (selectedElementIds.size > 0 && canWrite) {
        selectedElementIds.forEach((id) => {
          const el = elementsRef.current[id];
          if (el && !isElementLocked(el)) {
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
          if (el && el.type === 'wire' && !isElementLocked(el)) {
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
      const target = elementsRef.current[id];
      if (!target || isElementLocked(target)) return;

      const idsToDelete = [id];
      Object.values(elementsRef.current).forEach((el) => {
        if (el.type === 'wire' && !isElementLocked(el)) {
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

  const computeElementsUnionBounds = useCallback((targetElements: CanvasElement[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    targetElements.forEach((raw) => {
      const el = elementsRef.current[raw.id] ?? raw;
      if (el.type === 'wire') {
        const fromEl = elementsRef.current[el.fromId];
        const toEl = elementsRef.current[el.toId];
        if (!fromEl || !toEl) return;
        const route = routeWire(
          fromEl,
          toEl,
          el.wireType || 'curve',
          el.fromAnchor,
          el.toAnchor
        );
        if (!route) return;
        for (const pt of [route.fromPoint, route.midpoint, route.toPoint]) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        return;
      }

      const bounds = getElementBounds(el);
      if (bounds.x < minX) minX = bounds.x;
      if (bounds.y < minY) minY = bounds.y;
      if (bounds.x + bounds.width > maxX) maxX = bounds.x + bounds.width;
      if (bounds.y + bounds.height > maxY) maxY = bounds.y + bounds.height;
    });

    if (!isFinite(minX) || !isFinite(maxX)) return null;
    return {
      x: minX,
      y: minY,
      width: Math.max(120, maxX - minX),
      height: Math.max(100, maxY - minY),
    };
  }, []);

  const animateCameraTo = useCallback(
    (
      targetPan: { x: number; y: number },
      targetZoom: number,
      onComplete?: () => void
    ) => {
      cancelNavAnimation();
      const startPan = { ...panRef.current };
      const startZoom = zoomRef.current;
      const startTime = performance.now();
      const duration = 520;

      const animate = (now: number) => {
        const step = computeNavigationStep({
          startTime,
          now,
          duration,
          startPan,
          targetPan,
          startZoom,
          targetZoom,
        });

        setPan(step.pan);
        setZoom(step.zoom);

        if (!step.done) {
          scheduleNavigationFrame(navAnimationRef, animate);
        } else {
          navAnimationRef.current = null;
          onComplete?.();
        }
      };

      scheduleNavigationFrame(navAnimationRef, animate);
    },
    [cancelNavAnimation]
  );

  // Smoothly pan & zoom viewport to fit and focus on a set of elements (e.g. newly generated AI diagram)
  const navigateToElements = useCallback(
    (newElements: CanvasElement[]) => {
      if (!newElements || newElements.length === 0) return;
      const bounds = computeElementsUnionBounds(newElements);
      if (!bounds) return;

      const container = containerRef.current;
      const viewportW = container ? container.clientWidth : window.innerWidth;
      const viewportH = container ? container.clientHeight : window.innerHeight;
      const insets = computeSafeViewportInsets(viewportW, viewportH, {
        isAiChatOpen: document.documentElement.dataset.aiChatOpen === 'true',
        isSidebarOpen: document.documentElement.dataset.sidebarOpen === 'true',
      });
      const camera = computeSafeFitCamera(bounds, viewportW, viewportH, insets, {
        minZoom: 0.45,
        maxZoom: 1.15,
        padding: 96,
      });

      animateCameraTo(camera.pan, camera.zoom, () => {
        setSelectedElementIds(new Set(newElements.map((e) => e.id)));
      });
    },
    [animateCameraTo, computeElementsUnionBounds]
  );

  // Highlight recently changed/added AI elements and pan into view only if clipped/occluded.
  const highlightElements = useCallback(
    (
      targetElements: CanvasElement[],
      options?: { navigateIfHidden?: boolean; durationMs?: number; badgeLabel?: string }
    ) => {
      if (!targetElements || targetElements.length === 0) return;

      const ids = targetElements
        .map((e) => e.id)
        .filter((id) => Boolean(elementsRef.current[id]) || targetElements.some((t) => t.id === id));
      if (ids.length === 0) return;

      if (aiHighlightTimerRef.current !== null) {
        window.clearTimeout(aiHighlightTimerRef.current);
        aiHighlightTimerRef.current = null;
      }

      setAiHighlightBadge(options?.badgeLabel || 'AI updated');
      setAiHighlightIds(new Set(ids));

      const durationMs = options?.durationMs ?? 4500;
      aiHighlightTimerRef.current = window.setTimeout(() => {
        setAiHighlightIds(new Set());
        aiHighlightTimerRef.current = null;
      }, durationMs);

      if (options?.navigateIfHidden !== false) {
        const bounds = computeElementsUnionBounds(targetElements);
        if (!bounds) return;
        const container = containerRef.current;
        const viewportW = container ? container.clientWidth : window.innerWidth;
        const viewportH = container ? container.clientHeight : window.innerHeight;
        const insets = computeSafeViewportInsets(viewportW, viewportH, {
          isAiChatOpen: document.documentElement.dataset.aiChatOpen === 'true',
          isSidebarOpen: document.documentElement.dataset.sidebarOpen === 'true',
        });

        const alreadyVisible = areBoundsVisibleInSafeViewport(
          bounds,
          panRef.current,
          zoomRef.current,
          viewportW,
          viewportH,
          insets,
          24
        );

        if (!alreadyVisible) {
          const camera = computeSafeFitCamera(bounds, viewportW, viewportH, insets, {
            minZoom: 0.45,
            maxZoom: Math.min(1.15, Math.max(0.85, zoomRef.current)),
            padding: 110,
          });
          animateCameraTo(camera.pan, camera.zoom);
        }
      }
    },
    [animateCameraTo, computeElementsUnionBounds]
  );

  // Clear AI spotlight when board clears or Canvas unmounts.
  useEffect(() => {
    if (aiHighlightIds.size === 0) return;
    const anyPresent = Array.from(aiHighlightIds).some((id) => Boolean(elements[id]));
    if (!anyPresent) {
      setAiHighlightIds(new Set());
    }
  }, [elements, aiHighlightIds]);

  // Cancel any running navigation animation or highlight timer when Canvas unmounts (#93)
  useEffect(() => {
    return () => {
      cancelNavAnimation();
      if (aiHighlightTimerRef.current !== null) {
        window.clearTimeout(aiHighlightTimerRef.current);
        aiHighlightTimerRef.current = null;
      }
    };
  }, [cancelNavAnimation]);

  useEffect(() => {
    onRegisterNavigateToElements?.(navigateToElements);
  }, [onRegisterNavigateToElements, navigateToElements]);

  useEffect(() => {
    onRegisterHighlightElements?.(highlightElements);
  }, [onRegisterHighlightElements, highlightElements]);

  useEffect(() => {
    onRegisterGetWorldCenter?.(getWorldCenter);
  }, [onRegisterGetWorldCenter, getWorldCenter]);

  const getViewport = useCallback(
    (): { pan: { x: number; y: number }; zoom: number } => ({
      pan: { ...panRef.current },
      zoom: zoomRef.current,
    }),
    []
  );

  useEffect(() => {
    onRegisterGetViewport?.(getViewport);
  }, [onRegisterGetViewport, getViewport]);

  // Zoom helpers shared by keyboard shortcuts and the floating controls
  const zoomIn = useCallback(() => {
    cancelNavAnimation();
    setZoom((z) => Math.min(3.0, Number((z + 0.2).toFixed(2))));
  }, [cancelNavAnimation]);

  const zoomOut = useCallback(() => {
    cancelNavAnimation();
    setZoom((z) => Math.max(0.25, Number((z - 0.2).toFixed(2))));
  }, [cancelNavAnimation]);

  const resetView = useCallback(() => {
    cancelNavAnimation();
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, [cancelNavAnimation]);

  // Keyboard shortcuts, spacebar pan & selection actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The Canvas owns the shortcut sheet and must still be able to close it
      // with Escape, but no other blocking dialog may let keys reach the board.
      const dialogCount = document.querySelectorAll('[aria-modal="true"]').length;
      const blockingDialogOpen = shortcutsBlocked || dialogCount > (isShortcutsOpen ? 1 : 0);
      if (blockingDialogOpen) return;

      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName ?? '';
      const isEditable =
        !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName) || target.isContentEditable);

      // Never hijack typing inside notes, text elements or search fields.
      if (isEditable) return;

      // Shortcut cheat sheet
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        actions.actions.shortcuts.handler();
        return;
      }

      if (e.key === 'Escape') {
        if (isShortcutsOpen) {
          onCloseShortcuts?.();
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        handleClearSelection();
        setWireDraft(null);
        setWireHoveredElementId(null);
        return;
      }

      if (isShortcutsOpen) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Undo / redo
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo?.();
        else onUndo?.();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // Selection, clipboard and duplication
      if (mod && key === 'a') {
        e.preventDefault();
        handleSelectAll();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }
      if (mod && key === 'c') {
        e.preventDefault();
        handleCopySelected();
        return;
      }
      if (mod && key === 'x') {
        e.preventDefault();
        handleCutSelected();
        return;
      }
      if (mod && key === 'v') {
        e.preventDefault();
        handlePaste();
        return;
      }
      if (mod && e.shiftKey && key === 'e') {
        e.preventDefault();
        actions.actions.exportPng.handler();
        return;
      }
      if (mod) return;

      // Hold space to pan
      if (e.code === 'Space') {
        if (!['BUTTON', 'A'].includes(tagName)) e.preventDefault();
        setSpacePressed(true);
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementIds.size > 0) {
          e.preventDefault();
          handleDeleteSelected();
          return;
        }
      }

      // Arrow-key nudging (Shift = 10px)
      if (e.key.startsWith('Arrow') && selectedElementIds.size > 0) {
        const step = e.shiftKey ? 10 : 1;
        const delta =
          e.key === 'ArrowUp'
            ? { dx: 0, dy: -step }
            : e.key === 'ArrowDown'
              ? { dx: 0, dy: step }
              : e.key === 'ArrowLeft'
                ? { dx: -step, dy: 0 }
                : e.key === 'ArrowRight'
                  ? { dx: step, dy: 0 }
                  : null;
        if (delta) {
          e.preventDefault();
          handleNudgeSelected(delta.dx, delta.dy);
          return;
        }
      }

      // Zoom / reset view
      if (key === '+' || key === '=') {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (key === '0') {
        e.preventDefault();
        resetView();
        return;
      }

      // Single-key tool switching (V, H, P, Y, E, S, T, R, I, W)
      const tool = TOOL_KEY_MAP[key];
      if (tool && !e.altKey) {
        actions.selectTool(tool);
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
  }, [
    handleSelectAll,
    handleDuplicateSelected,
    handleDeleteSelected,
    handleClearSelection,
    handleCopySelected,
    handleCutSelected,
    handlePaste,
    handleNudgeSelected,
    selectedElementIds,
    actions,
    onUndo,
    onRedo,
    zoomIn,
    zoomOut,
    resetView,
    isShortcutsOpen,
    onCloseShortcuts,
    shortcutsBlocked,
    contextMenu,
  ]);

  // Native Wheel listener for Zooming (Ctrl+Wheel / Pinch) and Panning
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      cancelNavAnimation();
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
      cancelNavAnimation();
      if (isScrollableTextInput(e.target)) return;
      if (e.touches.length >= 2 || currentTool === 'hand') {
        e.preventDefault();
      }
    };

    const onNativeTouchMove = (e: TouchEvent) => {
      // Allow touch scrolling inside text inputs/textareas (e.g. sticky notes, text elements)
      if (isScrollableTextInput(e.target)) return;
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

    // Viewport culling: only draw strokes whose bounds intersect the visible
    // world rectangle (plus a margin for thick strokes). The spatial index
    // supplies candidates and `order` restores the original draw order.
    const viewWidth = canvas.width / dpr;
    const viewHeight = canvas.height / dpr;
    const margin = 64;
    const visibleRect = {
      x: -pan.x / zoom - margin,
      y: -pan.y / zoom - margin,
      width: viewWidth / zoom + margin * 2,
      height: viewHeight / zoom + margin * 2,
    };
    const visibleStrokes = getSpatialIndex()
      .queryRect(visibleRect)
      .filter((item) => item.element.type === 'stroke')
      .sort((a, b) => a.order - b.order);

    for (const item of visibleStrokes) {
      const stroke = item.element as DrawingStroke;
      drawSingleStroke(ctx, stroke);

      // Highlight selected stroke
      if (selectedElementIds.has(stroke.id) && stroke.points && stroke.points.length > 0) {
        const bounds = item.bounds;
        const pad = 6;
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.strokeRect(
          bounds.x - pad,
          bounds.y - pad,
          Math.max(12, bounds.width + pad * 2),
          Math.max(12, bounds.height + pad * 2)
        );
        ctx.restore();
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
  }, [elements, liveStrokes, currentStroke, drawSingleStroke, pan, zoom, selectedElementIds, theme, getSpatialIndex]);

  // The sizing effect runs once, so it reads the latest draw function through a ref.
  const renderCanvasRef = useRef(renderCanvas);
  useEffect(() => {
    renderCanvasRef.current = renderCanvas;
  }, [renderCanvas]);

  // Handle canvas sizing and DPI scaling once per mount. Width/height writes
  // reallocate the backing store, so they happen only when pixel size changes;
  // redraws for pan/zoom/selection are driven by the effect below.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let mediaQuery: MediaQueryList | null = null;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const resized = resizeCanvasBackingStore(canvas, container, dpr);
      if (resized) renderCanvasRef.current();
    };

    function watchDpr() {
      mediaQuery?.removeEventListener('change', onDprChange);
      const dpr = window.devicePixelRatio || 1;
      mediaQuery = window.matchMedia(dprMediaQuery(dpr));
      mediaQuery.addEventListener('change', onDprChange);
    }

    function onDprChange() {
      watchDpr();
      updateSize();
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    if (typeof window.matchMedia === 'function') watchDpr();

    return () => {
      observer.disconnect();
      mediaQuery?.removeEventListener('change', onDprChange);
    };
  }, []);

  // Re-render whenever strokes, pan, zoom, or theme change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas, theme]);

  // Continuous eraser collision check in world coordinates
  const checkAndEraseAlongSegment = useCallback(
    (from: Point, to: Point) => {
      const index = getSpatialIndex();
      const eraserRadius = Math.max(16, currentSize * 3 + 12) / zoom;

      // Narrow the search to elements the eraser path can actually reach.
      const candidates = index.queryRect({
        x: Math.min(from.x, to.x) - eraserRadius,
        y: Math.min(from.y, to.y) - eraserRadius,
        width: Math.abs(to.x - from.x) + eraserRadius * 2,
        height: Math.abs(to.y - from.y) + eraserRadius * 2,
      });
      if (candidates.length === 0) return;

      const elementsToDelete = new Set<string>();

      for (const item of candidates) {
        const el = item.element;
        // Wires do not have their own geometry; they are cascade-deleted below
        // when one of their endpoints is erased. Locked objects are untouched.
        if (el.type === 'wire' || isElementLocked(el)) continue;

        const rawPoints = (el as any).points;
        if (el.type === 'stroke' || (Array.isArray(rawPoints) && rawPoints.length > 0)) {
          const points: Point[] = rawPoints || [];
          if (points.length === 0) continue;
          const strokeSize = (el as any).size || 3;
          const effectiveR = eraserRadius + strokeSize / 2;

          if (points.length === 1) {
            if (distanceToSegment(points[0], from, to) <= effectiveR) {
              elementsToDelete.add(el.id);
            }
            continue;
          }

          // Test the whole eraser path against each stroke edge with a
          // segment-to-segment distance (O(edges)) instead of sub-sampling the
          // path and re-walking every edge for every sample.
          for (let i = 0; i < points.length - 1; i++) {
            if (segmentDistance(from, to, points[i], points[i + 1]) <= effectiveR) {
              elementsToDelete.add(el.id);
              break;
            }
          }
        } else {
          // Bounding box collision check for shapes, stickies, text, icons
          const bounds = item.bounds;
          if (
            segmentIntersectsRect(from, to, {
              x: bounds.x - eraserRadius,
              y: bounds.y - eraserRadius,
              width: bounds.width + eraserRadius * 2,
              height: bounds.height + eraserRadius * 2,
            })
          ) {
            elementsToDelete.add(el.id);
          }
        }
      }

      // Cascade-delete wires whose endpoints are being erased
      if (elementsToDelete.size > 0) {
        for (const el of Object.values(elementsRef.current) as CanvasElement[]) {
          if (el.type !== 'wire' || isElementLocked(el)) continue;
          if (elementsToDelete.has(el.fromId) || elementsToDelete.has(el.toId)) {
            elementsToDelete.add(el.id);
          }
        }
        onElementsBatchDelete(Array.from(elementsToDelete));
      }
    },
    [currentSize, zoom, onElementsBatchDelete, getSpatialIndex]
  );

  // Convert screen mouse coordinates into world coordinates
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    const pt = getTouchClientPoint(e as unknown as { touches?: TouchList; changedTouches?: TouchList; clientX?: number; clientY?: number });
    if (pt) {
      clientX = pt.clientX;
      clientY = pt.clientY;
    } else {
      return null;
    }

    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    return {
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    };
  };

  // Single exit path for an active stroke. Both pointer-up and gesture
  // interruption (pinch) use it, so a live stroke is always persisted and
  // removed from collaborators' live state through element-create.
  const finishStroke = useCallback(() => {
    const stroke = strokeInProgressRef.current;
    strokeInProgressRef.current = null;

    const committed = finalizeStrokeForCommit(stroke, zoom);
    if (committed) onElementCreate(committed);

    setIsDrawing(false);
    setCurrentStroke(null);
    lastEraserPointRef.current = null;
  }, [onElementCreate, zoom]);

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    cancelNavAnimation();
    // Multi-touch: If 2 or more fingers touch the screen, immediately enter pinch-to-zoom & two-finger pan
    if ('touches' in e && e.touches.length >= 2) {
      if ('preventDefault' in e && typeof (e as any).preventDefault === 'function') {
        e.preventDefault();
      }
      // Commit an in-progress stroke instead of dropping it: the final element
      // clears every client's live-stroke representation, so no ghost remains.
      finishStroke();
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

    // Touch long-press opens the context menu on selectable objects
    if ('touches' in e && e.touches.length === 1 && currentTool === 'select') {
      cancelLongPress();
      const touch = e.touches[0];
      longPressStartRef.current = { x: touch.clientX, y: touch.clientY };
      const touchX = touch.clientX;
      const touchY = touch.clientY;
      longPressTimerRef.current = window.setTimeout(() => {
        openContextMenuAt(touchX, touchY);
        longPressTimerRef.current = null;
      }, 520);
    }

    // Check if Middle Mouse Button (button === 1), Hand Tool, or Spacebar Pan
    const isPan = isPanInteraction({
      button: 'button' in e ? e.button : undefined,
      tool: currentTool,
      isSpacePressed: spacePressed,
    });

    if (isPan) {
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
      const clicked = findElementsAtCoords(coords);

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
        zIndex: Date.now(),
      };
      newlyCreatedElementIdsRef.current.add(newSticky.id);
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
        zIndex: Date.now(),
      };
      newlyCreatedElementIdsRef.current.add(newText.id);
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
        zIndex: Date.now(),
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
        zIndex: Date.now(),
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

      strokeInProgressRef.current = newStroke;
      setCurrentStroke(newStroke);
      onStrokeLiveStart(strokeId, coords, effectiveColor, currentSize, currentTool === 'highlighter');
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    // A moving finger is a drag, not a long-press
    if (longPressStartRef.current && 'touches' in e && e.touches[0]) {
      const dx = e.touches[0].clientX - longPressStartRef.current.x;
      const dy = e.touches[0].clientY - longPressStartRef.current.y;
      if (Math.hypot(dx, dy) > 8) cancelLongPress();
    }

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

    const stroke = strokeInProgressRef.current;
    if (!stroke) return;

    // Skip points the user cannot distinguish at the current zoom level.
    // This cuts array copies, React renders, live-stroke traffic and final
    // persisted stroke size.
    const minPointDistance = 1.25 / zoom;
    const points = stroke.points;
    const lastPoint = points[points.length - 1];
    if (lastPoint) {
      const dx = coords.x - lastPoint.x;
      const dy = coords.y - lastPoint.y;
      if (dx * dx + dy * dy < minPointDistance * minPointDistance) return;
    }

    const updatedStroke = { ...stroke, points: [...points, coords] };
    strokeInProgressRef.current = updatedStroke;
    setCurrentStroke(updatedStroke);

    onStrokeLivePoint(stroke.id, coords);
  };

  const handlePointerUp = (e?: React.MouseEvent | React.TouchEvent) => {
    cancelLongPress();

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
        const candidates = getSpatialIndex().queryRect({ x: minX, y: minY, width, height });
        const enclosedIds: string[] = [];
        for (const item of candidates) {
          const el = item.element;
          if (el.type === 'wire') continue;
          if (el.type === 'stroke') {
            const points = (el as DrawingStroke).points;
            const hasPoint =
              !!points &&
              points.some((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
            if (hasPoint) enclosedIds.push(el.id);
            continue;
          }
          const bounds = item.bounds;
          if (
            bounds.x + bounds.width >= minX &&
            bounds.x <= maxX &&
            bounds.y + bounds.height >= minY &&
            bounds.y <= maxY
          ) {
            enclosedIds.push(el.id);
          }
        }

        setSelectedElementIds(new Set(enclosedIds));
      }
      setMarqueeRect(null);
      return;
    }

    finishStroke();
  };

  // Partition elements once per update instead of running five separate
  // full-array filters on every render.
  const { wireElements, positionedElements } = useMemo(() => {
    const wires: WireElement[] = [];
    const positioned: CanvasElement[] = [];

    for (const el of Object.values(elements) as CanvasElement[]) {
      if (el.type === 'wire') {
        wires.push(el);
      } else if (el.type === 'sticky' || el.type === 'text' || el.type === 'shape' || el.type === 'icon') {
        positioned.push(el);
      }
    }

    const order = new Map<string, number>();
    Object.keys(elements).forEach((id, index) => order.set(id, index));
    positioned.sort((a, b) => getElementZ(a, order.get(a.id) ?? 0) - getElementZ(b, order.get(b.id) ?? 0));

    return {
      wireElements: wires,
      positionedElements: positioned,
    };
  }, [elements]);
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
    <T extends CanvasElement>(el: T, offset?: { dx: number; dy: number }): T | undefined => {
      if (el.type === 'wire') {
        // Duplicating a wire is not meaningful without also duplicating its endpoints.
        return undefined;
      }

      const dx = offset?.dx ?? 24;
      const dy = offset?.dy ?? 24;
      let cloned: CanvasElement;
      const newId = `${el.type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      if (el.type === 'stroke') {
        cloned = {
          ...el,
          id: newId,
          points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
          createdAt: Date.now(),
        };
      } else {
        cloned = {
          ...el,
          id: newId,
          x: el.x + dx,
          y: el.y + dy,
          updatedAt: Date.now(),
          zIndex: Date.now(),
        } as CanvasElement;
      }
      onElementCreate(cloned);
      setSelectedElementIds(new Set([cloned.id]));
      return cloned as T;
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
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenuAt(e.clientX, e.clientY);
      }}
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
          isWorldLayerPointerEventsDisabled(currentTool, spacePressed) ? '[&_*]:pointer-events-none' : ''
        }`}
      >
        {/* Wires Layer (Line & Curve Connectors) */}
        <svg
          id="whiteboard-wires-svg-layer"
          className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-10"
        >
          {aiHighlightIds.size > 0 &&
            wireElements
              .filter((wire) => aiHighlightIds.has(wire.id))
              .map((wire) => {
                const sourceEl = elements[wire.fromId];
                const targetEl = elements[wire.toId];
                if (!sourceEl || !targetEl) return null;
                const route = routeWire(
                  sourceEl,
                  targetEl,
                  wire.wireType || 'curve',
                  wire.fromAnchor,
                  wire.toAnchor
                );
                if (!route) return null;
                return (
                  <path
                    key={`ai-highlight-wire-${wire.id}`}
                    d={route.svgPath}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth={(wire.strokeWidth || 3) + 12}
                    strokeOpacity={0.38}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none animate-pulse"
                  />
                );
              })}

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
              onSelect={(isMulti) => handleSelectElement(wire.id, isMulti)}
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

        {/* Positioned Elements Layer (Unified global z-order across sticky, text, shape, icon) */}
        {positionedElements.map((el) => {
          if (el.type === 'sticky') {
            return (
              <StickyNoteItem
                key={el.id}
                note={el}
                currentUserId={currentUserId}
                canWrite={canWrite}
                zoom={zoom}
                isSelected={selectedElementIds.has(el.id)}
                isMultiSelection={selectedElementIds.size > 1}
                autoFocus={newlyCreatedElementIdsRef.current.has(el.id)}
                onSelect={(isMulti) => handleSelectElement(el.id, isMulti)}
                onUpdate={onElementUpdate}
                onDelete={handleElementDelete}
                onDuplicate={handleDuplicateElement}
                onMoveSelectionStart={beginSelectionDrag}
                onMoveSelection={moveSelectionByDelta}
                onMoveSelectionEnd={endSelectionDrag}
              />
            );
          }
          if (el.type === 'text') {
            return (
              <TextItem
                key={el.id}
                element={el}
                currentUserId={currentUserId}
                canWrite={canWrite}
                zoom={zoom}
                theme={theme}
                isSelected={selectedElementIds.has(el.id)}
                isMultiSelection={selectedElementIds.size > 1}
                autoFocus={newlyCreatedElementIdsRef.current.has(el.id)}
                onSelect={(isMulti) => handleSelectElement(el.id, isMulti)}
                onUpdate={onElementUpdate}
                onDelete={handleElementDelete}
                onDuplicate={handleDuplicateElement}
                onMoveSelectionStart={beginSelectionDrag}
                onMoveSelection={moveSelectionByDelta}
                onMoveSelectionEnd={endSelectionDrag}
              />
            );
          }
          if (el.type === 'shape') {
            return (
              <ShapeItem
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
                onMoveSelectionStart={beginSelectionDrag}
                onMoveSelection={moveSelectionByDelta}
                onMoveSelectionEnd={endSelectionDrag}
              />
            );
          }
          if (el.type === 'icon') {
            return (
              <IconItem
                key={el.id}
                element={el}
                currentUserId={currentUserId}
                canWrite={canWrite}
                zoom={zoom}
                isSelected={selectedElementIds.has(el.id)}
                isMultiSelection={selectedElementIds.size > 1}
                onSelect={(isMulti) => handleSelectElement(el.id, isMulti)}
                onUpdate={onElementUpdate}
                onDelete={handleElementDelete}
                onDuplicate={handleDuplicateElement}
                onMoveSelectionStart={beginSelectionDrag}
                onMoveSelection={moveSelectionByDelta}
                onMoveSelectionEnd={endSelectionDrag}
              />
            );
          }
          return null;
        })}

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


        {/* AI Change Highlight Spotlight Overlays */}
        {aiHighlightIds.size > 0 && (() => {
          let labelCount = 0;
          return positionedElements
            .filter((el) => aiHighlightIds.has(el.id))
            .map((el) => {
              const bounds = getElementBounds(el);
              const showBadge = labelCount < 3;
              if (showBadge) labelCount += 1;
              return (
                <div
                  key={`ai-highlight-${el.id}`}
                  data-ai-highlight
                  style={{
                    left: bounds.x - 7,
                    top: bounds.y - 7,
                    width: bounds.width + 14,
                    height: bounds.height + 14,
                  }}
                  className="pointer-events-none absolute z-30 rounded-2xl border-2 border-indigo-500 dark:border-indigo-400 ring-4 ring-indigo-500/25 dark:ring-indigo-400/25 bg-indigo-500/[0.06] shadow-[0_0_24px_rgba(99,102,241,0.45)] animate-pulse"
                >
                  {showBadge && (
                    <span className="absolute -top-6 left-0 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-md whitespace-nowrap">
                      <Sparkles className="w-2.5 h-2.5 shrink-0" aria-hidden />
                      {aiHighlightBadge}
                    </span>
                  )}
                </div>
              );
            });
        })()}

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
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetView}
        handToggle={actions.handToggle}
      />

      {/* Shortcut cheat-sheet launcher */}
      <ShortcutsLauncherButton
        id="shortcuts-btn"
        onOpen={actions.actions.shortcuts.handler}
        label={actions.actions.shortcuts.shortLabel}
        shortcut={actions.actions.shortcuts.shortcut}
        title={actions.actions.shortcuts.title}
        ariaLabel={actions.actions.shortcuts.ariaLabel}
        icon={actions.actions.shortcuts.icon}
      />

      {/* Floating Selection Action Bar (single and multi-selection) */}
      {selectedElementIds.size > 0 && (
        <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 sm:gap-2 px-2 sm:px-3.5 py-1.5 sm:py-2 max-w-[96vw] overflow-x-auto wb-card-glass rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 animate-pop-in pointer-events-auto wb-sidebar-centered">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/70 rounded-xl text-blue-600 dark:text-blue-400 font-semibold text-xs border border-blue-200/80 dark:border-blue-900/60 shrink-0 shadow-2xs">
            <MousePointer className="w-3.5 h-3.5" />
            <span>{selectedElementIds.size} selected</span>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" />

          {[
            selectionActionDefs.selectAll,
            selectionActionDefs.copy,
            ...(canWrite
              ? [
                  selectionActionDefs.duplicate,
                  selectionActionDefs.lockToggle,
                  selectionActionDefs.delete,
                ]
              : []),
          ].map((def) => {
            const Icon = def.icon;
            const isDanger = 'danger' in def && def.danger;
            const labelText = 'shortLabel' in def && def.shortLabel ? def.shortLabel : def.label;
            return (
              <button
                key={def.id}
                onClick={def.handler}
                title={def.title}
                className={`px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 btn-press ${
                  isDanger
                    ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${def.iconClassName}`.trim()} />
                <span className="hidden sm:inline">{labelText}</span>
              </button>
            );
          })}

          {/* Clear / Deselect */}
          <button
            onClick={handleClearSelection}
            title="Deselect All (Esc)"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0 btn-press"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Right-click / long-press actions */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
          header={
            selectedElementIds.size > 1
              ? `${selectedElementIds.size} objects`
              : selectedElementIds.size === 1
                ? 'Object'
                : 'Canvas'
          }
        />
      )}
    </div>
  );
};
