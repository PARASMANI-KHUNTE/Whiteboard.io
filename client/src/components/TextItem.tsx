import React, { useState, useRef, useEffect } from 'react';
import { TextElement } from '../types';
import { Trash2, Move } from 'lucide-react';

interface TextItemProps {
  element: TextElement;
  currentUserId: string;
  canWrite?: boolean;
  onUpdate: (updated: TextElement) => void;
  onDelete: (id: string) => void;
}

export const TextItem: React.FC<TextItemProps> = ({
  element,
  canWrite = true,
  onUpdate,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(element.text);
  const [isDragging, setIsDragging] = useState(false);
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: element.x, y: element.y });
  const currentPosRef = useRef<{ x: number; y: number }>({ x: element.x, y: element.y });
  const lastEmitRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: element.x,
    startY: element.y,
  });

  // Auto-focus empty text item when created
  useEffect(() => {
    if (canWrite && element.text === '' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!isEditing) {
      setLocalText(element.text);
    }
  }, [element.text, isEditing]);

  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: element.x, y: element.y });
      currentPosRef.current = { x: element.x, y: element.y };
    }
  }, [element.x, element.y, isDragging]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleMouseDownHeader = (e: React.MouseEvent) => {
    if (!canWrite) return;
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: localPos.x,
      startY: localPos.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - dragStartRef.current.mouseY;
      const newX = Math.max(0, dragStartRef.current.startX + deltaX);
      const newY = Math.max(0, dragStartRef.current.startY + deltaY);

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

  const handleTextChange = (newText: string) => {
    if (!canWrite) return;
    setLocalText(newText);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onUpdate({
        ...element,
        text: newText,
        updatedAt: Date.now(),
      });
    }, 300);
  };

  const handleTextBlur = () => {
    setIsEditing(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
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
        transform: `translate(${localPos.x}px, ${localPos.y}px)`,
        color: element.color || '#1e293b',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`group absolute top-0 left-0 min-w-[140px] max-w-sm rounded-lg transition-shadow z-20 ${
        isDragging ? 'ring-2 ring-blue-400 bg-white/95 shadow-lg' : 'hover:bg-white/80 hover:shadow-sm'
      }`}
    >
      {/* Drag & Action Header (visible on hover or drag) */}
      <div
        onMouseDown={handleMouseDownHeader}
        className="flex items-center justify-between px-2 py-0.5 cursor-grab opacity-0 group-hover:opacity-100 bg-slate-100/90 border border-slate-200 rounded-t-lg transition-opacity text-[10px] text-slate-500 select-none"
      >
        <div className="flex items-center gap-1">
          <Move className="w-2.5 h-2.5" />
          <span>{element.userName || 'Text'}</span>
        </div>
        {canWrite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(element.id);
            }}
            className="p-0.5 hover:text-red-600 rounded cursor-pointer"
            title="Delete text"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Text Area Content */}
      <div
        className="p-1.5 cursor-text"
        onClick={() => textareaRef.current?.focus()}
      >
        <textarea
          ref={textareaRef}
          value={localText}
          readOnly={!canWrite}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => canWrite && setIsEditing(true)}
          onBlur={handleTextBlur}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={canWrite ? "Type here..." : "Read-only text"}
          rows={1}
          style={{ fontSize: `${element.fontSize || 18}px` }}
          className={`w-full bg-transparent resize-none outline-none font-sans font-medium leading-normal select-text cursor-text ${
            !canWrite ? 'cursor-default' : 'placeholder:text-slate-300'
          }`}
        />
      </div>
    </div>
  );
};
