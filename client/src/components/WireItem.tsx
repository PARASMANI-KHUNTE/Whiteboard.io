import React, { useState, useRef, useEffect } from 'react';
import { WireElement, CanvasElement, WireStyle } from '../types';
import { routeWire } from '../utils/wireGeometry';
import { getAdaptiveDisplayColor } from '../utils/themeColors';
import {
  Spline,
  Minus,
  ArrowRight,
  ArrowLeftRight,
  Trash2,
  Sliders,
  Type,
} from 'lucide-react';

export const WIRE_COLORS = [
  '#0f172a',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

export const WIRE_WIDTHS = [
  { label: 'Thin', val: 2 },
  { label: 'Medium', val: 4 },
  { label: 'Bold', val: 6 },
];

export interface WireItemProps {
  wire: WireElement;
  sourceEl?: CanvasElement;
  targetEl?: CanvasElement;
  zoom?: number;
  theme?: 'light' | 'dark';
  canWrite?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onUpdate: (updated: WireElement) => void;
  onDelete: (id: string) => void;
}

/**
 * Pure SVG layer component for rendering wire vector paths, arrows, and hit areas.
 */
export const WireItem: React.FC<WireItemProps> = ({
  wire,
  sourceEl,
  targetEl,
  theme = 'light',
  isSelected = false,
  onSelect,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  if (!sourceEl || !targetEl) {
    return null;
  }

  const route = routeWire(
    sourceEl,
    targetEl,
    wire.wireType || 'curve',
    wire.fromAnchor,
    wire.toAnchor
  );

  if (!route) return null;

  const effectiveColor = getAdaptiveDisplayColor(wire.color || '#3b82f6', theme);
  const strokeWidth = wire.strokeWidth || 3;
  const strokeDash =
    wire.strokeStyle === 'dashed'
      ? `${strokeWidth * 3},${strokeWidth * 2}`
      : wire.strokeStyle === 'dotted'
      ? `${strokeWidth},${strokeWidth * 1.5}`
      : undefined;

  const markerEndId = `wire-marker-end-${wire.id}`;
  const markerStartId = `wire-marker-start-${wire.id}`;

  return (
    <g
      id={`wire-group-${wire.id}`}
      className="select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <defs>
        {/* End Arrow Marker */}
        <marker
          id={markerEndId}
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth={Math.max(6, strokeWidth * 2.2)}
          markerHeight={Math.max(6, strokeWidth * 2.2)}
          orient="auto"
        >
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={effectiveColor} />
        </marker>

        {/* Start Arrow Marker */}
        <marker
          id={markerStartId}
          viewBox="0 0 10 10"
          refX="3"
          refY="5"
          markerWidth={Math.max(6, strokeWidth * 2.2)}
          markerHeight={Math.max(6, strokeWidth * 2.2)}
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill={effectiveColor} />
        </marker>
      </defs>

      {/* Selection / Hover Glow Aura */}
      {(isSelected || isHovered) && (
        <path
          d={route.svgPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={strokeWidth + 8}
          strokeOpacity={isSelected ? 0.45 : 0.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-150 pointer-events-none"
        />
      )}

      {/* Main Visible Wire Path */}
      <path
        d={route.svgPath}
        fill="none"
        stroke={effectiveColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDash}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={wire.arrowEnd !== false ? `url(#${markerEndId})` : undefined}
        markerStart={wire.arrowStart ? `url(#${markerStartId})` : undefined}
        className="pointer-events-none transition-colors duration-150"
      />

      {/* Broad Invisible Hit-Test Path for Reliable Clicking */}
      <path
        d={route.svgPath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(22, strokeWidth * 4)}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect?.();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.();
        }}
      />
    </g>
  );
};

export interface WireOverlayProps {
  wire: WireElement;
  sourceEl?: CanvasElement;
  targetEl?: CanvasElement;
  theme?: 'light' | 'dark';
  canWrite?: boolean;
  isSelected?: boolean;
  onUpdate: (updated: WireElement) => void;
  onDelete: (id: string) => void;
}

/**
 * HTML overlay component for rendering wire interactive controls (labels, floating toolbar, color popover).
 * Rendered in the HTML canvas layer to eliminate SVG foreignObject clipping & event swallowing bugs.
 */
export const WireOverlay: React.FC<WireOverlayProps> = ({
  wire,
  sourceEl,
  targetEl,
  theme = 'light',
  canWrite = true,
  isSelected = false,
  onUpdate,
  onDelete,
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelText, setLabelText] = useState(wire.label || '');

  useEffect(() => {
    setLabelText(wire.label || '');
  }, [wire.label]);

  // Close sub-menus when deselected
  useEffect(() => {
    if (!isSelected) {
      setShowColorPicker(false);
      setShowStyleMenu(false);
      setIsEditingLabel(false);
    }
  }, [isSelected]);

  if (!sourceEl || !targetEl) {
    return null;
  }

  const route = routeWire(
    sourceEl,
    targetEl,
    wire.wireType || 'curve',
    wire.fromAnchor,
    wire.toAnchor
  );

  if (!route) return null;

  const effectiveColor = getAdaptiveDisplayColor(wire.color || '#3b82f6', theme);

  const handleToggleWireType = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canWrite) return;
    const nextType: WireStyle = wire.wireType === 'curve' ? 'line' : 'curve';
    onUpdate({
      ...wire,
      wireType: nextType,
      updatedAt: Date.now(),
    });
  };

  const handleCycleArrowStyle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canWrite) return;
    let nextStart = false;
    let nextEnd = true;

    if (wire.arrowEnd && !wire.arrowStart) {
      nextStart = true;
      nextEnd = true;
    } else if (wire.arrowEnd && wire.arrowStart) {
      nextStart = false;
      nextEnd = false;
    } else {
      nextStart = false;
      nextEnd = true;
    }

    onUpdate({
      ...wire,
      arrowStart: nextStart,
      arrowEnd: nextEnd,
      updatedAt: Date.now(),
    });
  };

  const handleColorChange = (newColor: string) => {
    if (!canWrite) return;
    onUpdate({
      ...wire,
      color: newColor,
      updatedAt: Date.now(),
    });
    setShowColorPicker(false);
  };

  const handleWidthChange = (width: number) => {
    if (!canWrite) return;
    onUpdate({
      ...wire,
      strokeWidth: width,
      updatedAt: Date.now(),
    });
  };

  const handleStyleChange = (strokeStyle: 'solid' | 'dashed' | 'dotted') => {
    if (!canWrite) return;
    onUpdate({
      ...wire,
      strokeStyle,
      updatedAt: Date.now(),
    });
  };

  const handleLabelSubmit = () => {
    setIsEditingLabel(false);
    onUpdate({
      ...wire,
      label: labelText.trim(),
      updatedAt: Date.now(),
    });
  };

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: route.midpoint.x,
        top: route.midpoint.y,
        zIndex: isSelected ? 40 : 15,
      }}
    >
      {/* Midpoint Text Label */}
      {(wire.label || isEditingLabel) && (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {isEditingLabel ? (
            <div className="flex items-center justify-center">
              <input
                type="text"
                autoFocus
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                onBlur={handleLabelSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLabelSubmit();
                  if (e.key === 'Escape') setIsEditingLabel(false);
                }}
                className="px-2 py-0.5 text-xs rounded-lg border-2 border-blue-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-lg outline-none text-center min-w-[80px]"
              />
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (canWrite) setIsEditingLabel(true);
              }}
              className="group/lbl mx-auto w-fit max-w-[160px] truncate px-3 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200/90 dark:border-slate-700/90 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-md hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer text-center"
            >
              {wire.label}
            </div>
          )}
        </div>
      )}

      {/* Floating Action Menu when Wire is Selected */}
      {isSelected && (
        <div
          className="absolute -translate-x-1/2 -top-14 pointer-events-auto select-none"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1 p-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-200/90 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 w-fit mx-auto">
            {/* Line vs Curve Toggle */}
            <button
              type="button"
              onClick={handleToggleWireType}
              title={`Switch to ${wire.wireType === 'curve' ? 'Straight Line' : 'Smooth Curve'}`}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1 text-xs font-medium"
            >
              {wire.wireType === 'curve' ? (
                <>
                  <Spline className="w-3.5 h-3.5 text-blue-500" />
                  <span>Curve</span>
                </>
              ) : (
                <>
                  <Minus className="w-3.5 h-3.5 text-blue-500" />
                  <span>Line</span>
                </>
              )}
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

            {/* Arrow Style Cycle */}
            <button
              type="button"
              onClick={handleCycleArrowStyle}
              title={`Arrow: ${wire.arrowStart && wire.arrowEnd ? 'Both Ends' : wire.arrowEnd ? 'Target Arrow' : 'No Arrow'}`}
              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {wire.arrowStart && wire.arrowEnd ? (
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-500" />
              ) : wire.arrowEnd !== false ? (
                <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
              ) : (
                <Minus className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {/* Color Swatch Trigger */}
            <div className="relative">
              <button
                type="button"
                id={`wire-color-btn-${wire.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker((prev) => !prev);
                  setShowStyleMenu(false);
                }}
                title="Change Wire Color"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center"
              >
                <div
                  className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shadow-xs"
                  style={{ backgroundColor: effectiveColor }}
                />
              </button>

              {/* Color Swatches Popover */}
              {showColorPicker && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 p-2 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                >
                  {WIRE_COLORS.map((c) => {
                    const isCurrent = wire.color === c || (!wire.color && c === '#3b82f6');
                    return (
                      <button
                        key={c}
                        type="button"
                        id={`wire-color-swatch-${c.replace('#', '')}`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleColorChange(c);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleColorChange(c);
                        }}
                        title={c}
                        className={`w-6 h-6 rounded-full border border-slate-300 dark:border-slate-600 transition-transform cursor-pointer ${
                          isCurrent ? 'scale-115 ring-2 ring-blue-500 ring-offset-2' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stroke Width & Style Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowStyleMenu((prev) => !prev);
                  setShowColorPicker(false);
                }}
                title="Stroke Width & Style"
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
              </button>

              {showStyleMenu && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 p-2.5 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2 min-w-[140px] z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="font-semibold text-slate-500 dark:text-slate-400 text-[10px] uppercase">
                    Thickness
                  </div>
                  <div className="flex gap-1">
                    {WIRE_WIDTHS.map((w) => (
                      <button
                        key={w.val}
                        type="button"
                        onClick={() => handleWidthChange(w.val)}
                        className={`px-2 py-1 rounded text-xs flex-1 text-center font-medium cursor-pointer transition-colors ${
                          (wire.strokeWidth || 3) === w.val
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>

                  <div className="font-semibold text-slate-500 dark:text-slate-400 text-[10px] uppercase mt-1">
                    Style
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleStyleChange('solid')}
                      className={`px-2 py-1 rounded text-xs flex-1 text-center font-medium cursor-pointer transition-colors ${
                        !wire.strokeStyle || wire.strokeStyle === 'solid'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      Solid
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStyleChange('dashed')}
                      className={`px-2 py-1 rounded text-xs flex-1 text-center font-medium cursor-pointer transition-colors ${
                        wire.strokeStyle === 'dashed'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      Dash
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStyleChange('dotted')}
                      className={`px-2 py-1 rounded text-xs flex-1 text-center font-medium cursor-pointer transition-colors ${
                        wire.strokeStyle === 'dotted'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      Dot
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Label Add / Edit Trigger */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingLabel(true);
              }}
              title="Add / Edit Wire Label"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Type className="w-3.5 h-3.5" />
            </button>

            {/* Delete Wire */}
            {canWrite && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(wire.id);
                }}
                title="Delete Wire"
                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
