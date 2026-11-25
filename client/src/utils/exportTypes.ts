import type {
  CanvasElement,
  DrawingStroke,
  IconElement,
  Point,
  ShapeElement,
  StickyNote,
  TextElement,
  WireElement,
} from '../types';
import { isColorBlack, isColorWhite } from './themeColors';
import { getElementZ } from './zOrder';
import { routeWire } from './wireGeometry';

export type ExportFormat = 'png' | 'svg' | 'jpeg' | 'webp' | 'json';
export type ExportScope = 'board' | 'viewport';
export type ExportBackground = 'light' | 'dark' | 'transparent';
export type ExportScale = 1 | 2 | 3;

export interface ExportFormatOption {
  id: ExportFormat;
  label: string;
  shortLabel: string;
  extension: string;
  mimeType: string;
  description: string;
  supportsTransparency: boolean;
  supportsScale: boolean;
  isVisual: boolean;
}

export const EXPORT_FORMAT_OPTIONS: readonly ExportFormatOption[] = [
  {
    id: 'png',
    label: 'PNG Image',
    shortLabel: 'PNG',
    extension: 'png',
    mimeType: 'image/png',
    description: 'Lossless crisp image with optional transparency',
    supportsTransparency: true,
    supportsScale: true,
    isVisual: true,
  },
  {
    id: 'svg',
    label: 'SVG Vector',
    shortLabel: 'SVG',
    extension: 'svg',
    mimeType: 'image/svg+xml',
    description: 'Scalable vector graphic for crisp editing and print',
    supportsTransparency: true,
    supportsScale: false,
    isVisual: true,
  },
  {
    id: 'jpeg',
    label: 'JPEG Image',
    shortLabel: 'JPEG',
    extension: 'jpg',
    mimeType: 'image/jpeg',
    description: 'Compact opaque photo format (92% quality)',
    supportsTransparency: false,
    supportsScale: true,
    isVisual: true,
  },
  {
    id: 'webp',
    label: 'WebP Image',
    shortLabel: 'WebP',
    extension: 'webp',
    mimeType: 'image/webp',
    description: 'Modern compressed image with alpha support',
    supportsTransparency: true,
    supportsScale: true,
    isVisual: true,
  },
  {
    id: 'json',
    label: 'JSON Data',
    shortLabel: 'JSON',
    extension: 'json',
    mimeType: 'application/json',
    description: 'Full portable board backup of elements & metadata',
    supportsTransparency: false,
    supportsScale: false,
    isVisual: false,
  },
];

export const EXPORT_SCALE_OPTIONS: readonly ExportScale[] = [1, 2, 3];
export const BOARD_EXPORT_PADDING = 48;
export const MAX_RASTER_DIMENSION = 4096;
export const MAX_RASTER_PIXELS = 16_777_216;

export const EXPORT_ICON_GLYPHS: Record<string, string> = {
  star: '⭐',
  heart: '❤️',
  sparkles: '✨',
  flame: '🔥',
  lightbulb: '💡',
  zap: '⚡',
  trophy: '🏆',
  target: '🎯',
  user: '👤',
  smile: '😊',
  'thumbs-up': '👍',
  rocket: '🚀',
  cloud: '☁️',
  database: '🗄️',
  server: '🖥️',
  code: '💻',
  terminal: '⌨️',
  cpu: '🔲',
  shield: '🛡️',
  lock: '🔒',
  key: '🔑',
  message: '💬',
  mail: '✉️',
  send: '📨',
  bell: '🔔',
  bookmark: '🔖',
  calendar: '📅',
  clock: '🕒',
  compass: '🧭',
  'map-pin': '📍',
  globe: '🌐',
  home: '🏠',
  image: '🖼️',
  camera: '📷',
  music: '🎵',
  phone: '📞',
  pin: '📌',
  share: '🔗',
  link: '🔗',
  cart: '🛒',
  tag: '🏷️',
  file: '📄',
  folder: '📁',
  layers: '📚',
  coffee: '☕',
  gift: '🎁',
  flag: '🚩',
  wifi: '📶',
  sun: '☀️',
  moon: '🌙',
  eye: '👁️',
  search: '🔍',
  check: '✅',
  alert: '⚠️',
  help: '❓',
};

export interface ExportViewportInfo {
  pan: Point;
  zoom: number;
  width: number;
  height: number;
}

export interface ExportSceneMetrics {
  width: number;
  height: number;
  panX: number;
  panY: number;
  worldZoom: number;
  scale: number;
  pixelWidth: number;
  pixelHeight: number;
  wasDownscaled: boolean;
  usedViewportFallback: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrderedExportElements {
  strokes: DrawingStroke[];
  wires: WireElement[];
  positioned: Array<StickyNote | TextElement | ShapeElement | IconElement>;
}

export function getExportFormatOption(format: ExportFormat): ExportFormatOption {
  return EXPORT_FORMAT_OPTIONS.find((opt) => opt.id === format) ?? EXPORT_FORMAT_OPTIONS[0];
}

export function resolveExportBackground(
  background: ExportBackground,
  format: ExportFormat,
  fallbackTheme: 'light' | 'dark' = 'light'
): ExportBackground {
  const option = getExportFormatOption(format);
  if (!option.supportsTransparency && background === 'transparent') {
    return fallbackTheme;
  }
  return background;
}

export function resolveRenderColorTheme(
  background: ExportBackground,
  appTheme: 'light' | 'dark'
): 'light' | 'dark' {
  if (background === 'dark') return 'dark';
  if (background === 'light') return 'light';
  return appTheme;
}

export function getBoardBackgroundFill(background: ExportBackground): string | null {
  if (background === 'light') return '#ffffff';
  if (background === 'dark') return '#0b0f19';
  return null;
}

export function getBoardGridStroke(colorTheme: 'light' | 'dark'): string {
  return colorTheme === 'dark' ? '#1e293b' : '#f1f5f9';
}

export function resolveStrokeDisplayColor(color: string, colorTheme: 'light' | 'dark'): string {
  if (colorTheme === 'dark' && isColorBlack(color)) return '#ffffff';
  if (colorTheme === 'light' && isColorWhite(color)) return '#0f172a';
  return color;
}

export function resolveTextDisplayColor(
  color: string | undefined,
  colorTheme: 'light' | 'dark'
): string {
  if (colorTheme === 'dark' && (!color || isColorBlack(color))) return '#ffffff';
  if (colorTheme === 'light' && isColorWhite(color)) return '#0f172a';
  return color || '#0f172a';
}

export function resolveWireDisplayColor(
  color: string | undefined,
  colorTheme: 'light' | 'dark'
): string {
  if (colorTheme === 'dark' && isColorBlack(color)) return '#ffffff';
  if (colorTheme === 'light' && isColorWhite(color)) return '#0f172a';
  return color || '#3b82f6';
}

export function wrapTextByCharBudget(
  text: string,
  maxWidthPx: number,
  fontSize: number
): string[] {
  const result: string[] = [];
  if (!text) return result;
  const approxCharWidth = Math.max(4, fontSize * 0.56);
  const maxChars = Math.max(1, Math.floor(maxWidthPx / approxCharWidth));

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      result.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        result.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) result.push(current);
  }
  return result;
}

export function estimateTextBox(element: TextElement): {
  width: number;
  height: number;
  lines: string[];
} {
  const fontSize = element.fontSize || 18;
  const lines = (element.text || '').split('\n');
  const longestChars = Math.max(1, ...lines.map((line) => line.length));
  const width = Math.max(24, Math.ceil(longestChars * fontSize * 0.62) + 8);
  const height = Math.max(Math.ceil(fontSize * 1.25), Math.ceil(lines.length * fontSize * 1.25 + 6));
  return { width, height, lines };
}

function expandRotatedBox(
  x: number,
  y: number,
  width: number,
  height: number,
  rotationDeg: number,
  pad: number
): BoundingBox {
  if (!rotationDeg) {
    return {
      x: x - pad,
      y: y - pad,
      width: width + pad * 2,
      height: height + pad * 2,
    };
  }
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = width / 2;
  const hh = height / 2;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [dx, dy] of [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]) {
    const px = cx + dx * cos - dy * sin;
    const py = cy + dx * sin + dy * cos;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}

export function computeElementsBoundingBox(
  elements: Record<string, CanvasElement>
): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includeRect = (x: number, y: number, w: number, h: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + Math.max(0, w));
    maxY = Math.max(maxY, y + Math.max(0, h));
  };

  const includePoint = (pt: Point, pad = 0) => {
    includeRect(pt.x - pad, pt.y - pad, pad * 2, pad * 2);
  };

  for (const el of Object.values(elements) as CanvasElement[]) {
    if (!el) continue;
    if (el.type === 'stroke') {
      if (!el.points || el.points.length === 0) continue;
      const pad = (el.isHighlighter ? el.size * 2.5 : el.size) / 2 + 2;
      for (const pt of el.points) {
        includePoint(pt, pad);
      }
      continue;
    }

    if (el.type === 'sticky') {
      includeRect(el.x, el.y, el.width || 224, el.height || 150);
      continue;
    }

    if (el.type === 'text') {
      const box = estimateTextBox(el);
      includeRect(el.x, el.y, box.width, box.height);
      continue;
    }

    if (el.type === 'shape') {
      const box = expandRotatedBox(
        el.x,
        el.y,
        el.width || 160,
        el.height || 120,
        el.rotation || 0,
        (el.strokeWidth || 3) / 2 + 2
      );
      includeRect(box.x, box.y, box.width, box.height);
      continue;
    }

    if (el.type === 'icon') {
      const boxSize = (el.size || 48) + 16;
      const box = expandRotatedBox(el.x, el.y, boxSize, boxSize, el.rotation || 0, 2);
      includeRect(box.x, box.y, box.width, box.height);
      continue;
    }

    if (el.type === 'wire') {
      const sourceEl = elements[el.fromId];
      const targetEl = elements[el.toId];
      if (!sourceEl || !targetEl) continue;
      const route = routeWire(sourceEl, targetEl, el.wireType || 'curve', el.fromAnchor, el.toAnchor);
      if (!route) continue;
      const arrowPad = Math.max(8, (el.strokeWidth || 3) * 2.5) + 4;
      includePoint(route.fromPoint, arrowPad);
      includePoint(route.toPoint, arrowPad);
      includePoint(route.midpoint, el.label ? el.label.length * 4 + 12 : 8);
      if (route.controlPoints) {
        includePoint(route.controlPoints[0], 12);
        includePoint(route.controlPoints[1], 12);
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function computeExportScene(
  elements: Record<string, CanvasElement>,
  viewport: ExportViewportInfo,
  options: { scope: ExportScope; scale: ExportScale; isVector?: boolean }
): ExportSceneMetrics {
  const safeViewportW = Math.max(160, Math.round(viewport.width || 1280));
  const safeViewportH = Math.max(120, Math.round(viewport.height || 720));
  const safeZoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;

  let width = safeViewportW;
  let height = safeViewportH;
  let panX = viewport.pan.x;
  let panY = viewport.pan.y;
  let worldZoom = safeZoom;
  let usedViewportFallback = false;

  if (options.scope === 'board') {
    const bounds = computeElementsBoundingBox(elements);
    if (bounds) {
      width = Math.max(160, Math.ceil(bounds.width + BOARD_EXPORT_PADDING * 2));
      height = Math.max(120, Math.ceil(bounds.height + BOARD_EXPORT_PADDING * 2));
      panX = -(bounds.x - BOARD_EXPORT_PADDING);
      panY = -(bounds.y - BOARD_EXPORT_PADDING);
      worldZoom = 1;
    } else {
      usedViewportFallback = true;
    }
  }

  if (options.isVector) {
    return {
      width,
      height,
      panX,
      panY,
      worldZoom,
      scale: 1,
      pixelWidth: width,
      pixelHeight: height,
      wasDownscaled: false,
      usedViewportFallback,
    };
  }

  const desiredScale = options.scale;
  const maxDimScale = Math.min(
    MAX_RASTER_DIMENSION / width,
    MAX_RASTER_DIMENSION / height
  );
  const maxAreaScale = Math.sqrt(MAX_RASTER_PIXELS / Math.max(1, width * height));
  const effectiveScale = Math.min(desiredScale, maxDimScale, maxAreaScale);
  const clampedScale = Math.max(0.05, Number.isFinite(effectiveScale) ? effectiveScale : 1);

  return {
    width,
    height,
    panX,
    panY,
    worldZoom,
    scale: clampedScale,
    pixelWidth: Math.max(1, Math.round(width * clampedScale)),
    pixelHeight: Math.max(1, Math.round(height * clampedScale)),
    wasDownscaled: clampedScale + 1e-4 < desiredScale,
    usedViewportFallback,
  };
}

export function orderElementsForExport(
  elements: Record<string, CanvasElement>
): OrderedExportElements {
  const strokes: DrawingStroke[] = [];
  const wires: WireElement[] = [];
  const positioned: Array<StickyNote | TextElement | ShapeElement | IconElement> = [];
  const order = new Map<string, number>();

  Object.entries(elements).forEach(([id, el], index) => {
    if (!el) return;
    order.set(id, index);
    if (el.type === 'stroke') {
      strokes.push(el);
    } else if (el.type === 'wire') {
      wires.push(el);
    } else {
      positioned.push(el);
    }
  });

  positioned.sort(
    (a, b) => getElementZ(a, order.get(a.id) ?? 0) - getElementZ(b, order.get(b.id) ?? 0)
  );

  return { strokes, wires, positioned };
}

export function computeWireArrowHead(
  tip: Point,
  reference: Point,
  strokeWidth: number
): { p1: Point; p2: Point } {
  const angle = Math.atan2(tip.y - reference.y, tip.x - reference.x);
  const headLen = Math.max(8, (strokeWidth || 3) * 2.5);
  return {
    p1: {
      x: tip.x - headLen * Math.cos(angle - Math.PI / 6),
      y: tip.y - headLen * Math.sin(angle - Math.PI / 6),
    },
    p2: {
      x: tip.x - headLen * Math.cos(angle + Math.PI / 6),
      y: tip.y - headLen * Math.sin(angle + Math.PI / 6),
    },
  };
}

export function sanitizeExportFilename(rawName: string, extension: string): string {
  const stripped = rawName
    .trim()
    .replace(/[/\\?%*:|"<>]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  const cleanExt = extension.replace(/^\.+/, '').toLowerCase() || 'png';
  const suffix = `.${cleanExt}`;
  const baseWithoutExt = stripped
    .replace(/\.(png|svg|jpe?g|webp|json)$/i, '')
    .replace(/\.+$/g, '');

  const base = baseWithoutExt || 'whiteboard';
  return `${base}${suffix}`;
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function buildBoardJsonExport(params: {
  roomId: string | null;
  roomName?: string;
  theme: 'light' | 'dark';
  elements: Record<string, CanvasElement>;
}): string {
  const elementList = Object.values(params.elements);
  return JSON.stringify(
    {
      app: 'Whiteboard.io',
      version: 1,
      exportedAt: new Date().toISOString(),
      roomId: params.roomId || 'solo',
      roomName: params.roomName || (params.roomId ? `Room ${params.roomId}` : 'Personal Canvas'),
      theme: params.theme,
      elementCount: elementList.length,
      elements: elementList,
    },
    null,
    2
  );
}
