import React, { useState, useRef, useEffect } from 'react';
import { TextElement } from '../types';
import { Trash2, Move, Type } from 'lucide-react';

interface TextItemProps {
  element: TextElement;
  currentUserId: string;
  onUpdate: (updated: TextElement) => void;
  onDelete: (id: string) => void;
}

export const TextItem: React.FC<TextItemProps> = ({
  element,
  currentUserId,
  onUpdate,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(element.text);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: element.x,
    startY: element.y,
  });

  useEffect(() => {
    if (!isEditing) {
      setLocalText(element.text);
    }
  }, [element.text, isEditing]);

  const handleMouseDownHeader = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: element.x,
      startY: element.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(0, dragStartRef.current.startX + deltaX);
      const newY = Math.max(0, dragStartRef.current.startY + deltaY);

      onUpdate({
        ...element,
        x: newX,
        y: newY,
        updatedAt: Date.now(),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTextBlur = () => {
    setIsEditing(false);
    if (localText !== element.text) {
      onUpdate({
        ...element,
        text: localText,
        updatedAt: Date.now(),
      });
    }
  };

  return (
    <div
      id={`text-element-${element.id}`}
      style={{
        transform: `translate(${element.x}px, ${element.y}px)`,
        color: element.color || '#1e293b',
      }}
      className={`group absolute top-0 left-0 min-w-[140px] max-w-sm rounded-lg transition-shadow select-none z-20 ${
        isDragging ? 'ring-2 ring-blue-400 bg-white/95 shadow-lg' : 'hover:bg-white/80 hover:shadow-sm'
      }`}
    >
      {/* Drag & Action Header (visible on hover or drag) */}
      <div
        onMouseDown={handleMouseDownHeader}
        className="flex items-center justify-between px-2 py-0.5 cursor-grab opacity-0 group-hover:opacity-100 bg-slate-100/90 border border-slate-200 rounded-t-lg transition-opacity text-[10px] text-slate-500"
      >
        <div className="flex items-center gap-1">
          <Move className="w-2.5 h-2.5" />
          <span>{element.userName || 'Text'}</span>
        </div>
        <button
          onClick={() => onDelete(element.id)}
          className="p-0.5 hover:text-red-600 rounded"
          title="Delete text"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Text Area Content */}
      <div className="p-1.5">
        <textarea
          value={localText}
          onChange={(e) => setLocalText(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={handleTextBlur}
          placeholder="Type here..."
          rows={1}
          style={{ fontSize: `${element.fontSize || 18}px` }}
          className="w-full bg-transparent resize-none outline-none font-sans font-medium placeholder:text-slate-300 leading-normal"
        />
      </div>
    </div>
  );
};
