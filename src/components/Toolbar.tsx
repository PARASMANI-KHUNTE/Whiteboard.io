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
  Lock,
} from 'lucide-react';

interface ToolbarProps {
  currentTool: ToolType;
  currentColor: string;
  currentSize: number;
  canUndo: boolean;
  canWrite?: boolean;
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
  canWrite = true,
  onSelectTool,
  onSelectColor,
  onSelectSize,
  onUndo,
  onRequestClear,
  onExport,
  isMultiplayer,
}) => {
  return (
    <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 max-w-[98vw] select-none pointer-events-auto">
      {/* Read-only notification badge when revoked */}
      {!canWrite && (
        <div className="px-3.5 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-full shadow-lg border border-amber-400 flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>View-Only Mode — Drawing access restricted by room host</span>
        </div>
      )}

      <div
        id="whiteboard-floating-toolbar"
        className={`bg-white border border-slate-200 shadow-xl rounded-2xl p-1.5 sm:p-2 flex items-center gap-1 sm:gap-2 max-w-[98vw] overflow-x-auto transition-all ${
          !canWrite ? 'opacity-80 bg-slate-50/90' : ''
        }`}
      >
        {/* Primary Drawing Tools */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            id="tool-pen"
            disabled={!canWrite}
            onClick={() => onSelectTool('pen')}
            title={canWrite ? "Pen (Draw)" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'pen' && canWrite
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Pencil className="w-4 h-4" />
            <span className="hidden md:inline">Pen</span>
          </button>

          <button
            id="tool-highlighter"
            disabled={!canWrite}
            onClick={() => onSelectTool('highlighter')}
            title={canWrite ? "Highlighter" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'highlighter' && canWrite
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Highlighter className="w-4 h-4" />
            <span className="hidden md:inline">Highlight</span>
          </button>

          <button
            id="tool-eraser"
            disabled={!canWrite}
            onClick={() => onSelectTool('eraser')}
            title={canWrite ? "Eraser" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'eraser' && canWrite
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Eraser className="w-4 h-4" />
            <span className="hidden md:inline">Eraser</span>
          </button>

          <button
            id="tool-sticky"
            disabled={!canWrite}
            onClick={() => onSelectTool('sticky')}
            title={canWrite ? "Add Sticky Note" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'sticky' && canWrite
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <StickyIcon className="w-4 h-4" />
            <span className="hidden md:inline">Sticky Note</span>
          </button>

          <button
            id="tool-text"
            disabled={!canWrite}
            onClick={() => onSelectTool('text')}
            title={canWrite ? "Add Text" : "Drawing restricted"}
            className={`min-h-[40px] min-w-[40px] p-2 sm:p-2.5 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              currentTool === 'text' && canWrite
                ? 'bg-blue-50 text-blue-600 font-semibold'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            <Type className="w-4 h-4" />
            <span className="hidden md:inline">Text</span>
          </button>
        </div>

        <div className="h-6 w-[1px] bg-slate-200 mx-0.5 sm:mx-1 shrink-0" />

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
                className={`w-6 h-6 sm:w-6.5 sm:h-6.5 rounded-full cursor-pointer border-2 border-white transition-all shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'ring-2 ring-blue-500 scale-110 shadow-xs opacity-100'
                    : 'opacity-60 hover:opacity-100 hover:scale-105'
                }`}
              />
            );
          })}
        </div>

        <div className="h-6 w-[1px] bg-slate-200 mx-0.5 sm:mx-1 shrink-0" />

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

        <div className="h-6 w-[1px] bg-slate-200 mx-0.5 sm:mx-1 shrink-0" />

        {/* Action Utilities */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            id="undo-btn"
            onClick={onUndo}
            disabled={!canUndo || !canWrite}
            title="Undo your last action"
            className="p-2 sm:p-2.5 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl disabled:opacity-20 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <Undo2 className="w-4 h-4" />
          </button>

          <button
            id="export-btn"
            onClick={onExport}
            title="Export whiteboard as PNG"
            className="p-2 sm:p-2.5 min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
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
            className="p-2 sm:p-2.5 min-h-[38px] text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-20 disabled:pointer-events-none"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden lg:inline text-xs font-medium">
              {isMultiplayer ? 'Vote Clear' : 'Clear'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
