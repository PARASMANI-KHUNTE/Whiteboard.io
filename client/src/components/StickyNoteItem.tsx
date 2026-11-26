import React, { useState, useRef, useEffect, useCallback } from 'react';
import { StickyNote } from '../types';
import { Trash2, Move, Palette, Lock } from 'lucide-react';
import { shouldBailOutItemMouseDown } from '../utils/canvasPan';
import { hasMultiSelectModifier } from '../utils/selection';
import { computeRotatedResize, getRotatedResizeCursor } from '../utils/shapeResize';
import { usePopoverDismiss } from '../hooks/usePopoverDismiss';
import { STICKY_PALETTE } from '../constants/palettes';
import { ColorSwatches } from './ui/ColorSwatches';

const MIN_STICKY_WIDTH = 160;
const MIN_STICKY_HEIGHT = 120;

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
  onResolveSnap?: (element: StickyNote, x: number, y: number, skipSnap: boolean) => { x: number; y: number };
  onSnapEnd?: () => void;
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
  onResolveSnap,
  onSnapEnd,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(note.text);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: note.x, y: note.y });
  const [localSize, setLocalSize] = useState<{ width: number; height: number }>({
    width: note.width || 224,
    height: note.height || 150,
  });
  const currentPosRef = useRef<{ x: number; y: number }>({ x: note.x, y: note.y });
  const currentSizeRef = useRef<{ width: number; height: number }>({
    width: note.width || 224,
    height: note.height || 150,
  });
  const lastEmitRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const closeColorPicker = useCallback(() => setShowColorPicker(false), []);
  usePopoverDismiss(elementRef, showColorPicker, closeColorPicker);
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

  // Keep localPos in sync with incoming note updates when not actively dragging or resizing
  useEffect(() => {
    if (!isDragging && !isResizing) {
      setLocalPos({ x: note.x, y: note.y });
      currentPosRef.current = { x: note.x, y: note.y };
    }
  }, [note.x, note.y, isDragging, isResizing]);

  // Keep localSize in sync with incoming note updates when not actively resizing
  useEffect(() => {
    if (!isResizing) {
      const w = Math.max(MIN_STICKY_WIDTH, note.width || 224);
      const h = Math.max(MIN_STICKY_HEIGHT, note.height || 150);
      setLocalSize({ width: w, height: h });
      currentSizeRef.current = { width: w, height: h };
    }
  }, [note.width, note.height, isResizing]);

  const handleMouseDownResize = (
    e: React.MouseEvent,
    corner: 'nw' | 'ne' | 'sw' | 'se'
  ) => {
    if (shouldBailOutItemMouseDown(e)) return;
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
      const resized = computeRotatedResize({
        corner,
        initialPos,
        initialSize,
        rotationDeg: 0,
        deltaX,
        deltaY,
        minWidth: MIN_STICKY_WIDTH,
        minHeight: MIN_STICKY_HEIGHT,
      });

      const newWidth = Math.round(resized.width);
      const newHeight = Math.round(resized.height);
      const newX = Math.round(resized.x);
      const newY = Math.round(resized.y);

      currentPosRef.current = { x: newX, y: newY };
      currentSizeRef.current = { width: newWidth, height: newHeight };
      setLocalPos({ x: newX, y: newY });
      setLocalSize({ width: newWidth, height: newHeight });

      const now = Date.now();
      if (now - lastEmitRef.current > 40) {
        lastEmitRef.current = now;
        onUpdate({
          ...note,
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
        ...note,
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
      const rawX = dragStartRef.current.startX + deltaX;
      const rawY = dragStartRef.current.startY + deltaY;
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
      ref={elementRef}
      id={`sticky-note-${note.id}`}
      data-canvas-item
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px)`,
        width: `${localSize.width}px`,
        height: `${localSize.height}px`,
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
      className={`absolute top-0 left-0 rounded-xl border border-slate-200/90 border-t-4 shadow-md flex flex-col transition-shadow z-20 pointer-events-auto ${
        isDragging || isResizing
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
                type="button"
                aria-label="Change sticky note color"
                aria-haspopup="true"
                aria-expanded={showColorPicker}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker((prev) => !prev);
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
              type="button"
              aria-label="Delete sticky note"
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
        className={`p-3 flex-1 min-h-0 flex flex-col ${isLocked ? 'cursor-default' : 'cursor-text'}`}
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
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              (e.currentTarget as HTMLTextAreaElement).blur();
            }
          }}
          placeholder={canWrite && !isLocked ? "Type your note here..." : "Locked — unlock to edit"}
          className={`w-full h-full flex-1 min-h-[75px] bg-transparent resize-none outline-none font-sans text-sm leading-relaxed select-text cursor-text ${
            !canWrite || isLocked ? 'cursor-default' : 'placeholder:text-black/35 placeholder:italic'
          }`}
        />
      </div>

      {/* Corner Resize Handles (shown when selected, unlocked, writable) */}
      {isSelected && !isMultiSelection && canWrite && !isLocked && (
        <>
          {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
            const posClass =
              corner === 'nw'
                ? '-top-1.5 -left-1.5'
                : corner === 'ne'
                ? '-top-1.5 -right-1.5'
                : corner === 'sw'
                ? '-bottom-1.5 -left-1.5'
                : '-bottom-1.5 -right-1.5';
            return (
              <div
                key={corner}
                role="presentation"
                data-sticky-resize={corner}
                title="Drag to resize note"
                onMouseDown={(e) => handleMouseDownResize(e, corner)}
                style={{ cursor: getRotatedResizeCursor(corner, 0) }}
                className={`absolute ${posClass} w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-500 shadow-sm hover:scale-125 transition-transform z-30`}
              />
            );
          })}
        </>
      )}
    </div>
  );
};
