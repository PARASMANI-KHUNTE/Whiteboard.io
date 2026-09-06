import React, { useState, useRef, useEffect } from 'react';
import { ShapeElement } from '../types';
import { Trash2, Move, Palette, Maximize2 } from 'lucide-react';

interface ShapeItemProps {
  element: ShapeElement;
  currentUserId: string;
  canWrite?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onUpdate: (updated: ShapeElement) => void;
  onDelete: (id: string) => void;
}

const PALETTE_COLORS = ['#0f172a', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export const ShapeItem: React.FC<ShapeItemProps> = ({
  element,
  canWrite = true,
  isSelected = false,
  onSelect,
  onUpdate,
  onDelete,
}) => {
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: element.x, y: element.y });
  const [localSize, setLocalSize] = useState<{ width: number; height: number }>({
    width: element.width || 160,
    height: element.height || 120,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const currentPosRef = useRef(localPos);
  const currentSizeRef = useRef(localSize);
  const lastEmitRef = useRef<number>(0);

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

  // Handle Dragging / Repositioning
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

  // Handle Corner Resizing
  const handleMouseDownResize = (e: React.MouseEvent) => {
    if (!canWrite) return;
    e.stopPropagation();
    onSelect?.();
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialSize = { ...currentSizeRef.current };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const newWidth = Math.max(50, initialSize.width + deltaX);
      const newHeight = Math.max(50, initialSize.height + deltaY);

      currentSizeRef.current = { width: newWidth, height: newHeight };
      setLocalSize({ width: newWidth, height: newHeight });

      const now = Date.now();
      if (now - lastEmitRef.current > 40) {
        lastEmitRef.current = now;
        onUpdate({
          ...element,
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
        width: currentSizeRef.current.width,
        height: currentSizeRef.current.height,
        updatedAt: Date.now(),
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleColorChange = (newColor: string) => {
    setShowColorPicker(false);
    onUpdate({
      ...element,
      color: newColor,
      updatedAt: Date.now(),
    });
  };

  const handleFillToggle = () => {
    const hasFill = Boolean(element.fillColor && element.fillColor !== 'transparent');
    onUpdate({
      ...element,
      fillColor: hasFill ? 'transparent' : `${element.color}20`,
      updatedAt: Date.now(),
    });
  };

  const { width, height } = localSize;
  const strokeWidth = element.strokeWidth || 3;
  const strokeColor = element.color || '#0f172a';
  const fillColor = element.fillColor || `${strokeColor}15`;

  // Render specific shape SVG
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
            fill={fillColor}
          />
        );

      case 'diamond':
        return (
          <polygon
            points={`${width / 2},${pad} ${width - pad},${height / 2} ${width / 2},${height - pad} ${pad},${height / 2}`}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
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
        let step = Math.PI / spikes;
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
            strokeLinejoin="round"
            fill={fillColor}
          />
        );
      }

      default:
        return null;
    }
  };

  const isFilled = Boolean(element.fillColor && element.fillColor !== 'transparent');
  const showControls = canWrite && (isSelected || isHovered || isDragging || isResizing || showColorPicker);

  return (
    <div
      id={`shape-${element.id}`}
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px)`,
        width: `${width}px`,
        height: `${height}px`,
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
      className={`absolute top-0 left-0 select-none z-20 group ${
        isDragging ? 'cursor-grabbing opacity-90' : ''
      } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 rounded-xl' : ''}`}
    >
      {/* Floating Action Menu on Selection / Hover */}
      {showControls && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute -top-11 left-0 bg-white/95 backdrop-blur-xs border border-slate-200 shadow-xl rounded-xl px-2 py-1 flex items-center gap-1.5 z-40 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Hover Bridge */}
          <div className="absolute top-full left-0 right-0 h-3" />

          {/* Move Drag Handle */}
          <div
            onMouseDown={handleMouseDownDrag}
            title="Drag to move shape"
            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-grab active:cursor-grabbing"
          >
            <Move className="w-3.5 h-3.5" />
          </div>

          {/* Fill Toggle */}
          <button
            onClick={handleFillToggle}
            title={isFilled ? 'Remove fill' : 'Add semi-transparent fill'}
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded cursor-pointer border ${
              isFilled ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            {isFilled ? 'Fill: On' : 'Fill: Off'}
          </button>

          {/* Color Picker Toggle */}
          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Change color"
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
            title="Delete shape"
            className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SVG Canvas for Shape */}
      <svg
        width={width}
        height={height}
        className="w-full h-full overflow-visible pointer-events-auto cursor-move"
        onMouseDown={handleMouseDownDrag}
      >
        {renderShapeSvg()}
      </svg>

      {/* Corner Resize Handle */}
      {canWrite && (
        <div
          onMouseDown={handleMouseDownResize}
          title="Drag to resize shape"
          className={`absolute -bottom-2 -right-2 w-5 h-5 bg-white border-2 border-blue-500 rounded-full shadow-md flex items-center justify-center cursor-nwse-resize z-30 hover:scale-110 transition-all ${
            isSelected || isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Maximize2 className="w-2.5 h-2.5 text-blue-600 rotate-90" />
        </div>
      )}
    </div>
  );
};
