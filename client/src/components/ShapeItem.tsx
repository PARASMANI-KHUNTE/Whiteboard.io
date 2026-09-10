import React, { useState, useRef, useEffect } from 'react';
import { ShapeElement } from '../types';
import {
  Trash2,
  Move,
  Palette,
  RotateCw,
  Copy,
  Lock,
  Unlock,
  Sliders,
  Type,
} from 'lucide-react';
import { getAdaptiveDisplayColor } from '../utils/themeColors';

interface ShapeItemProps {
  element: ShapeElement;
  currentUserId: string;
  canWrite?: boolean;
  zoom?: number;
  theme?: 'light' | 'dark';
  isSelected?: boolean;
  isMultiSelection?: boolean;
  onSelect?: (isMulti?: boolean) => void;
  onUpdate: (updated: ShapeElement) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (element: ShapeElement) => void;
}

const PALETTE_COLORS = [
  '#0f172a',
  '#ffffff',
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
];

const STROKE_WIDTHS = [
  { label: 'Thin', val: 2 },
  { label: 'Medium', val: 4 },
  { label: 'Bold', val: 8 },
];

const OPACITIES = [
  { label: '100%', val: 1.0 },
  { label: '75%', val: 0.75 },
  { label: '50%', val: 0.5 },
  { label: '25%', val: 0.25 },
];

export const ShapeItem: React.FC<ShapeItemProps> = ({
  element,
  canWrite = true,
  zoom = 1,
  theme = 'light',
  isSelected = false,
  isMultiSelection = false,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
}) => {
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: element.x, y: element.y });
  const [localSize, setLocalSize] = useState<{ width: number; height: number }>({
    width: element.width || 160,
    height: element.height || 120,
  });
  const [rotation, setRotation] = useState<number>(element.rotation || 0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(element.text || '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const debounceTextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPosRef = useRef(localPos);
  const currentSizeRef = useRef(localSize);
  const currentRotRef = useRef(rotation);
  const lastEmitRef = useRef<number>(0);
  const elementRef = useRef<HTMLDivElement | null>(null);

  const isLocked = Boolean(element.isLocked);

  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: element.x, y: element.y });
      currentPosRef.current = { x: element.x, y: element.y };
    }
  }, [element.x, element.y, isDragging]);

  useEffect(() => {
    if (!isResizing) {
      const w = element.width || 160;
      const h = element.height || 120;
      setLocalSize({ width: w, height: h });
      currentSizeRef.current = { width: w, height: h };
    }
  }, [element.width, element.height, isResizing]);

  useEffect(() => {
    if (!isRotating) {
      setRotation(element.rotation || 0);
      currentRotRef.current = element.rotation || 0;
    }
  }, [element.rotation, isRotating]);

  // Sync external text changes when not locally editing
  useEffect(() => {
    if (!isEditing) {
      setLocalText(element.text || '');
    }
  }, [element.text, isEditing]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTextTimerRef.current) {
        clearTimeout(debounceTextTimerRef.current);
      }
    };
  }, []);

  // Close menus and popovers when deselected or clicking outside
  useEffect(() => {
    if (!isSelected) {
      setShowColorPicker(false);
      setShowStyleMenu(false);
      setIsEditing(false);
      return;
    }

    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (elementRef.current && !elementRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
        setShowStyleMenu(false);
        setIsEditing(false);
      }
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown);
    };
  }, [isSelected]);

  // Handle Dragging / Repositioning
  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (!canWrite || isLocked) return;
    e.stopPropagation();
    onSelect?.();
    setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialPos = { ...currentPosRef.current };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / (zoom || 1);
      const deltaY = (moveEvent.clientY - startY) / (zoom || 1);
      const newX = Math.max(0, initialPos.x + deltaX);
      const newY = Math.max(0, initialPos.y + deltaY);

      currentPosRef.current = { x: newX, y: newY };
      setLocalPos({ x: newX, y: newY });

      const now = Date.now();
      if (now - lastEmitRef.current > 40) {
        lastEmitRef.current = now;
        onUpdate({
          ...element,
          x: newX,
          y: newY,
          updatedAt: now,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onUpdate({
        ...element,
        x: currentPosRef.current.x,
        y: currentPosRef.current.y,
        updatedAt: Date.now(),
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Handle Multi-corner Resizing (NW, NE, SW, SE)
  const handleMouseDownResize = (
    e: React.MouseEvent,
    corner: 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    if (!canWrite || isLocked) return;
    e.stopPropagation();
    onSelect?.();
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialPos = { ...currentPosRef.current };
    const initialSize = { ...currentSizeRef.current };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / (zoom || 1);
      const deltaY = (moveEvent.clientY - startY) / (zoom || 1);

      let newWidth = initialSize.width;
      let newHeight = initialSize.height;
      let newX = initialPos.x;
      let newY = initialPos.y;

      if (corner === 'se') {
        newWidth = Math.max(40, initialSize.width + deltaX);
        newHeight = Math.max(40, initialSize.height + deltaY);
      } else if (corner === 'ne') {
        newWidth = Math.max(40, initialSize.width + deltaX);
        const tentativeHeight = initialSize.height - deltaY;
        if (tentativeHeight >= 40) {
          newHeight = tentativeHeight;
          newY = initialPos.y + deltaY;
        }
      } else if (corner === 'sw') {
        const tentativeWidth = initialSize.width - deltaX;
        if (tentativeWidth >= 40) {
          newWidth = tentativeWidth;
          newX = initialPos.x + deltaX;
        }
        newHeight = Math.max(40, initialSize.height + deltaY);
      } else if (corner === 'nw') {
        const tentativeWidth = initialSize.width - deltaX;
        const tentativeHeight = initialSize.height - deltaY;
        if (tentativeWidth >= 40) {
          newWidth = tentativeWidth;
          newX = initialPos.x + deltaX;
        }
        if (tentativeHeight >= 40) {
          newHeight = tentativeHeight;
          newY = initialPos.y + deltaY;
        }
      }

      currentPosRef.current = { x: newX, y: newY };
      currentSizeRef.current = { width: newWidth, height: newHeight };
      setLocalPos({ x: newX, y: newY });
      setLocalSize({ width: newWidth, height: newHeight });

      const now = Date.now();
      if (now - lastEmitRef.current > 40) {
        lastEmitRef.current = now;
        onUpdate({
          ...element,
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
          updatedAt: now,
        });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onUpdate({
        ...element,
        x: currentPosRef.current.x,
        y: currentPosRef.current.y,
        width: currentSizeRef.current.width,
        height: currentSizeRef.current.height,
        updatedAt: Date.now(),
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Handle Free Rotation
  const handleMouseDownRotate = (e: React.MouseEvent) => {
    if (!canWrite || isLocked) return;
    e.stopPropagation();
    onSelect?.();
    setIsRotating(true);

    if (!elementRef.current) return;
    const rect = elementRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rad = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
      let deg = Math.round((rad * (180 / Math.PI)) + 90);
      if (deg < 0) deg += 360;
      if (deg >= 360) deg -= 360;

      // Snap to 0, 45, 90, 180, 270 if close
      const snapPoints = [0, 45, 90, 135, 180, 225, 270, 315, 360];
      for (const snap of snapPoints) {
        if (Math.abs(deg - snap) < 5) {
          deg = snap % 360;
          break;
        }
      }

      currentRotRef.current = deg;
      setRotation(deg);

      const now = Date.now();
      if (now - lastEmitRef.current > 40) {
        lastEmitRef.current = now;
        onUpdate({
          ...element,
          rotation: deg,
          updatedAt: now,
        });
      }
    };

    const handleMouseUp = () => {
      setIsRotating(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      onUpdate({
        ...element,
        rotation: currentRotRef.current,
        updatedAt: Date.now(),
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Quick Rotate 45 degrees
  const handleQuickRotate = () => {
    const newRot = ((element.rotation || 0) + 45) % 360;
    setRotation(newRot);
    onUpdate({
      ...element,
      rotation: newRot,
      updatedAt: Date.now(),
    });
  };

  const handleColorChange = (newColor: string) => {
    setShowColorPicker(false);
    onUpdate({
      ...element,
      color: newColor,
      updatedAt: Date.now(),
    });
  };

  // Toggle Fill Mode: none -> tint (20%) -> solid (100%) -> none
  const handleCycleFillMode = () => {
    const currentFill = element.fillColor;
    let nextFill: string;
    if (!currentFill || currentFill === 'transparent') {
      nextFill = `${element.color}30`; // Tinted
    } else if (currentFill === `${element.color}30` || currentFill.endsWith('20') || currentFill.endsWith('30')) {
      nextFill = element.color; // Solid
    } else {
      nextFill = 'transparent'; // Outline only
    }

    onUpdate({
      ...element,
      fillColor: nextFill,
      updatedAt: Date.now(),
    });
  };

  const handleStrokeWidthChange = (w: number) => {
    onUpdate({
      ...element,
      strokeWidth: w,
      updatedAt: Date.now(),
    });
  };

  const handleStrokeStyleChange = (style: 'solid' | 'dashed' | 'dotted') => {
    onUpdate({
      ...element,
      strokeStyle: style,
      updatedAt: Date.now(),
    });
  };

  const handleOpacityChange = (val: number) => {
    onUpdate({
      ...element,
      opacity: val,
      updatedAt: Date.now(),
    });
  };

  const handleToggleLock = () => {
    onUpdate({
      ...element,
      isLocked: !isLocked,
      updatedAt: Date.now(),
    });
  };

  const handleDuplicate = () => {
    if (onDuplicate) {
      onDuplicate(element);
    } else {
      onUpdate({
        ...element,
        id: `shape_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        x: element.x + 24,
        y: element.y + 24,
        updatedAt: Date.now(),
      });
    }
  };

  const handleTextChange = (newText: string) => {
    if (!canWrite) return;
    setLocalText(newText);

    if (debounceTextTimerRef.current) {
      clearTimeout(debounceTextTimerRef.current);
    }
    debounceTextTimerRef.current = setTimeout(() => {
      onUpdate({
        ...element,
        text: newText,
        updatedAt: Date.now(),
      });
    }, 300);
  };

  const handleTextBlur = () => {
    setIsEditing(false);
    if (debounceTextTimerRef.current) {
      clearTimeout(debounceTextTimerRef.current);
    }
    if (localText !== (element.text || '')) {
      onUpdate({
        ...element,
        text: localText,
        updatedAt: Date.now(),
      });
    }
  };

  const { width, height } = localSize;
  const strokeWidth = element.strokeWidth || 3;
  const strokeColor = getAdaptiveDisplayColor(element.color, theme);
  const strokeStyle = element.strokeStyle || 'solid';
  const opacity = element.opacity ?? 1.0;

  // Determine SVG stroke-dasharray
  const dashArray =
    strokeStyle === 'dashed' ? '8 6' : strokeStyle === 'dotted' ? '3 5' : undefined;

  // Fill logic
  const isTransparent = !element.fillColor || element.fillColor === 'transparent';
  const isSolid = Boolean(element.fillColor && element.fillColor === element.color);
  const fillColor = isTransparent ? 'transparent' : element.fillColor || `${strokeColor}20`;

  // Helper to test if a color is perceptually dark
  const isColorDark = (hex?: string) => {
    if (!hex || hex === 'transparent') return false;
    if (hex.startsWith('#')) {
      const c = hex.substring(1);
      const rgb = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
      if (isNaN(rgb)) return false;
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = (rgb >> 0) & 0xff;
      return 0.299 * r + 0.587 * g + 0.114 * b < 140;
    }
    return false;
  };

  const getEffectiveTextColor = () => {
    if (element.textColor) {
      return getAdaptiveDisplayColor(element.textColor, theme);
    }
    if (!isTransparent && fillColor !== 'transparent') {
      return isColorDark(fillColor) ? '#ffffff' : (theme === 'dark' ? '#ffffff' : '#0f172a');
    }
    return strokeColor;
  };

  const resolvedTextColor = getEffectiveTextColor();

  const resolvedFontSize =
    element.fontSize ||
    Math.max(12, Math.min(22, Math.round(Math.min(width, height) / 7)));

  // Render SVG Shape
  const renderShapeSvg = () => {
    const pad = strokeWidth;

    switch (element.shapeType) {
      case 'rectangle':
        return (
          <rect
            x={pad / 2}
            y={pad / 2}
            width={Math.max(1, width - pad)}
            height={Math.max(1, height - pad)}
            rx={10}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            fill={fillColor}
          />
        );

      case 'circle':
        return (
          <ellipse
            cx={width / 2}
            cy={height / 2}
            rx={Math.max(1, (width - pad) / 2)}
            ry={Math.max(1, (height - pad) / 2)}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            fill={fillColor}
          />
        );

      case 'diamond':
        return (
          <polygon
            points={`${width / 2},${pad} ${width - pad},${height / 2} ${width / 2},${height - pad} ${pad},${height / 2}`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeLinejoin="round"
            fill={fillColor}
          />
        );

      case 'triangle':
        return (
          <polygon
            points={`${width / 2},${pad} ${width - pad},${height - pad} ${pad},${height - pad}`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeLinejoin="round"
            fill={fillColor}
          />
        );

      case 'star': {
        const cx = width / 2;
        const cy = height / 2;
        const spikes = 5;
        const outerRadius = Math.min(width, height) / 2 - pad;
        const innerRadius = outerRadius * 0.45;
        let rot = (Math.PI / 2) * 3;
        const step = Math.PI / spikes;
        let pathStr = '';

        for (let i = 0; i < spikes; i++) {
          let x = cx + Math.cos(rot) * outerRadius;
          let y = cy + Math.sin(rot) * outerRadius;
          pathStr += (i === 0 ? 'M ' : ' L ') + x + ' ' + y;
          rot += step;

          x = cx + Math.cos(rot) * innerRadius;
          y = cy + Math.sin(rot) * innerRadius;
          pathStr += ' L ' + x + ' ' + y;
          rot += step;
        }
        pathStr += ' Z';

        return (
          <path
            d={pathStr}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeLinejoin="round"
            fill={fillColor}
          />
        );
      }

      case 'arrow': {
        const arrowH = height * 0.4;
        const headW = Math.min(width * 0.4, height * 0.8);
        const yCenter = height / 2;
        const stemTop = yCenter - arrowH / 2;
        const stemBottom = yCenter + arrowH / 2;

        const points = `
          ${pad},${stemTop}
          ${width - headW},${stemTop}
          ${width - headW},${pad}
          ${width - pad},${yCenter}
          ${width - headW},${height - pad}
          ${width - headW},${stemBottom}
          ${pad},${stemBottom}
        `;

        return (
          <polygon
            points={points}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeLinejoin="round"
            fill={fillColor}
          />
        );
      }

      default:
        return null;
    }
  };

  const showControls = canWrite && isSelected && !isMultiSelection;

  return (
    <div
      ref={elementRef}
      id={`shape-${element.id}`}
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px) rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        width: `${width}px`,
        height: `${height}px`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect?.(e.shiftKey || e.ctrlKey || e.metaKey);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(e.shiftKey || e.ctrlKey || e.metaKey);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onSelect?.(e.shiftKey || e.ctrlKey || e.metaKey);
      }}
      onDoubleClick={(e) => {
        if (!canWrite || isLocked) return;
        e.stopPropagation();
        setIsEditing(true);
      }}
      className={`absolute top-0 left-0 select-none z-20 group pointer-events-auto ${
        isDragging ? 'cursor-grabbing' : ''
      } ${
        isSelected
          ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 rounded-xl'
          : ''
      }`}
    >
      {/* Rotation Stalk and Pin Handle (Visible when selected, unlocked, and not in multi-selection) */}
      {canWrite && !isLocked && isSelected && !isMultiSelection && (
        <div
          className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing z-40"
          onMouseDown={handleMouseDownRotate}
          title="Drag to rotate shape freely"
        >
          <div className="w-3.5 h-3.5 rounded-full bg-white dark:bg-slate-800 border-2 border-blue-500 shadow-sm hover:scale-125 transition-transform" />
          <div className="w-0.5 h-3 bg-blue-500" />
        </div>
      )}

      {/* Floating Action Menu on Selection / Hover */}
      {showControls && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl rounded-xl px-2 py-1 flex items-center gap-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 whitespace-nowrap text-slate-700 dark:text-slate-200"
          style={{ transform: `translateX(-50%) rotate(-${rotation}deg)` }}
        >
          {/* Hover Bridge */}
          <div className="absolute top-full left-0 right-0 h-3" />

          {/* Move Drag Handle */}
          {!isLocked && (
            <div
              onMouseDown={handleMouseDownDrag}
              title="Drag to move shape"
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-grab active:cursor-grabbing"
            >
              <Move className="w-3.5 h-3.5" />
            </div>
          )}

          {/* Quick Rotate 45 deg */}
          {!isLocked && (
            <button
              onClick={handleQuickRotate}
              title="Rotate 45°"
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Fill Mode Button (Cycle None / Tint / Solid) */}
          {!isLocked && (
            <button
              onClick={handleCycleFillMode}
              title={`Fill mode: ${isTransparent ? 'Outline' : isSolid ? 'Solid' : 'Tinted'}. Click to cycle`}
              className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer border transition-colors ${
                isSolid
                  ? 'bg-blue-600 text-white border-blue-600'
                  : !isTransparent
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {isSolid ? 'Solid' : !isTransparent ? 'Tint' : 'None'}
            </button>
          )}

          {/* Style Properties Menu (Stroke width, style, opacity) */}
          {!isLocked && (
            <div className="relative">
              <button
                onClick={() => setShowStyleMenu(!showStyleMenu)}
                title="Stroke style & opacity"
                className={`p-1 rounded-lg cursor-pointer transition-colors ${
                  showStyleMenu
                    ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>

              {showStyleMenu && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute left-1/2 -translate-x-1/2 top-8 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3 flex flex-col gap-2.5 z-50 min-w-[170px]"
                >
                  {/* Stroke Width */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Border Width
                    </div>
                    <div className="flex items-center gap-1.5">
                      {STROKE_WIDTHS.map((sw) => (
                        <button
                          key={sw.val}
                          onClick={() => handleStrokeWidthChange(sw.val)}
                          className={`flex-1 py-1 text-xs rounded font-medium transition-colors cursor-pointer border ${
                            strokeWidth === sw.val
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                          }`}
                        >
                          {sw.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stroke Style */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Border Style
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(['solid', 'dashed', 'dotted'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => handleStrokeStyleChange(st)}
                          className={`py-1 text-xs capitalize rounded font-medium transition-colors cursor-pointer border ${
                            strokeStyle === st
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Opacity */}
                  <div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Opacity
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {OPACITIES.map((op) => (
                        <button
                          key={op.val}
                          onClick={() => handleOpacityChange(op.val)}
                          className={`py-1 text-[11px] rounded font-medium transition-colors cursor-pointer border ${
                            opacity === op.val
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Write / Edit Text Button */}
          {!isLocked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              title="Write text inside shape (or double-click shape)"
              className={`p-1 rounded-lg cursor-pointer transition-colors ${
                isEditing
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Color Picker Toggle */}
          {!isLocked && (
            <div className="relative">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="Change color"
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <Palette className="w-3.5 h-3.5" />
              </button>

              {showColorPicker && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute left-1/2 -translate-x-1/2 top-8 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 flex gap-1 z-50"
                >
                  {PALETTE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleColorChange(c)}
                      style={{ backgroundColor: c }}
                      className={`w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 hover:scale-110 transition-transform cursor-pointer ${
                        element.color === c ? 'ring-2 ring-blue-500' : ''
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Duplicate Button */}
          {!isLocked && (
            <button
              onClick={handleDuplicate}
              title="Duplicate shape"
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Lock / Unlock Toggle */}
          <button
            onClick={handleToggleLock}
            title={isLocked ? 'Unlock shape' : 'Lock shape in place'}
            className={`p-1 rounded-lg cursor-pointer transition-colors ${
              isLocked
                ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>

          {/* Delete Button */}
          <button
            onClick={() => onDelete(element.id)}
            title="Delete shape"
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SVG Canvas for Shape */}
      <svg
        width={width}
        height={height}
        style={{ opacity }}
        className="w-full h-full overflow-visible pointer-events-auto cursor-move"
        onMouseDown={handleMouseDownDrag}
        onDoubleClick={(e) => {
          if (!canWrite || isLocked) return;
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        {renderShapeSvg()}
      </svg>

      {/* Inner Shape Text Layer */}
      <div
        className={`absolute inset-0 flex items-center justify-center p-3 overflow-hidden ${
          isEditing ? 'pointer-events-auto z-30' : 'pointer-events-none z-10'
        }`}
        style={{
          transform: `rotate(-${rotation}deg)`,
          transformOrigin: 'center center',
          padding:
            element.shapeType === 'triangle'
              ? `${height * 0.35}px 16px 12px 16px`
              : element.shapeType === 'arrow'
              ? '8px 28px 8px 12px'
              : '12px',
        }}
        onDoubleClick={(e) => {
          if (!canWrite || isLocked) return;
          e.stopPropagation();
          setIsEditing(true);
        }}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={localText}
            onChange={(e) => handleTextChange(e.target.value)}
            onBlur={handleTextBlur}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.currentTarget.blur();
              }
            }}
            placeholder="Type text..."
            className="w-full h-full bg-transparent text-center resize-none border-none outline-none font-medium leading-snug p-0 overflow-y-auto placeholder:text-slate-400/50"
            style={{
              color: resolvedTextColor,
              fontSize: `${resolvedFontSize}px`,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        ) : localText ? (
          <div
            className="w-full h-full flex items-center justify-center text-center font-medium leading-snug break-words overflow-hidden select-none"
            style={{
              color: resolvedTextColor,
              fontSize: `${resolvedFontSize}px`,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {localText}
          </div>
        ) : (
          (isSelected || isHovered) && canWrite && !isLocked && !isMultiSelection && (
            <div className="text-[11px] text-slate-400/60 dark:text-slate-500/60 select-none pointer-events-none font-normal italic">
              Double-click to write
            </div>
          )
        )}
      </div>

      {/* 4 Corner Resize Handles (NW, NE, SW, SE) */}
      {canWrite && !isLocked && isSelected && !isMultiSelection && (
        <>
          {/* NW - Top Left */}
          <div
            onMouseDown={(e) => handleMouseDownResize(e, 'nw')}
            title="Resize shape"
            className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-full shadow-sm cursor-nwse-resize z-30 hover:scale-125 transition-transform"
          />
          {/* NE - Top Right */}
          <div
            onMouseDown={(e) => handleMouseDownResize(e, 'ne')}
            title="Resize shape"
            className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-full shadow-sm cursor-nesw-resize z-30 hover:scale-125 transition-transform"
          />
          {/* SW - Bottom Left */}
          <div
            onMouseDown={(e) => handleMouseDownResize(e, 'sw')}
            title="Resize shape"
            className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-full shadow-sm cursor-nesw-resize z-30 hover:scale-125 transition-transform"
          />
          {/* SE - Bottom Right */}
          <div
            onMouseDown={(e) => handleMouseDownResize(e, 'se')}
            title="Resize shape"
            className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-full shadow-sm cursor-nwse-resize z-30 hover:scale-125 transition-transform"
          />
        </>
      )}
    </div>
  );
};
