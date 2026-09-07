import React, { useState, useRef, useEffect } from 'react';
import { TextElement } from '../types';
import {
  Trash2,
  Move,
  Copy,
  Palette,
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
} from 'lucide-react';

interface TextItemProps {
  element: TextElement;
  currentUserId: string;
  canWrite?: boolean;
  zoom?: number;
  isSelected?: boolean;
  isMultiSelection?: boolean;
  onSelect?: (isMulti?: boolean) => void;
  onUpdate: (updated: TextElement) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (element: TextElement) => void;
}

const FONT_FAMILIES = [
  { id: 'sans', label: 'Sans', font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { id: 'serif', label: 'Serif', font: 'Georgia, Cambria, "Times New Roman", Times, serif' },
  { id: 'mono', label: 'Mono', font: '"JetBrains Mono", "Fira Code", Consolas, Monaco, monospace' },
  { id: 'handwriting', label: 'Hand', font: '"Caveat", "Comic Sans MS", "Marker Felt", cursive' },
];

const FONT_SIZES = [
  { label: 'S', value: 14, text: '14' },
  { label: 'M', value: 18, text: '18' },
  { label: 'L', value: 24, text: '24' },
  { label: 'XL', value: 32, text: '32' },
  { label: '2XL', value: 48, text: '48' },
];

const PALETTE_COLORS = [
  { hex: '#0f172a', label: 'Charcoal' },
  { hex: '#ffffff', label: 'White' },
  { hex: '#ef4444', label: 'Coral' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#10b981', label: 'Green' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#8b5cf6', label: 'Purple' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#06b6d4', label: 'Cyan' },
];

export const TextItem: React.FC<TextItemProps> = ({
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
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState(element.text);
  const [isDragging, setIsDragging] = useState(false);
  const [localPos, setLocalPos] = useState<{ x: number; y: number }>({ x: element.x, y: element.y });

  // Floating controls popover states
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);

  const currentPosRef = useRef<{ x: number; y: number }>({ x: element.x, y: element.y });
  const lastEmitRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: element.x,
    startY: element.y,
  });

  const showControls = canWrite && (isEditing || (isSelected && !isMultiSelection));

  // Auto-focus empty text item when freshly created
  useEffect(() => {
    if (canWrite && element.text === '' && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, []);

  // Auto-resize textarea dimensions
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(28, textareaRef.current.scrollHeight)}px`;
    }
  }, [localText, element.fontSize, element.fontFamily]);

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

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Global click outside listener to close floating menus and exit editing
  useEffect(() => {
    if (!showControls) {
      setShowColorPicker(false);
      setShowFontMenu(false);
      setShowSizeMenu(false);
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (elementRef.current && !elementRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
        setShowFontMenu(false);
        setShowSizeMenu(false);
        setIsEditing(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showControls]);

  const handleMouseDownHeader = (e: React.MouseEvent) => {
    if (!canWrite) return;
    e.stopPropagation();
    onSelect?.();
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

  // Property updaters
  const updateStyleProp = (updates: Partial<TextElement>) => {
    onUpdate({
      ...element,
      ...updates,
      updatedAt: Date.now(),
    });
  };

  const handleToggleBold = () => {
    const next = element.fontWeight === 'bold' ? 'normal' : 'bold';
    updateStyleProp({ fontWeight: next });
  };

  const handleToggleItalic = () => {
    const next = element.fontStyle === 'italic' ? 'normal' : 'italic';
    updateStyleProp({ fontStyle: next });
  };

  const handleToggleUnderline = () => {
    const next = element.textDecoration === 'underline' ? 'none' : 'underline';
    updateStyleProp({ textDecoration: next });
  };

  const handleCycleAlign = () => {
    const alignments: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
    const currentIdx = alignments.indexOf(element.textAlign || 'left');
    const nextAlign = alignments[(currentIdx + 1) % alignments.length];
    updateStyleProp({ textAlign: nextAlign });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      textareaRef.current?.blur();
      setIsEditing(false);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleToggleBold();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        handleToggleItalic();
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        handleToggleUnderline();
      }
    }
  };

  const currentFontFamily = FONT_FAMILIES.find((f) => f.font === element.fontFamily) || FONT_FAMILIES[0];
  const currentFontSize = element.fontSize || 18;
  const isBold = element.fontWeight === 'bold';
  const isItalic = element.fontStyle === 'italic';
  const isUnderline = element.textDecoration === 'underline';
  const currentAlign = element.textAlign || 'left';

  return (
    <div
      ref={elementRef}
      id={`text-element-${element.id}`}
      style={{
        transform: `translate(${localPos.x}px, ${localPos.y}px)`,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect?.(e.shiftKey || e.ctrlKey || e.metaKey);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(e.shiftKey || e.ctrlKey || e.metaKey);
        textareaRef.current?.focus();
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        onSelect?.(e.shiftKey || e.ctrlKey || e.metaKey);
        textareaRef.current?.focus();
      }}
      className={`group absolute top-0 left-0 min-w-[120px] max-w-lg rounded-xl transition-shadow z-20 pointer-events-auto ${
        isDragging
          ? 'ring-2 ring-blue-500 bg-white/95 dark:bg-slate-900/95 shadow-xl'
          : isSelected || isEditing || element.text === ''
          ? 'ring-2 ring-blue-400/80 bg-white/90 dark:bg-slate-900/90 shadow-md'
          : 'hover:bg-white/60 dark:hover:bg-slate-800/60 hover:ring-1 hover:ring-slate-300 dark:hover:ring-slate-700'
      }`}
    >
      {/* Floating Styling & Formatting Menu (Visible when selected or editing) */}
      {showControls && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute left-1/2 -translate-x-1/2 -top-11 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 p-1 flex items-center gap-0.5 sm:gap-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100 whitespace-nowrap"
        >
          {/* Drag Handle */}
          <div
            onMouseDown={handleMouseDownHeader}
            title="Drag to move text"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-grab active:cursor-grabbing"
          >
            <Move className="w-3.5 h-3.5" />
          </div>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5" />

          {/* Font Family Selector Button & Popover */}
          <div className="relative">
            <button
              onClick={() => {
                setShowFontMenu(!showFontMenu);
                setShowSizeMenu(false);
                setShowColorPicker(false);
              }}
              title="Change font family"
              className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer border ${
                showFontMenu
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'
              }`}
            >
              <Type className="w-3 h-3 text-slate-400" />
              <span>{currentFontFamily.label}</span>
              <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
            </button>

            {showFontMenu && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute left-0 bottom-8 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-1.5 flex flex-col gap-1 z-50 min-w-[130px] animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 uppercase tracking-wider">
                  Font Family
                </div>
                {FONT_FAMILIES.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      updateStyleProp({ fontFamily: f.font });
                      setShowFontMenu(false);
                    }}
                    style={{ fontFamily: f.font }}
                    className={`px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer flex items-center justify-between ${
                      (element.fontFamily || FONT_FAMILIES[0].font) === f.font
                        ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{f.label}</span>
                    <span className="text-[10px] text-slate-400 font-normal">Ag</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Font Size Selector Button & Popover */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSizeMenu(!showSizeMenu);
                setShowFontMenu(false);
                setShowColorPicker(false);
              }}
              title="Change font size"
              className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer border ${
                showSizeMenu
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'
              }`}
            >
              <span>{currentFontSize}px</span>
              <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
            </button>

            {showSizeMenu && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute left-0 bottom-8 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-1.5 flex gap-1 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                {FONT_SIZES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => {
                      updateStyleProp({ fontSize: s.value });
                      setShowSizeMenu(false);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      currentFontSize === s.value
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Color Picker Toggle & Popover */}
          <div className="relative">
            <button
              onClick={() => {
                setShowColorPicker(!showColorPicker);
                setShowFontMenu(false);
                setShowSizeMenu(false);
              }}
              title="Change text color"
              className={`p-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer border ${
                showColorPicker
                  ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'
              }`}
            >
              <Palette className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span
                className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600 shrink-0 shadow-2xs"
                style={{ backgroundColor: element.color || '#0f172a' }}
              />
            </button>

            {showColorPicker && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute left-1/2 -translate-x-1/2 bottom-8 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 flex gap-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                {PALETTE_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => {
                      updateStyleProp({ color: c.hex });
                      setShowColorPicker(false);
                    }}
                    title={c.label}
                    style={{ backgroundColor: c.hex }}
                    className={`w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 hover:scale-115 transition-transform cursor-pointer shadow-2xs ${
                      (element.color || '#0f172a') === c.hex ? 'ring-2 ring-blue-500 scale-110' : ''
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5" />

          {/* Bold Toggle */}
          <button
            onClick={handleToggleBold}
            title={isBold ? "Bold (Active)" : "Bold (Ctrl+B)"}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isBold
                ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          {/* Italic Toggle */}
          <button
            onClick={handleToggleItalic}
            title={isItalic ? "Italic (Active)" : "Italic (Ctrl+I)"}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isItalic
                ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          {/* Underline Toggle */}
          <button
            onClick={handleToggleUnderline}
            title={isUnderline ? "Underline (Active)" : "Underline (Ctrl+U)"}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isUnderline
                ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          {/* Text Alignment Cycle */}
          <button
            onClick={handleCycleAlign}
            title={`Align: ${currentAlign}. Click to cycle`}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
          >
            {currentAlign === 'center' ? (
              <AlignCenter className="w-3.5 h-3.5" />
            ) : currentAlign === 'right' ? (
              <AlignRight className="w-3.5 h-3.5" />
            ) : (
              <AlignLeft className="w-3.5 h-3.5" />
            )}
          </button>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5" />

          {/* Duplicate Text */}
          {onDuplicate && (
            <button
              onClick={() => onDuplicate(element)}
              title="Duplicate text"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete Text */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(element.id);
            }}
            title="Delete text"
            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drag & Author Bar (visible on hover when controls aren't open) */}
      {!showControls && (
        <div
          onMouseDown={handleMouseDownHeader}
          className="flex items-center justify-between px-2 py-0.5 cursor-grab opacity-0 group-hover:opacity-100 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-t-lg transition-opacity text-[10px] text-slate-500 dark:text-slate-400 select-none"
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
              className="p-0.5 hover:text-rose-600 rounded cursor-pointer"
              title="Delete text"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Text Area Content */}
      <div
        className="p-1.5 cursor-text"
        onClick={() => {
          onSelect?.();
          textareaRef.current?.focus();
        }}
      >
        <textarea
          ref={textareaRef}
          value={localText}
          readOnly={!canWrite}
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => {
            if (canWrite) {
              setIsEditing(true);
              onSelect?.();
            }
          }}
          onBlur={handleTextBlur}
          onMouseDown={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
          onKeyDown={handleKeyDown}
          placeholder={canWrite ? "Type text here..." : "Read-only text"}
          rows={1}
          style={{
            fontSize: `${currentFontSize}px`,
            fontFamily: currentFontFamily.font,
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
            textDecoration: isUnderline ? 'underline' : 'none',
            textAlign: currentAlign,
            color: element.color || '#0f172a',
          }}
          className={`w-full bg-transparent resize-none outline-none leading-normal select-text cursor-text transition-all ${
            !canWrite ? 'cursor-default' : 'placeholder:text-slate-400 dark:placeholder:text-slate-600'
          }`}
        />
      </div>
    </div>
  );
};
