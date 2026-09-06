import React, { useState, useRef, useEffect } from 'react';
import { StickyNote } from '../types';
import { Trash2, Move, Palette } from 'lucide-react';

interface StickyNoteItemProps {
  note: StickyNote;
  currentUserId: string;
  canWrite?: boolean;
  onUpdate: (updated: StickyNote) => void;
  onDelete: (id: string) => void;
}

const STICKY_COLORS = [
  { name: 'Yellow', bg: '#fef9c3', topBorder: '#fde047', text: '#334155' },
  { name: 'Blue', bg: '#eff6ff', topBorder: '#bfdbfe', text: '#334155' },
  { name: 'Green', bg: '#ecfdf5', topBorder: '#a7f3d0', text: '#334155' },
  { name: 'Pink', bg: '#fff1f2', topBorder: '#fecdd3', text: '#334155' },
];

export const StickyNoteItem: React.FC<StickyNoteItemProps> = ({
  note,
  currentUserId,
  canWrite = true,
  onUpdate,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(note.text);
  const [isDragging, setIsDragging] = useState(false);
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: note.x, y: note.y });
  const currentPosRef = useRef<{ x: number; y: number }>({ x: note.x, y: note.y });
  const lastEmitRef = useRef<number>(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: note.x,
    startY: note.y,
  });

  // Auto-focus empty note when created so user can immediately type into it
  useEffect(() => {
    if (canWrite && note.text === '' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Keep localText in sync with incoming note updates when not actively editing
  useEffect(() => {
    if (!isEditing) {
      setLocalText(note.text);
    }
  }, [note.text, isEditing]);

  // Keep localPos in sync with incoming note updates when not actively dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalPos({ x: note.x, y: note.y });
      currentPosRef.current = { x: note.x, y: note.y };
    }
  }, [note.x, note.y, isDragging]);

  // Clean up debounce timer on unmount
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
          ...note,
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
      // Emit final destination
      onUpdate({
        ...note,
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

    // Debounced real-time persistence
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onUpdate({
        ...note,
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
    if (localText !== note.text) {
      onUpdate({
        ...note,
        text: localText,
        updatedAt: Date.now(),
      });
    }
  };

  const handleColorSelect = (color: string) => {
    setShowColorPicker(false);
    onUpdate({
      ...note,
      color,
      updatedAt: Date.now(),
    });
  };

  const currentColorConfig = STICKY_COLORS.find((c) => c.bg === note.color) || STICKY_COLORS[0];

  return (
    <div
      id={`sticky-note-${note.id}`}
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px)`,
        backgroundColor: note.color || currentColorConfig.bg,
        borderTopColor: currentColorConfig.topBorder,
        color: currentColorConfig.text,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`absolute top-0 left-0 w-56 rounded-xl border border-slate-200/90 border-t-4 shadow-md flex flex-col transition-shadow z-20 ${
        isDragging ? 'shadow-2xl cursor-grabbing ring-2 ring-slate-400 opacity-95' : 'hover:shadow-lg'
      }`}
    >
      {/* Note Header / Drag Handle */}
      <div
        onMouseDown={handleMouseDownHeader}
        className="flex items-center justify-between px-3 py-1.5 cursor-grab border-b border-black/5 rounded-t-xl bg-black/[0.02] select-none"
      >
        <div className="flex items-center gap-1.5 opacity-60 text-xs font-medium truncate">
          <Move className="w-3 h-3 shrink-0" />
          <span className="truncate">{note.userName || 'Note'}</span>
        </div>

        {canWrite && (
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                }}
                className="p-1 hover:bg-black/10 rounded transition-colors text-black/60 cursor-pointer"
                title="Change note color"
              >
                <Palette className="w-3 h-3" />
              </button>

              {showColorPicker && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-6 bg-white rounded-lg shadow-lg border border-slate-200 p-1 flex gap-1 z-30"
                >
                  {STICKY_COLORS.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => handleColorSelect(c.bg)}
                      style={{ backgroundColor: c.bg }}
                      className="w-5 h-5 rounded-full border border-slate-300 hover:scale-110 transition-transform cursor-pointer"
                      title={c.name}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              className="p-1 hover:bg-red-500/20 hover:text-red-700 rounded transition-colors text-black/60 cursor-pointer"
              title="Delete note"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Note Content Area */}
      <div
        className="p-3 flex-1 min-h-[110px] flex flex-col cursor-text"
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
          placeholder={canWrite ? "Type your note here..." : "Read-only note"}
          rows={4}
          className={`w-full h-full min-h-[95px] bg-transparent resize-none outline-none font-sans text-sm leading-relaxed select-text cursor-text ${
            !canWrite ? 'cursor-default' : 'placeholder:text-black/35 placeholder:italic'
          }`}
        />
      </div>
    </div>
  );
};
