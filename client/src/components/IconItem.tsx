import React, { useState, useRef, useEffect } from 'react';
import { IconElement } from '../types';
import { Trash2, Move, Palette } from 'lucide-react';
import { AVAILABLE_ICONS } from '../constants/icons';

interface IconItemProps {
  element: IconElement;
  currentUserId: string;
  canWrite?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onUpdate: (updated: IconElement) => void;
  onDelete: (id: string) => void;
}

const PALETTE_COLORS = ['#0f172a', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const SIZES = [32, 48, 64, 88];

export const IconItem: React.FC<IconItemProps> = ({
  element,
  canWrite = true,
  isSelected = false,
  onSelect,
  onUpdate,
  onDelete,
}) => {
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: element.x, y: element.y });
  const [isDragging, setIsDragging] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const currentPosRef = useRef(localPos);
  const lastEmitRef = useRef<number>(0);

  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: element.x, y: element.y });
      currentPosRef.current = { x: element.x, y: element.y };
    }
  }, [element.x, element.y, isDragging]);

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (!canWrite) return;
    e.stopPropagation();
    onSelect?.();
    setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialPos = { ...currentPosRef.current };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
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

  const handleSizeChange = (newSize: number) => {
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

  const size = element.size || 48;
  const color = element.color || '#3b82f6';
  const iconConfig = AVAILABLE_ICONS[element.iconName] || AVAILABLE_ICONS.star;
  const IconComponent = iconConfig.component;
  const showControls = canWrite && (isSelected || isHovered || isDragging || showColorPicker);

  return (
    <div
      id={`icon-${element.id}`}
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px)`,
        width: `${size + 16}px`,
        height: `${size + 16}px`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      className={`absolute top-0 left-0 select-none z-20 group flex items-center justify-center rounded-2xl transition-all ${
        isDragging ? 'cursor-grabbing opacity-90' : ''
      } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 bg-blue-50/20' : ''}`}
    >
      {/* Floating Action Menu on Selection / Hover */}
      {showControls && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -top-11 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xs border border-slate-200 shadow-xl rounded-xl px-2 py-1 flex items-center gap-1.5 z-40 animate-in fade-in zoom-in-95 duration-100 whitespace-nowrap"
        >
          {/* Hover Bridge */}
          <div className="absolute top-full left-0 right-0 h-3" />

          {/* Move Drag Handle */}
          <div
            onMouseDown={handleMouseDownDrag}
            title="Drag to move icon"
            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-grab active:cursor-grabbing"
          >
            <Move className="w-3.5 h-3.5" />
          </div>

          {/* Size presets */}
          <div className="flex items-center gap-0.5 border-l border-r border-slate-200 px-1">
            {SIZES.map((s, idx) => (
              <button
                key={s}
                onClick={() => handleSizeChange(s)}
                title={`Size ${s}px`}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer ${
                  size === s ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {idx === 0 ? 'S' : idx === 1 ? 'M' : idx === 2 ? 'L' : 'XL'}
              </button>
            ))}
          </div>

          {/* Color Picker Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Change icon color"
              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>

            {showColorPicker && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute left-0 top-7 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 flex gap-1 z-50"
              >
                {PALETTE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColorChange(c)}
                    style={{ backgroundColor: c }}
                    className={`w-5 h-5 rounded-full border border-slate-200 hover:scale-110 transition-transform cursor-pointer ${
                      element.color === c ? 'ring-2 ring-slate-800' : ''
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Delete Button */}
          <button
            onClick={() => onDelete(element.id)}
            title="Delete icon"
            className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Rendered Icon */}
      <div
        onMouseDown={handleMouseDownDrag}
        className="cursor-move p-2 rounded-2xl hover:bg-slate-100/50 transition-colors flex items-center justify-center"
      >
        <IconComponent size={size} color={color} />
      </div>
    </div>
  );
};
