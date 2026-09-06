import React from 'react';
import { ToolType } from '../types';
import {
  Pencil,
  Highlighter,
  Eraser,
  StickyNote as StickyIcon,
  Type,
  Undo2,
  Trash2,
  Download,
  Check,
} from 'lucide-react';

interface ToolbarProps {
  currentTool: ToolType;
  currentColor: string;
  currentSize: number;
  canUndo: boolean;
  onSelectTool: (tool: ToolType) => void;
  onSelectColor: (color: string) => void;
  onSelectSize: (size: number) => void;
  onUndo: () => void;
  onRequestClear: () => void;
  onExport: () => void;
  isMultiplayer: boolean;
}

const COLORS = [
  { label: 'Charcoal Black', hex: '#0f172a' },
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

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  currentColor,
  currentSize,
  canUndo,
  onSelectTool,
  onSelectColor,
  onSelectSize,
  onUndo,
  onRequestClear,
  onExport,
  isMultiplayer,
}) => {
  return (
    <div
      id="whiteboard-floating-toolbar"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white border border-slate-200 shadow-xl rounded-2xl p-2 flex flex-wrap items-center gap-2 max-w-[96vw] select-none transition-all"
    >
      {/* Primary Drawing Tools */}
      <div className="flex items-center gap-1">
        <button
          id="tool-pen"
          onClick={() => onSelectTool('pen')}
          title="Pen (Draw)"
          className={`p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
            currentTool === 'pen'
              ? 'bg-blue-50 text-blue-600 font-semibold'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Pencil className="w-4 h-4" />
          <span className="hidden sm:inline">Pen</span>
        </button>

        <button
          id="tool-highlighter"
          onClick={() => onSelectTool('highlighter')}
          title="Highlighter"
          className={`p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
            currentTool === 'highlighter'
              ? 'bg-blue-50 text-blue-600 font-semibold'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Highlighter className="w-4 h-4" />
          <span className="hidden sm:inline">Highlight</span>
        </button>

        <button
          id="tool-eraser"
          onClick={() => onSelectTool('eraser')}
          title="Eraser (Click or drag across strokes to erase)"
          className={`p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
            currentTool === 'eraser'
              ? 'bg-blue-50 text-blue-600 font-semibold'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Eraser className="w-4 h-4" />
          <span className="hidden sm:inline">Eraser</span>
        </button>

        <button
          id="tool-sticky"
          onClick={() => onSelectTool('sticky')}
          title="Add Sticky Note (Click canvas to place)"
          className={`p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
            currentTool === 'sticky'
              ? 'bg-blue-50 text-blue-600 font-semibold'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <StickyIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Sticky Note</span>
        </button>

        <button
          id="tool-text"
          onClick={() => onSelectTool('text')}
          title="Add Text (Click canvas to type)"
          className={`p-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer ${
            currentTool === 'text'
              ? 'bg-blue-50 text-blue-600 font-semibold'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Type className="w-4 h-4" />
          <span className="hidden sm:inline">Text</span>
        </button>
      </div>

      <div className="h-6 w-[1px] bg-slate-200 mx-1" />

      {/* Color Options */}
      <div className="flex items-center gap-2 px-1">
        {COLORS.map((c) => {
          const isSelected = currentColor === c.hex;
          return (
            <button
              key={c.hex}
              id={`color-${c.hex.replace('#', '')}`}
              onClick={() => onSelectColor(c.hex)}
              title={c.label}
              style={{ backgroundColor: c.hex }}
              className={`w-6 h-6 rounded-full cursor-pointer border-2 border-white transition-all ${
                isSelected
                  ? 'ring-2 ring-blue-500 scale-110 shadow-xs opacity-100'
                  : 'opacity-50 hover:opacity-100 hover:scale-105'
              }`}
            />
          );
        })}
      </div>

      <div className="h-6 w-[1px] bg-slate-200 mx-1" />

      {/* Stroke Size Selector */}
      <div className="flex items-center gap-1">
        {SIZES.map((s) => (
          <button
            key={s.value}
            id={`size-${s.value}`}
            onClick={() => onSelectSize(s.value)}
            title={`Stroke width: ${s.label}`}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
              currentSize === s.value
                ? 'bg-slate-100 text-slate-900 font-bold'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span
              style={{ width: `${s.dotSize}px`, height: `${s.dotSize}px` }}
              className={`rounded-full ${currentSize === s.value ? 'bg-slate-900' : 'bg-slate-400'}`}
            />
          </button>
        ))}
      </div>

      <div className="h-6 w-[1px] bg-slate-200 mx-1" />

      {/* Action Utilities */}
      <div className="flex items-center gap-1">
        <button
          id="undo-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo your last action"
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          id="export-btn"
          onClick={onExport}
          title="Export whiteboard as PNG"
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
          id="clear-board-btn"
          onClick={onRequestClear}
          title={isMultiplayer ? 'Vote to clear whiteboard with room' : 'Clear whiteboard'}
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden md:inline text-xs font-medium">
            {isMultiplayer ? 'Vote Clear' : 'Clear'}
          </span>
        </button>
      </div>
    </div>
  );
};
