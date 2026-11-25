import {
  ArrowRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Highlighter,
  MousePointer,
  Pencil,
  Shapes,
  Smile,
  Spline,
  Square,
  Star,
  StickyNote,
  Triangle,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { ShapeType, ToolType } from '../../types';

export interface StrokeSizeOption {
  label: string;
  value: number;
  dotSize: number;
}

export const STROKE_SIZE_OPTIONS: StrokeSizeOption[] = [
  { label: 'Fine', value: 3, dotSize: 4 },
  { label: 'Medium', value: 6, dotSize: 7 },
  { label: 'Bold', value: 12, dotSize: 10 },
];

export interface ShapeToolOption {
  type: ShapeType;
  label: string;
  keywords: string[];
  icon: LucideIcon;
}

export const SHAPE_TOOL_OPTIONS: ShapeToolOption[] = [
  { type: 'rectangle', label: 'Rectangle', keywords: ['rectangle', 'box', 'square', 'card'], icon: Square },
  { type: 'circle', label: 'Circle', keywords: ['circle', 'round', 'oval', 'bubble'], icon: Circle },
  { type: 'diamond', label: 'Diamond', keywords: ['diamond', 'rhombus', 'decision', 'flow'], icon: Diamond },
  { type: 'triangle', label: 'Triangle', keywords: ['triangle', 'delta', 'pyramid'], icon: Triangle },
  { type: 'star', label: 'Star', keywords: ['star', 'favorite', 'badge'], icon: Star },
  { type: 'arrow', label: 'Arrow', keywords: ['arrow', 'pointer', 'direction'], icon: ArrowRight },
];

export interface CanvasToolDefinition {
  tool: ToolType;
  label: string;
  shortLabel: string;
  shortcut: string;
  title: string;
  icon: LucideIcon;
  needsWrite: boolean;
}

/**
 * Shared ordered canvas tool definitions consumed across Sidebar, Toolbar, and ZoomControls.
 */
export const CANVAS_TOOL_DEFINITIONS: CanvasToolDefinition[] = [
  {
    tool: 'select',
    label: 'Select',
    shortLabel: 'Select',
    shortcut: 'V',
    title: 'Select tool (V) — Click to select, move, and edit shapes or stickers',
    icon: MousePointer,
    needsWrite: false,
  },
  {
    tool: 'hand',
    label: 'Pan / Hand',
    shortLabel: 'Hand',
    shortcut: 'H',
    title: 'Hand / Pan tool (H) — Or use Middle Mouse Button / hold Space',
    icon: Hand,
    needsWrite: false,
  },
  {
    tool: 'pen',
    label: 'Pen',
    shortLabel: 'Pen',
    shortcut: 'P',
    title: 'Pen (P) — Freehand drawing',
    icon: Pencil,
    needsWrite: true,
  },
  {
    tool: 'highlighter',
    label: 'Highlighter',
    shortLabel: 'Highlight',
    shortcut: 'Y',
    title: 'Highlighter (Y) — Translucent marker',
    icon: Highlighter,
    needsWrite: true,
  },
  {
    tool: 'eraser',
    label: 'Eraser',
    shortLabel: 'Eraser',
    shortcut: 'E',
    title: 'Eraser (E) — Erase strokes and objects',
    icon: Eraser,
    needsWrite: true,
  },
  {
    tool: 'shape',
    label: 'Shapes',
    shortLabel: 'Shapes',
    shortcut: 'R',
    title: 'Add Shapes (R) — Rectangle, Circle, Triangle...',
    icon: Shapes,
    needsWrite: true,
  },
  {
    tool: 'icon',
    label: 'Icons & stickers',
    shortLabel: 'Icons',
    shortcut: 'I',
    title: 'Add Icons & Stickers (I)',
    icon: Smile,
    needsWrite: true,
  },
  {
    tool: 'sticky',
    label: 'Sticky note',
    shortLabel: 'Sticky Note',
    shortcut: 'S',
    title: 'Sticky Note (S) — Pin movable notes',
    icon: StickyNote,
    needsWrite: true,
  },
  {
    tool: 'text',
    label: 'Text',
    shortLabel: 'Text',
    shortcut: 'T',
    title: 'Text Box (T) — Type anywhere on the board',
    icon: Type,
    needsWrite: true,
  },
  {
    tool: 'wire',
    label: 'Wire connector',
    shortLabel: 'Wire',
    shortcut: 'W',
    title: 'Wire Connector (W) — Connect items with straight or curved arrows',
    icon: Spline,
    needsWrite: true,
  },
];

export const CANVAS_TOOL_BY_ID: Record<ToolType, CanvasToolDefinition> = Object.fromEntries(
  CANVAS_TOOL_DEFINITIONS.map((def) => [def.tool, def])
) as Record<ToolType, CanvasToolDefinition>;

export function getHandFallbackTool(canWrite: boolean): ToolType {
  return canWrite ? 'pen' : 'select';
}

export interface HandToggleMeta {
  isHandTool: boolean;
  ariaLabel: string;
  title: string;
  Icon: LucideIcon;
  fallbackTool: ToolType;
}

/**
 * Shared metadata and fallback target for toggling the Hand / Pan tool in ZoomControls.
 */
export function getHandToggleMeta(isHandTool: boolean, canWrite = true): HandToggleMeta {
  const handDef = CANVAS_TOOL_BY_ID.hand;
  const fallbackTool = getHandFallbackTool(canWrite);
  const fallbackDef = CANVAS_TOOL_BY_ID[fallbackTool];

  return {
    isHandTool,
    ariaLabel: isHandTool
      ? `Switch back to ${fallbackDef.shortLabel.toLowerCase()} tool`
      : `Switch to ${handDef.label} (${handDef.shortcut})`,
    title: isHandTool
      ? `Switch back to ${fallbackDef.shortLabel} (${fallbackDef.shortcut})`
      : handDef.title,
    Icon: handDef.icon,
    fallbackTool,
  };
}
