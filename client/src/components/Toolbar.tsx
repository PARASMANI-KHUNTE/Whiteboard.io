import React, { useState, useMemo } from 'react';
import { ToolType, ShapeType } from '../types';
import { AVAILABLE_ICONS } from '../constants/icons';
import {
  MousePointer,
  Pencil,
  Highlighter,
  Eraser,
  StickyNote as StickyIcon,
  Type,
  Shapes,
  Square,
  Circle,
  Diamond,
  Triangle,
  Star,
  ArrowRight,
  Smile,
  Hand,
  Undo2,
  Trash2,
  Download,
  Lock,
  SlidersHorizontal,
  ChevronRight,
  Search,
  X,
  CheckSquare,
} from 'lucide-react';

interface ToolbarProps {
  currentTool: ToolType;
  currentColor: string;
  currentSize: number;
  canUndo: boolean;
  canWrite?: boolean;
  selectedShapeType: ShapeType;
  selectedIconName: string;
  onSelectTool: (tool: ToolType) => void;
  onSelectColor: (color: string) => void;
  onSelectSize: (size: number) => void;
  onSelectShape: (shape: ShapeType) => void;
  onSelectIcon: (iconName: string) => void;
  onUndo: () => void;
  onRequestClear: () => void;
  onExport: () => void;
  onSelectAll?: () => void;
  isMultiplayer: boolean;
}

const COLORS = [
  { label: 'Charcoal Black', hex: '#0f172a' },
  { label: 'Snow White', hex: '#ffffff' },
  { label: 'Vibrant Coral', hex: '#ef4444' },
  { label: 'Ocean Blue', hex: '#3b82f6' },
  { label: 'Forest Green', hex: '#10b981' },
  { label: 'Amber Sun', hex: '#f59e0b' },
];

const SIZES = [
  { label: 'Fine', value: 3, dotSize: 4 },
  { label: 'Medium', value: 6, dotSize: 7 },
  { label: 'Bold', value: 12, dotSize: 10 },
];

const SHAPES_CONFIG: { type: ShapeType; label: string; keywords: string[]; icon: React.FC<{ className?: string }> }[] = [
  { type: 'rectangle', label: 'Rectangle', keywords: ['rectangle', 'box', 'square', 'card', 'block', 'container'], icon: Square },
  { type: 'circle', label: 'Circle', keywords: ['circle', 'round', 'oval', 'dot', 'bubble', 'ring'], icon: Circle },
  { type: 'diamond', label: 'Diamond', keywords: ['diamond', 'rhombus', 'decision', 'flowchart', 'condition'], icon: Diamond },
  { type: 'triangle', label: 'Triangle', keywords: ['triangle', 'delta', 'pyramid', 'direction', 'polygon'], icon: Triangle },
  { type: 'star', label: 'Star', keywords: ['star', 'favorite', 'rating', 'badge', 'award', 'achievement'], icon: Star },
  { type: 'arrow', label: 'Arrow', keywords: ['arrow', 'pointer', 'direction', 'right', 'next', 'flow'], icon: ArrowRight },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  currentColor,
  currentSize,
  canUndo,
  canWrite = true,
  selectedShapeType,
  selectedIconName,
  onSelectTool,
  onSelectColor,
  onSelectSize,
  onSelectShape,
  onSelectIcon,
  onUndo,
  onRequestClear,
  onExport,
  onSelectAll,
  isMultiplayer,
}) => {
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [shapeSearchQuery, setShapeSearchQuery] = useState('');
  const [iconSearchQuery, setIconSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const filteredShapes = useMemo(() => {
    const q = shapeSearchQuery.trim().toLowerCase();
    if (!q) return SHAPES_CONFIG;
    return SHAPES_CONFIG.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [shapeSearchQuery]);

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

  const handleShapeSelect = (shape: ShapeType) => {
    onSelectShape(shape);
    onSelectTool('shape');
    setShowShapePicker(false);
    setShapeSearchQuery('');
  };

  const handleIconSelect = (iconName: string) => {
    onSelectIcon(iconName);
    onSelectTool('icon');
    setShowIconPicker(false);
    setIconSearchQuery('');
  };

  return (
    <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 max-w-[98vw] select-none pointer-events-auto">
      {/* Read-only notification badge when revoked */}
      {!canWrite && (
        <div className="px-3.5 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-full shadow-lg border border-amber-400 flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>View-Only Mode — Drawing access restricted by room host</span>
        </div>
      )}

      {/* Floating Popover for Shapes with Search */}
      {showShapePicker && canWrite && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150 mb-1 z-50 w-72 sm:w-80">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Shapes ({filteredShapes.length})
            </span>
            <button
              onClick={() => {
                setShowShapePicker(false);
                setShapeSearchQuery('');
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Input for Shapes */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={shapeSearchQuery}
              onChange={(e) => setShapeSearchQuery(e.target.value)}
              placeholder="Search shapes (box, circle, diamond)..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              autoFocus
            />
            {shapeSearchQuery && (
              <button
                onClick={() => setShapeSearchQuery('')}
                className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filtered Shapes Grid */}
          {filteredShapes.length > 0 ? (
            <div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
              {filteredShapes.map((s) => {
                const IconComp = s.icon;
                const isCurrent = currentTool === 'shape' && selectedShapeType === s.type;
                return (
                  <button
                    key={s.type}
                    onClick={() => handleShapeSelect(s.type)}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                        : 'bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                    title={`${s.label} (${s.keywords.slice(0, 3).join(', ')})`}
                  >
                    <IconComp className="w-5 h-5" />
                    <span className="text-[10px] whitespace-nowrap">{s.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-slate-400">
              No shapes matching &ldquo;{shapeSearchQuery}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Floating Popover for Icons with Search */}
      {showIconPicker && canWrite && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150 mb-1 z-50 w-80 sm:w-96">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Icons &amp; Stickers ({filteredIcons.length})
            </span>
            <button
              onClick={() => {
                setShowIconPicker(false);
                setIconSearchQuery('');
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Input for Icons */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={iconSearchQuery}
              onChange={(e) => setIconSearchQuery(e.target.value)}
              placeholder="Search icons (star, fire, code, love, music)..."
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              autoFocus
            />
            {iconSearchQuery && (
              <button
                onClick={() => setIconSearchQuery('')}
                className="absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Filtered Icons Grid */}
          {filteredIcons.length > 0 ? (
            <div className="grid grid-cols-6 sm:grid-cols-7 gap-1.5 max-h-56 overflow-y-auto p-1">
              {filteredIcons.map(([key, config]) => {
                const IconComp = config.component;
                const isCurrent = currentTool === 'icon' && selectedIconName === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleIconSelect(key)}
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-blue-50 dark:bg-blue-950 border-blue-500 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                        : 'bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                    title={`${config.label} (${config.keywords?.slice(0, 3).join(', ')})`}
                  >
                    <IconComp size={20} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400">
              No icons matching &ldquo;{iconSearchQuery}&rdquo;
            </div>
          )}
        </div>
      )}


      {/* Main Floating Toolbar */}
      <div
        id="whiteboard-floating-toolbar"
        className={`bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl p-1.5 sm:p-2 flex items-center gap-1 sm:gap-2 max-w-[98vw] overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] transition-all ${
          !canWrite ? 'opacity-80 bg-slate-50/90 dark:bg-slate-900/90' : ''
        }`}
      >
        {/* Primary Drawing & Navigation Tools */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            id="tool-select"
            onClick={() => {
              onSelectTool('select');
              setShowShapePicker(false);
              setShowIconPicker(false);
            }}
            title="Select tool (V) — Click to select, move, and edit shapes or stickers"
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
              currentTool === 'select'
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <MousePointer className="w-4 h-4" />
            <span className="hidden md:inline">Select</span>
          </button>

          {currentTool === 'select' && onSelectAll && (
            <button
              id="tool-select-all"
              onClick={onSelectAll}
              title="Select All (Ctrl+A) — Select all elements on the canvas"
              className="min-h-[40px] px-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800/60 transition-colors cursor-pointer animate-in fade-in zoom-in-95 duration-150"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Select All</span>
            </button>
          )}

          <button
            id="tool-hand"
            onClick={() => {
              onSelectTool('hand');
              setShowShapePicker(false);
              setShowIconPicker(false);
            }}
            title="Hand / Pan tool (Move whiteboard) — Or use Middle Mouse Button"
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
              currentTool === 'hand'
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Hand className="w-4 h-4" />
            <span className="hidden md:inline">Hand</span>
          </button>

          <button
            id="tool-pen"
            disabled={!canWrite}
            onClick={() => {
              onSelectTool('pen');
              setShowShapePicker(false);
              setShowIconPicker(false);
            }}
            title={canWrite ? "Pen (Draw)" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'pen' && canWrite
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Pencil className="w-4 h-4" />
            <span className="hidden md:inline">Pen</span>
          </button>

          <button
            id="tool-highlighter"
            disabled={!canWrite}
            onClick={() => {
              onSelectTool('highlighter');
              setShowShapePicker(false);
              setShowIconPicker(false);
            }}
            title={canWrite ? "Highlighter" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'highlighter' && canWrite
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Highlighter className="w-4 h-4" />
            <span className="hidden md:inline">Highlight</span>
          </button>

          <button
            id="tool-eraser"
            disabled={!canWrite}
            onClick={() => {
              onSelectTool('eraser');
              setShowShapePicker(false);
              setShowIconPicker(false);
            }}
            title={canWrite ? "Eraser" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'eraser' && canWrite
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Eraser className="w-4 h-4" />
            <span className="hidden md:inline">Eraser</span>
          </button>

          {/* Shapes Tool Button */}
          <button
            id="tool-shapes"
            disabled={!canWrite}
            onClick={() => {
              setShowShapePicker(!showShapePicker);
              setShowIconPicker(false);
              if (!showShapePicker) onSelectTool('shape');
            }}
            title={canWrite ? "Add Shapes (Rectangle, Circle, Triangle...)" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              (currentTool === 'shape' || showShapePicker) && canWrite
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Shapes className="w-4 h-4" />
            <span className="hidden md:inline">Shapes</span>
          </button>

          {/* Stickers / Icons Tool Button */}
          <button
            id="tool-icons"
            disabled={!canWrite}
            onClick={() => {
              setShowIconPicker(!showIconPicker);
              setShowShapePicker(false);
              if (!showIconPicker) onSelectTool('icon');
            }}
            title={canWrite ? "Add Icons & Stickers" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              (currentTool === 'icon' || showIconPicker) && canWrite
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Smile className="w-4 h-4" />
            <span className="hidden md:inline">Icons</span>
          </button>

          <button
            id="tool-sticky"
            disabled={!canWrite}
            onClick={() => {
              onSelectTool('sticky');
              setShowShapePicker(false);
              setShowIconPicker(false);
            }}
            title={canWrite ? "Add Sticky Note" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'sticky' && canWrite
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <StickyIcon className="w-4 h-4" />
            <span className="hidden md:inline">Sticky Note</span>
          </button>

          <button
            id="tool-text"
            disabled={!canWrite}
            onClick={() => {
              onSelectTool('text');
              setShowShapePicker(false);
              setShowIconPicker(false);
            }}
            title={canWrite ? "Add Text" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'text' && canWrite
                ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Type className="w-4 h-4" />
            <span className="hidden md:inline">Text</span>
          </button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1 shrink-0" />

        {/* Slide / Expand Toggle Button */}
        <button
          id="toolbar-slide-toggle-btn"
          onClick={() => setIsExpanded((prev) => !prev)}
          title={isExpanded ? "Collapse tool options" : "Slide to expand colors, stroke & options"}
          className={`min-h-[40px] px-2 sm:px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-all cursor-pointer shrink-0 border ${
            isExpanded
              ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 shadow-xs'
              : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span
            className="w-2.5 h-2.5 rounded-full border border-slate-300 dark:border-slate-600 shrink-0"
            style={{ backgroundColor: currentColor }}
          />
          <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Slidable Options: Colors & Stroke Sizes */}
        {isExpanded && (
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 animate-in fade-in slide-in-from-left-2 duration-200">
            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0" />

            {/* Color Options */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-1 shrink-0">
              {COLORS.map((c) => {
                const isSelected = currentColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    id={`color-${c.hex.replace('#', '')}`}
                    disabled={!canWrite}
                    onClick={() => onSelectColor(c.hex)}
                    title={c.label}
                    style={{ backgroundColor: c.hex }}
                    className={`w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full cursor-pointer border border-slate-300 dark:border-slate-600 transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'ring-2 ring-blue-500 scale-110 shadow-xs opacity-100'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                  />
                );
              })}
            </div>

            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1 shrink-0" />

            {/* Stroke Size Selector */}
            <div className="flex items-center gap-1 shrink-0">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  id={`size-${s.value}`}
                  disabled={!canWrite}
                  onClick={() => onSelectSize(s.value)}
                  title={`Stroke width: ${s.label}`}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    currentSize === s.value
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                      : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span
                    style={{ width: `${s.dotSize}px`, height: `${s.dotSize}px` }}
                    className={`rounded-full ${
                      currentSize === s.value
                        ? 'bg-slate-900 dark:bg-white'
                        : 'bg-slate-400 dark:bg-slate-500'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1 shrink-0" />

        {/* Action Utilities: Always Visible */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            id="undo-btn"
            onClick={onUndo}
            disabled={!canUndo || !canWrite}
            title="Undo your last action"
            className="p-2 sm:p-2.5 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            id="export-btn"
            onClick={onExport}
            title="Export whiteboard as PNG"
            className="p-2 sm:p-2.5 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            id="clear-board-btn"
            onClick={onRequestClear}
            disabled={!canWrite}
            title={
              !canWrite
                ? 'Clearing board is restricted'
                : isMultiplayer
                ? 'Vote to clear whiteboard with room'
                : 'Clear whiteboard'
            }
            className="p-2 sm:p-2.5 min-h-[38px] text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-20 disabled:pointer-events-none font-medium text-xs"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isMultiplayer ? 'Vote Clear' : 'Clear'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
