import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { usePopoverDismiss } from '../hooks/usePopoverDismiss';
import { IconElement } from '../types';
import {
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Smile,
  Sliders,
} from 'lucide-react';
import { AVAILABLE_ICONS } from '../constants/icons';
import { CORE_PALETTE } from '../constants/palettes';
import { ItemPalettePopover } from './ui/ItemPalettePopover';
import { ITEM_OPACITIES, ItemRotationHandle, ItemToolbar } from './ui/ItemToolbar';
import { SearchablePickerPopover } from './ui/SearchablePickerPopover';
import { shouldBailOutItemMouseDown } from '../utils/canvasPan';
import { hasMultiSelectModifier } from '../utils/selection';

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
  onDuplicate?: (element: IconElement, offset?: { dx: number; dy: number }) => IconElement | void;
  onMoveSelectionStart?: () => void;
  onMoveSelection?: (deltaX: number, deltaY: number) => void;
  onMoveSelectionEnd?: () => void;
  onResolveSnap?: (element: IconElement, x: number, y: number, skipSnap: boolean) => { x: number; y: number };
  onSnapEnd?: () => void;
}

const SIZES = [
  { label: 'S', val: 32 },
  { label: 'M', val: 48 },
  { label: 'L', val: 64 },
  { label: 'XL', val: 96 },
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
  onMoveSelectionStart,
  onMoveSelection,
  onMoveSelectionEnd,
  onResolveSnap,
  onSnapEnd,
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

  const closeMenus = useCallback(() => {
    setShowColorPicker(false);
    setShowIconPicker(false);
    setShowStyleMenu(false);
  }, []);
  usePopoverDismiss(
    elementRef,
    showColorPicker || showIconPicker || showStyleMenu,
    closeMenus
  );

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
    if (shouldBailOutItemMouseDown(e)) return;
    if (!canWrite || isLocked) return;
    e.stopPropagation();
    onSelect?.();

    const moveWholeSelection = isSelected && isMultiSelection && !e.altKey && Boolean(onMoveSelection);
    if (moveWholeSelection) onMoveSelectionStart?.();
    let lastDelta = { x: 0, y: 0 };

    // Alt-drag duplicates in place and moves the copy.
    let dragElement = element;
    if (e.altKey && onDuplicate) {
      const duplicated = onDuplicate(element, { dx: 0, dy: 0 });
      if (duplicated) dragElement = duplicated;
    }

    setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialPos = { ...currentPosRef.current };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - startX) / (zoom || 1);
      const deltaY = (moveEvent.clientY - startY) / (zoom || 1);
      const rawX = initialPos.x + deltaX;
      const rawY = initialPos.y + deltaY;
      const snapped =
        !moveWholeSelection && onResolveSnap
          ? onResolveSnap(dragElement, rawX, rawY, moveEvent.altKey)
          : { x: rawX, y: rawY };
      const newX = snapped.x;
      const newY = snapped.y;

      currentPosRef.current = { x: newX, y: newY };
      setLocalPos({ x: newX, y: newY });

      const now = Date.now();
      if (now - lastEmitRef.current > 40) {
        lastEmitRef.current = now;
        if (moveWholeSelection) {
          lastDelta = { x: deltaX, y: deltaY };
          onMoveSelection?.(deltaX, deltaY);
        } else {
          onUpdate({
            ...dragElement,
            x: newX,
            y: newY,
            updatedAt: now,
          });
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      onSnapEnd?.();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (moveWholeSelection) {
        onMoveSelection?.(lastDelta.x, lastDelta.y);
        onMoveSelectionEnd?.();
        return;
      }
      onUpdate({
        ...dragElement,
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
    if (shouldBailOutItemMouseDown(e)) return;
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
    if (shouldBailOutItemMouseDown(e)) return;
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
    setIconSearchQuery('');
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
      data-canvas-item
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px) rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        width: `${boxDim}px`,
        height: `${boxDim}px`,
      }}
      onMouseDown={(e) => {
        if (shouldBailOutItemMouseDown(e)) return;
        e.stopPropagation();
        onSelect?.(hasMultiSelectModifier(e));
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onSelect?.(hasMultiSelectModifier(e));
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
        <ItemRotationHandle
          onMouseDown={handleMouseDownRotate}
          title="Drag to rotate icon"
        />
      )}

      {/* Floating Action Menu on Selection / Hover */}
      {showControls && (
        <ItemToolbar
          isLocked={isLocked}
          rotation={rotation}
          onMoveStart={handleMouseDownDrag}
          moveTitle="Drag to move icon"
          afterMove={
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
          }
          onQuickRotate={handleQuickRotate}
          rotateAriaLabel="Rotate icon 45 degrees"
          onDuplicate={handleDuplicate}
          duplicateTitle="Duplicate icon"
          onToggleLock={handleToggleLock}
          lockTitle="Lock icon in place"
          unlockTitle="Unlock icon"
          onDelete={() => onDelete(element.id)}
          deleteTitle="Delete icon"
        >
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
                type="button"
                data-popover-trigger
                aria-label="Change icon"
                aria-expanded={showIconPicker}
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
                <SearchablePickerPopover
                  title={`Swap Icon (${filteredIcons.length})`}
                  onClose={() => {
                    setShowIconPicker(false);
                    setIconSearchQuery('');
                  }}
                  closeAriaLabel="Close icon picker"
                  searchQuery={iconSearchQuery}
                  onSearchChange={setIconSearchQuery}
                  searchPlaceholder="Search icons..."
                  clearAriaLabel="Clear icon search"
                  isEmpty={filteredIcons.length === 0}
                  emptyMessage="No matching icons"
                  widthClassName="w-72"
                  gridClassName="grid-cols-6 gap-1 max-h-40 p-0.5"
                  className="absolute left-1/2 -translate-x-1/2 bottom-8"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {filteredIcons.map(([key, config]) => {
                    const Comp = config.component;
                    const isCurrent = element.iconName === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleIconChange(key)}
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
                </SearchablePickerPopover>
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
                type="button"
                data-popover-trigger
                aria-label="Opacity options"
                aria-expanded={showStyleMenu}
                onClick={() => setShowStyleMenu(!showStyleMenu)}
                title="Opacity options"
                className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
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
                    {ITEM_OPACITIES.map((op) => (
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
            <ItemPalettePopover
              isOpen={showColorPicker}
              onToggle={() => setShowColorPicker(!showColorPicker)}
              colors={CORE_PALETTE}
              selectedColor={element.color}
              onSelectColor={handleColorChange}
              ariaLabel="Change icon color"
              title="Change icon color"
            />
          )}
        </ItemToolbar>
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
