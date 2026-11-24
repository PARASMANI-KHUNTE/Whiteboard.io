import React, { useState, useRef, useEffect } from 'react';
import { StickyNote } from '../types';
import { Trash2, Move, Palette, Lock } from 'lucide-react';
import { shouldBailOutItemMouseDown } from '../utils/canvasPan';
import { hasMultiSelectModifier } from '../utils/selection';
import { STICKY_PALETTE } from '../constants/palettes';
import { ColorSwatches } from './ui/ColorSwatches';

interface StickyNoteItemProps {
  note: StickyNote;
  currentUserId: string;
  canWrite?: boolean;
  zoom?: number;
  isSelected?: boolean;
  isMultiSelection?: boolean;
  autoFocus?: boolean;
  onSelect?: (isMulti?: boolean) => void;
  onUpdate: (updated: StickyNote) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (element: StickyNote, offset?: { dx: number; dy: number }) => StickyNote | void;
  onMoveSelectionStart?: () => void;
  onMoveSelection?: (deltaX: number, deltaY: number) => void;
  onMoveSelectionEnd?: () => void;
}

export const StickyNoteItem: React.FC<StickyNoteItemProps> = ({
  note,
  currentUserId: _currentUserId,
  canWrite = true,
  zoom = 1,
  isSelected = false,
  isMultiSelection = false,
  autoFocus = false,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveSelectionStart,
  onMoveSelection,
  onMoveSelectionEnd,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(note.text);
  const [isDragging, setIsDragging] = useState(false);
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: note.x, y: note.y });
  const currentPosRef = useRef<{ x: number; y: number }>({ x: note.x, y: note.y });
  const lastEmitRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: note.x,
    startY: note.y,
  });
  const isLocked = Boolean(note.isLocked);

  // Auto-focus empty note ONLY when explicitly requested (e.g. freshly created in this session)
  useEffect(() => {
    if (autoFocus && canWrite && !isLocked && note.text === '' && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus, canWrite, isLocked, note.text]);

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
    if (shouldBailOutItemMouseDown(e)) return;
    if (!canWrite || isLocked) return;
    e.stopPropagation();
    onSelect?.();

    const moveWholeSelection = isSelected && isMultiSelection && !e.altKey && Boolean(onMoveSelection);
    if (moveWholeSelection) onMoveSelectionStart?.();
    let lastDelta = { x: 0, y: 0 };

    // Alt-drag duplicates in place and moves the copy.
    let dragElement = note;
    if (e.altKey && onDuplicate) {
      const duplicated = onDuplicate(note, { dx: 0, dy: 0 });
      if (duplicated) dragElement = duplicated;
    }

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: localPos.x,
      startY: localPos.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = (moveEvent.clientX - dragStartRef.current.mouseX) / (zoom || 1);
      const deltaY = (moveEvent.clientY - dragStartRef.current.mouseY) / (zoom || 1);
      const newX = dragStartRef.current.startX + deltaX;
      const newY = dragStartRef.current.startY + deltaY;

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
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (moveWholeSelection) {
        onMoveSelection?.(lastDelta.x, lastDelta.y);
        onMoveSelectionEnd?.();
        return;
      }
      // Emit final destination
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

  const handleTextChange = (newText: string) => {
    if (!canWrite || isLocked) return;
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
    if (!isLocked && localText !== note.text) {
      onUpdate({
        ...note,
        text: localText,
        updatedAt: Date.now(),
      });
    }
  };

  const handleColorSelect = (color: string) => {
    if (isLocked) return;
    setShowColorPicker(false);
    onUpdate({
      ...note,
      color,
      updatedAt: Date.now(),
    });
  };

  const currentColorConfig = STICKY_PALETTE.find((c) => c.bg === note.color) || STICKY_PALETTE[0];

  return (
    <div
      id={`sticky-note-${note.id}`}
      data-canvas-item
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px)`,
        backgroundColor: note.color || currentColorConfig.bg,
        borderTopColor: currentColorConfig.topBorder,
        color: currentColorConfig.text,
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
      className={`absolute top-0 left-0 w-56 rounded-xl border border-slate-200/90 border-t-4 shadow-md flex flex-col transition-all z-20 pointer-events-auto ${
        isDragging
          ? 'shadow-2xl cursor-grabbing ring-2 ring-blue-500 opacity-95'
          : isSelected
          ? 'ring-2 ring-blue-500 shadow-xl'
          : 'hover:shadow-lg'
      }`}
    >
      {/* Note Header / Drag Handle */}
      <div
        onMouseDown={handleMouseDownHeader}
        className={`flex items-center justify-between px-3 py-1.5 border-b border-black/5 rounded-t-xl bg-black/[0.02] select-none ${
          isLocked ? 'cursor-default' : 'cursor-grab'
        }`}
      >
        <div className="flex items-center gap-1.5 opacity-60 text-xs font-medium truncate">
          {isLocked ? (
            <Lock className="w-3 h-3 shrink-0 text-amber-600" aria-label="Locked" />
          ) : (
            <Move className="w-3 h-3 shrink-0" />
          )}
          <span className="truncate">{note.userName || 'Note'}</span>
        </div>

        {canWrite && !isLocked && !isMultiSelection && (
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
                  className="absolute right-0 top-6 wb-card-glass rounded-xl shadow-xl border border-slate-200/80 dark:border-slate-700 p-1.5 z-30"
                >
                  <ColorSwatches
                    colors={STICKY_PALETTE.map((c) => ({ hex: c.bg, label: c.name }))}
                    selectedColor={note.color || currentColorConfig.bg}
                    onSelect={handleColorSelect}
                    size="xs"
                    ariaLabelSuffix=" note color"
                  />
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
        className={`p-3 flex-1 min-h-[110px] flex flex-col ${isLocked ? 'cursor-default' : 'cursor-text'}`}
        onClick={() => {
          if (!isLocked) textareaRef.current?.focus();
        }}
      >
        <textarea
          ref={textareaRef}
          value={localText}
          readOnly={!canWrite || isLocked}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => canWrite && !isLocked && setIsEditing(true)}
          onBlur={handleTextBlur}
          onMouseDown={(e) => {
            if (shouldBailOutItemMouseDown(e)) return;
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={canWrite && !isLocked ? "Type your note here..." : "Locked — unlock to edit"}
          rows={4}
          className={`w-full h-full min-h-[95px] bg-transparent resize-none outline-none font-sans text-sm leading-relaxed select-text cursor-text ${
            !canWrite || isLocked ? 'cursor-default' : 'placeholder:text-black/35 placeholder:italic'
          }`}
        />
      </div>
    </div>
  );
};
