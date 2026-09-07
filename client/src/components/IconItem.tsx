import React, { useState, useRef, useEffect, useMemo } from 'react';
import { IconElement } from '../types';
import {
  Trash2,
  Move,
  Palette,
  RotateCw,
  Copy,
  Lock,
  Unlock,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Smile,
  Sliders,
  Search,
  X,
} from 'lucide-react';
import { AVAILABLE_ICONS } from '../constants/icons';

interface IconItemProps {
  element: IconElement;
  currentUserId: string;
  canWrite?: boolean;
  zoom?: number;
  isSelected?: boolean;
  isMultiSelection?: boolean;
  onSelect?: (isMulti?: boolean) => void;
  onUpdate: (updated: IconElement) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (element: IconElement) => void;
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

const SIZES = [
  { label: 'S', val: 32 },
  { label: 'M', val: 48 },
  { label: 'L', val: 64 },
  { label: 'XL', val: 96 },
];

const OPACITIES = [
  { label: '100%', val: 1.0 },
  { label: '75%', val: 0.75 },
  { label: '50%', val: 0.5 },
  { label: '25%', val: 0.25 },
];

export const IconItem: React.FC<IconItemProps> = ({
  element,
  canWrite = true,
  zoom = 1,
  isSelected = false,
  isMultiSelection = false,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
}) => {
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: element.x, y: element.y });
  const [localSize, setLocalSize] = useState<number>(element.size || 48);
  const [rotation, setRotation] = useState<number>(element.rotation || 0);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [iconSearchQuery, setIconSearchQuery] = useState('');

  const filteredIcons = useMemo(() => {
    const q = iconSearchQuery.trim().toLowerCase();
    const entries = Object.entries(AVAILABLE_ICONS);
    if (!q) return entries;
    return entries.filter(
      ([key, config]) =>
        key.toLowerCase().includes(q) ||
        config.label.toLowerCase().includes(q) ||
        config.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [iconSearchQuery]);

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
      setLocalSize(element.size || 48);
      currentSizeRef.current = element.size || 48;
    }
  }, [element.size, isResizing]);

  useEffect(() => {
    if (!isRotating) {
      setRotation(element.rotation || 0);
      currentRotRef.current = element.rotation || 0;
    }
  }, [element.rotation, isRotating]);

  // Close menus and popovers when deselected or clicking outside
  useEffect(() => {
    if (!isSelected) {
      setShowColorPicker(false);
      setShowIconPicker(false);
      setShowStyleMenu(false);
      return;
    }

    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (elementRef.current && !elementRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
        setShowIconPicker(false);
        setShowStyleMenu(false);
      }
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown);
    };
  }, [isSelected]);

  // Handle Dragging
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

  // Handle Smooth Corner Resizing (Drag to resize icon)
  const handleMouseDownResize = (e: React.MouseEvent) => {
    if (!canWrite || isLocked) return;
    e.stopPropagation();
    onSelect?.();
    setIsResizing(true);

    const startX = e.clientX;
    const initialSize = currentSizeRef.current;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / (zoom || 1);
      const newSize = Math.max(20, Math.min(260, Math.round(initialSize + deltaX)));

      currentSizeRef.current = newSize;
      setLocalSize(newSize);

      const now = Date.now();
      if (now - lastEmitRef.current > 40) {
        lastEmitRef.current = now;
        onUpdate({
          ...element,
          size: newSize,
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
        size: currentSizeRef.current,
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

  const handleQuickRotate = () => {
    const newRot = ((element.rotation || 0) + 45) % 360;
    setRotation(newRot);
    onUpdate({
      ...element,
      rotation: newRot,
      updatedAt: Date.now(),
    });
  };

  const handleToggleFlipH = () => {
    onUpdate({
      ...element,
      flipH: !element.flipH,
      updatedAt: Date.now(),
    });
  };

  const handleToggleFlipV = () => {
    onUpdate({
      ...element,
      flipV: !element.flipV,
      updatedAt: Date.now(),
    });
  };

  const handleCycleBgShape = () => {
    const current = element.bgShape || 'none';
    const next = current === 'none' ? 'circle' : current === 'circle' ? 'rounded' : 'none';
    onUpdate({
      ...element,
      bgShape: next,
      updatedAt: Date.now(),
    });
  };

  const handleSizeChange = (newSize: number) => {
    setLocalSize(newSize);
    currentSizeRef.current = newSize;
    onUpdate({
      ...element,
      size: newSize,
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

  const handleIconChange = (iconKey: string) => {
    setShowIconPicker(false);
    onUpdate({
      ...element,
      iconName: iconKey,
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
        id: `icon_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        x: element.x + 24,
        y: element.y + 24,
        updatedAt: Date.now(),
      });
    }
  };

  const size = localSize;
  const color = element.color || '#3b82f6';
  const iconConfig = AVAILABLE_ICONS[element.iconName] || AVAILABLE_ICONS.star;
  const IconComponent = iconConfig.component;
  const opacity = element.opacity ?? 1.0;
  const flipH = Boolean(element.flipH);
  const flipV = Boolean(element.flipV);
  const bgShape = element.bgShape || 'none';

  const showControls = canWrite && isSelected && !isMultiSelection;

  // Calculate box dimensions (size + padding)
  const pad = 16;
  const boxDim = size + pad;

  return (
    <div
      ref={elementRef}
      id={`icon-${element.id}`}
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px) rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        width: `${boxDim}px`,
        height: `${boxDim}px`,
      }}
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
      className={`absolute top-0 left-0 select-none z-20 group flex items-center justify-center pointer-events-auto ${
        isDragging ? 'cursor-grabbing' : ''
      } ${
        isSelected
          ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 rounded-2xl'
          : ''
      }`}
    >
      {/* Rotation Pin Handle (Hidden in multi-selection to prevent clutter) */}
      {canWrite && !isLocked && isSelected && !isMultiSelection && (
        <div
          className="absolute -top-7 left-1/2 -translate-x-1/2 flex flex-col items-center cursor-grab active:cursor-grabbing z-40"
          onMouseDown={handleMouseDownRotate}
          title="Drag to rotate icon"
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
              title="Drag to move icon"
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-grab active:cursor-grabbing"
            >
              <Move className="w-3.5 h-3.5" />
            </div>
          )}

          {/* Quick Swap Icon Popover */}
          {!isLocked && (
            <div className="relative">
              <button
                onClick={() => setShowIconPicker(!showIconPicker)}
                title="Change icon symbol"
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>

              {showIconPicker && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute left-1/2 -translate-x-1/2 top-8 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 grid grid-cols-4 gap-1.5 z-50 max-h-56 overflow-y-auto min-w-[160px]"
                >
                  {Object.entries(AVAILABLE_ICONS).map(([key, item]) => {
                    const Component = item.component;
                    return (
                      <button
                        key={key}
                        onClick={() => handleIconChange(key)}
                        title={item.label}
                        className={`p-1.5 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
                          element.iconName === key
                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-600'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Component size={18} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Preset Size Buttons */}
          {!isLocked && (
            <div className="flex items-center gap-0.5 border-l border-r border-slate-200 dark:border-slate-700 px-1">
              {SIZES.map((s) => (
                <button
                  key={s.val}
                  onClick={() => handleSizeChange(s.val)}
                  title={`Size ${s.val}px`}
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                    size === s.val
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
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

          {/* Flip Horizontal */}
          {!isLocked && (
            <button
              onClick={handleToggleFlipH}
              title="Flip Horizontal"
              className={`p-1 rounded-lg cursor-pointer transition-colors ${
                flipH
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-600'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Flip Vertical */}
          {!isLocked && (
            <button
              onClick={handleToggleFlipV}
              title="Flip Vertical"
              className={`p-1 rounded-lg cursor-pointer transition-colors ${
                flipV
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-600'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FlipVertical className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Swap Icon Picker */}
          {!isLocked && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowIconPicker(!showIconPicker);
                  setShowColorPicker(false);
                  setShowStyleMenu(false);
                }}
                title="Change icon"
                className={`p-1 rounded-lg cursor-pointer transition-colors ${
                  showIconPicker
                    ? 'bg-blue-100 dark:bg-blue-950 text-blue-600'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
              </button>

              {showIconPicker && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute left-1/2 -translate-x-1/2 bottom-8 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2.5 flex flex-col gap-2 z-50 w-72"
                >
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={iconSearchQuery}
                      onChange={(e) => setIconSearchQuery(e.target.value)}
                      placeholder="Search icons..."
                      className="w-full pl-7 pr-6 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                    {iconSearchQuery && (
                      <button
                        onClick={() => setIconSearchQuery('')}
                        className="absolute right-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  {filteredIcons.length > 0 ? (
                    <div className="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto p-0.5">
                      {filteredIcons.map(([key, config]) => {
                        const Comp = config.component;
                        const isCurrent = element.iconName === key;
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              onUpdate({ ...element, iconName: key });
                              setShowIconPicker(false);
                              setIconSearchQuery('');
                            }}
                            className={`p-1.5 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                              isCurrent
                                ? 'bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-600 dark:text-blue-400 font-bold'
                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                            }`}
                            title={`${config.label} (${config.keywords?.slice(0, 3).join(', ')})`}
                          >
                            <Comp size={16} />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-3 text-center text-[11px] text-slate-400">
                      No matching icons
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Background Badge Toggle (None / Circle / Rounded) */}
          {!isLocked && (
            <button
              onClick={handleCycleBgShape}
              title={`Badge style: ${bgShape}. Click to cycle`}
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer border transition-colors ${
                bgShape !== 'none'
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
            >
              {bgShape === 'circle' ? 'Circle' : bgShape === 'rounded' ? 'Box' : 'Badge'}
            </button>
          )}

          {/* Opacity Menu */}
          {!isLocked && (
            <div className="relative">
              <button
                onClick={() => setShowStyleMenu(!showStyleMenu)}
                title="Opacity options"
                className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>

              {showStyleMenu && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute left-1/2 -translate-x-1/2 top-8 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2.5 flex flex-col gap-1.5 z-50 min-w-[130px]"
                >
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                    Opacity
                  </div>
                  <div className="flex gap-1">
                    {OPACITIES.map((op) => (
                      <button
                        key={op.val}
                        onClick={() => {
                          handleOpacityChange(op.val);
                          setShowStyleMenu(false);
                        }}
                        className={`flex-1 py-1 text-[10px] font-medium rounded-lg border transition-colors cursor-pointer ${
                          opacity === op.val
                            ? 'bg-blue-500 text-white border-blue-500 font-bold'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Color Picker Toggle */}
          {!isLocked && (
            <div className="relative">
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="Change icon color"
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
              title="Duplicate icon"
              className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Lock / Unlock Toggle */}
          <button
            onClick={handleToggleLock}
            title={isLocked ? 'Unlock icon' : 'Lock icon in place'}
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
            title="Delete icon"
            className="p-1 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Rendered Icon with Background Badge and Flip Transformation */}
      <div
        onMouseDown={handleMouseDownDrag}
        style={{
          transform: `scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`,
          opacity,
          backgroundColor:
            bgShape !== 'none' ? (element.bgColor || `${color}18`) : undefined,
          borderRadius: bgShape === 'circle' ? '9999px' : bgShape === 'rounded' ? '16px' : undefined,
          border: bgShape !== 'none' ? `1.5px solid ${color}40` : undefined,
        }}
        className={`cursor-move p-2 transition-transform flex items-center justify-center ${
          bgShape === 'none' ? 'hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-2xl' : ''
        }`}
      >
        <IconComponent size={size} color={color} />
      </div>

      {/* Corner Resize Handle for Free Drag-Resizing */}
      {canWrite && !isLocked && isSelected && !isMultiSelection && (
        <div
          onMouseDown={handleMouseDownResize}
          title="Drag to resize icon"
          className="absolute -bottom-1 -right-1 w-4 h-4 bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-full shadow-md flex items-center justify-center cursor-nwse-resize z-30 hover:scale-125 transition-transform"
        >
          <Maximize2 className="w-2 h-2 text-blue-500 rotate-90" />
        </div>
      )}
    </div>
  );
};
