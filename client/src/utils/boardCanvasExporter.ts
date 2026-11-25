import type {
  CanvasElement,
  DrawingStroke,
  IconElement,
  ShapeElement,
  StickyNote,
  TextElement,
  WireElement,
} from '../types';
import { routeWire } from './wireGeometry';
import {
  EXPORT_ICON_GLYPHS,
  computeExportScene,
  computeWireArrowHead,
  getBoardBackgroundFill,
  getBoardGridStroke,
  getExportFormatOption,
  orderElementsForExport,
  resolveExportBackground,
  resolveRenderColorTheme,
  resolveStrokeDisplayColor,
  resolveTextDisplayColor,
  resolveWireDisplayColor,
  type ExportBackground,
  type ExportFormat,
  type ExportScale,
  type ExportSceneMetrics,
  type ExportScope,
  type ExportViewportInfo,
} from './exportTypes';

export interface CanvasExportParams {
  elements: Record<string, CanvasElement>;
  viewport: ExportViewportInfo;
  scope: ExportScope;
  background: ExportBackground;
  appTheme: 'light' | 'dark';
  includeGrid: boolean;
  scale: ExportScale;
  format: Exclude<ExportFormat, 'svg' | 'json'>;
}

export interface CanvasExportResult {
  canvas: HTMLCanvasElement;
  scene: ExportSceneMetrics;
  effectiveBackground: ExportBackground;
}

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapCanvasLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = [];
  if (!text) return result;
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      result.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
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

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: DrawingStroke,
  colorTheme: 'light' | 'dark'
): void {
  const points = stroke.points;
  if (!points || points.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.isHighlighter ? stroke.size * 2.5 : stroke.size;
  const strokeColor = resolveStrokeDisplayColor(stroke.color, colorTheme);
  ctx.strokeStyle = strokeColor;
  ctx.globalAlpha = stroke.isHighlighter ? 0.35 : 1.0;

  if (points.length === 1) {
    ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawWire(
  ctx: CanvasRenderingContext2D,
  wire: WireElement,
  elements: Record<string, CanvasElement>,
  colorTheme: 'light' | 'dark'
): void {
  const sourceEl = elements[wire.fromId];
  const targetEl = elements[wire.toId];
  if (!sourceEl || !targetEl) return;

  const route = routeWire(sourceEl, targetEl, wire.wireType || 'curve', wire.fromAnchor, wire.toAnchor);
  if (!route) return;

  ctx.save();
  const effectiveWireColor = resolveWireDisplayColor(wire.color, colorTheme);
  const strokeWidth = wire.strokeWidth || 3;

  ctx.strokeStyle = effectiveWireColor;
  ctx.fillStyle = effectiveWireColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (wire.strokeStyle === 'dashed') {
    ctx.setLineDash([9, 6]);
  } else if (wire.strokeStyle === 'dotted') {
    ctx.setLineDash([3, 4]);
  }

  const path2d = new Path2D(route.svgPath);
  ctx.stroke(path2d);

  const fillHead = (tip: { x: number; y: number }, ref: { x: number; y: number }) => {
    const { p1, p2 } = computeWireArrowHead(tip, ref, strokeWidth);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
  };

  if (wire.arrowEnd !== false) {
    fillHead(route.toPoint, route.controlPoints ? route.controlPoints[1] : route.fromPoint);
  }
  if (wire.arrowStart) {
    fillHead(route.fromPoint, route.controlPoints ? route.controlPoints[0] : route.toPoint);
  }

  if (wire.label) {
    ctx.setLineDash([]);
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textMetrics = ctx.measureText(wire.label);
    const bgW = textMetrics.width + 12;
    const bgH = 18;
    ctx.fillStyle = colorTheme === 'dark' ? '#0f172a' : '#ffffff';
    ctx.beginPath();
    traceRoundedRect(ctx, route.midpoint.x - bgW / 2, route.midpoint.y - bgH / 2, bgW, bgH, 9);
    ctx.fill();
    ctx.strokeStyle = effectiveWireColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = effectiveWireColor;
    ctx.fillText(wire.label, route.midpoint.x, route.midpoint.y);
  }

  ctx.restore();
}

function drawSticky(
  ctx: CanvasRenderingContext2D,
  note: StickyNote,
  colorTheme: 'light' | 'dark'
): void {
  const noteWidth = note.width || 224;
  const noteHeight = note.height || 150;
  ctx.save();
  ctx.fillStyle = note.color || '#fef08a';
  ctx.strokeStyle = '#e2e8f0';
  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  traceRoundedRect(ctx, note.x, note.y, noteWidth, noteHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = colorTheme === 'dark' ? '#0f172a' : '#1e293b';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.beginPath();
  ctx.rect(note.x + 8, note.y + 8, noteWidth - 16, noteHeight - 16);
  ctx.clip();

  const lines = wrapCanvasLines(ctx, note.text || '', Math.max(24, noteWidth - 24));
  lines.forEach((line, idx) => {
    ctx.fillText(line, note.x + 12, note.y + 18 + idx * 18);
  });
  ctx.restore();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  element: TextElement,
  colorTheme: 'light' | 'dark'
): void {
  ctx.save();
  const textColor = resolveTextDisplayColor(element.color, colorTheme);
  const fontSize = element.fontSize || 18;
  const fontStyle = element.fontStyle || 'normal';
  const fontWeight = element.fontWeight || 'normal';
  ctx.fillStyle = textColor;
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${element.fontFamily || 'sans-serif'}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = element.textAlign || 'left';

  const lines = (element.text || '').split('\n');
  const maxWidth = Math.max(0, ...lines.map((line) => ctx.measureText(line || ' ').width));
  let anchorX = element.x;
  if (element.textAlign === 'center') anchorX = element.x + maxWidth / 2;
  else if (element.textAlign === 'right') anchorX = element.x + maxWidth;

  const lineHeight = fontSize * 1.25;
  lines.forEach((line, idx) => {
    const lineY = element.y + idx * lineHeight;
    ctx.fillText(line, anchorX, lineY);
    if (element.textDecoration === 'underline' && line) {
      const lineWidth = ctx.measureText(line).width;
      let startX = anchorX;
      if (element.textAlign === 'center') startX = anchorX - lineWidth / 2;
      else if (element.textAlign === 'right') startX = anchorX - lineWidth;
      ctx.beginPath();
      ctx.strokeStyle = textColor;
      ctx.lineWidth = Math.max(1, fontSize / 14);
      ctx.moveTo(startX, lineY + fontSize + 1);
      ctx.lineTo(startX + lineWidth, lineY + fontSize + 1);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement,
  colorTheme: 'light' | 'dark'
): void {
  ctx.save();
  ctx.globalAlpha = typeof shape.opacity === 'number' ? shape.opacity : 1;
  if (shape.rotation) {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((shape.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.strokeStyle = shape.color || '#0f172a';
  ctx.fillStyle =
    shape.fillColor && shape.fillColor !== 'transparent' ? shape.fillColor : 'transparent';
  ctx.lineWidth = shape.strokeWidth || 3;
  ctx.lineJoin = 'round';
  if (shape.strokeStyle === 'dashed') {
    ctx.setLineDash([9, 6]);
  } else if (shape.strokeStyle === 'dotted') {
    ctx.setLineDash([3, 4]);
  }
  ctx.beginPath();

  if (shape.shapeType === 'rectangle') {
    traceRoundedRect(ctx, shape.x, shape.y, shape.width, shape.height, 8);
  } else if (shape.shapeType === 'circle') {
    ctx.ellipse(
      shape.x + shape.width / 2,
      shape.y + shape.height / 2,
      shape.width / 2,
      shape.height / 2,
      0,
      0,
      Math.PI * 2
    );
  } else if (shape.shapeType === 'diamond') {
    ctx.moveTo(shape.x + shape.width / 2, shape.y);
    ctx.lineTo(shape.x + shape.width, shape.y + shape.height / 2);
    ctx.lineTo(shape.x + shape.width / 2, shape.y + shape.height);
    ctx.lineTo(shape.x, shape.y + shape.height / 2);
    ctx.closePath();
  } else if (shape.shapeType === 'triangle') {
    ctx.moveTo(shape.x + shape.width / 2, shape.y);
    ctx.lineTo(shape.x + shape.width, shape.y + shape.height);
    ctx.lineTo(shape.x, shape.y + shape.height);
    ctx.closePath();
  } else if (shape.shapeType === 'star') {
    const spikes = 5;
    const outerR = Math.min(shape.width, shape.height) / 2;
    const innerR = outerR * 0.45;
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (shape.shapeType === 'arrow') {
    const arrowH = shape.height * 0.4;
    const headW = Math.min(shape.width * 0.4, shape.height * 0.8);
    const yCenter = shape.y + shape.height / 2;
    ctx.moveTo(shape.x, yCenter - arrowH / 2);
    ctx.lineTo(shape.x + shape.width - headW, yCenter - arrowH / 2);
    ctx.lineTo(shape.x + shape.width - headW, shape.y);
    ctx.lineTo(shape.x + shape.width, yCenter);
    ctx.lineTo(shape.x + shape.width - headW, shape.y + shape.height);
    ctx.lineTo(shape.x + shape.width - headW, yCenter + arrowH / 2);
    ctx.lineTo(shape.x, yCenter + arrowH / 2);
    ctx.closePath();
  } else {
    ctx.rect(shape.x, shape.y, shape.width, shape.height);
  }

  if (shape.fillColor && shape.fillColor !== 'transparent') ctx.fill();
  ctx.stroke();

  if (shape.text) {
    const fontSize = shape.fontSize || 16;
    ctx.setLineDash([]);
    ctx.fillStyle = shape.textColor || (colorTheme === 'dark' ? '#f8fafc' : '#0f172a');
    ctx.font = `normal ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.beginPath();
    ctx.rect(
      shape.x + 6,
      shape.y + 6,
      Math.max(0, shape.width - 12),
      Math.max(0, shape.height - 12)
    );
    ctx.clip();
    const lines = wrapCanvasLines(ctx, shape.text, Math.max(10, shape.width - 16));
    const lineHeight = fontSize * 1.25;
    const startY = shape.y + shape.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, idx) => {
      ctx.fillText(line, shape.x + shape.width / 2, startY + idx * lineHeight);
    });
  }

  ctx.restore();
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: IconElement): void {
  const boxSize = (icon.size || 48) + 16;
  const cx = icon.x + boxSize / 2;
  const cy = icon.y + boxSize / 2;

  ctx.save();
  ctx.globalAlpha = typeof icon.opacity === 'number' ? icon.opacity : 1;
  ctx.translate(cx, cy);
  if (icon.rotation) ctx.rotate((icon.rotation * Math.PI) / 180);
  if (icon.flipH || icon.flipV) ctx.scale(icon.flipH ? -1 : 1, icon.flipV ? -1 : 1);

  if (icon.bgShape && icon.bgShape !== 'none') {
    ctx.fillStyle = icon.bgColor || 'rgba(148, 163, 184, 0.2)';
    ctx.beginPath();
    if (icon.bgShape === 'circle') {
      ctx.arc(0, 0, boxSize / 2, 0, Math.PI * 2);
    } else if (icon.bgShape === 'square') {
      ctx.rect(-boxSize / 2, -boxSize / 2, boxSize, boxSize);
    } else {
      traceRoundedRect(ctx, -boxSize / 2, -boxSize / 2, boxSize, boxSize, 8);
    }
    ctx.fill();
  }

  ctx.fillStyle = icon.color || '#3b82f6';
  ctx.font = `bold ${Math.max(16, (icon.size || 48) * 0.65)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const symbol = EXPORT_ICON_GLYPHS[icon.iconName] || '★';
  ctx.fillText(symbol, 0, 0);
  ctx.restore();
}

/**
 * Renders the whiteboard onto an offscreen HTMLCanvasElement at the requested
 * scope, resolution scale, background mode, and grid visibility.
 */
export function renderBoardToCanvas({
  elements,
  viewport,
  scope,
  background,
  appTheme,
  includeGrid,
  scale,
  format,
}: CanvasExportParams): CanvasExportResult {
  const effectiveBackground = resolveExportBackground(background, format, appTheme);
  const colorTheme = resolveRenderColorTheme(effectiveBackground, appTheme);
  const scene = computeExportScene(elements, viewport, { scope, scale, isVector: false });

  const canvas = document.createElement('canvas');
  canvas.width = scene.pixelWidth;
  canvas.height = scene.pixelHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { canvas, scene, effectiveBackground };
  }

  ctx.scale(scene.scale, scene.scale);

  const bgFill = getBoardBackgroundFill(effectiveBackground);
  if (bgFill) {
    ctx.fillStyle = bgFill;
    ctx.fillRect(0, 0, scene.width, scene.height);
  }

  const gridSize = 24 * scene.worldZoom;
  if (includeGrid && gridSize >= 4) {
    ctx.strokeStyle = getBoardGridStroke(colorTheme);
    ctx.lineWidth = 1;
    const startX = ((scene.panX % gridSize) + gridSize) % gridSize;
    const startY = ((scene.panY % gridSize) + gridSize) % gridSize;
    for (let x = startX; x < scene.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, scene.height);
      ctx.stroke();
    }
    for (let y = startY; y < scene.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(scene.width, y);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(scene.panX, scene.panY);
  ctx.scale(scene.worldZoom, scene.worldZoom);

  const { strokes, wires, positioned } = orderElementsForExport(elements);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke, colorTheme);
  }
  for (const wire of wires) {
    drawWire(ctx, wire, elements, colorTheme);
  }
  for (const el of positioned) {
    if (el.type === 'sticky') drawSticky(ctx, el, colorTheme);
    else if (el.type === 'text') drawText(ctx, el, colorTheme);
    else if (el.type === 'shape') drawShape(ctx, el, colorTheme);
    else if (el.type === 'icon') drawIcon(ctx, el);
  }

  ctx.restore();

  return { canvas, scene, effectiveBackground };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ''] = dataUrl.split(',');
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export async function canvasToRasterBlob(
  canvas: HTMLCanvasElement,
  format: Exclude<ExportFormat, 'svg' | 'json'>,
  quality = 0.92
): Promise<{ blob: Blob; usedPngFallback: boolean }> {
  const mimeType = getExportFormatOption(format).mimeType;
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), mimeType, quality);
  });

  if (blob && blob.type === mimeType) {
    return { blob, usedPngFallback: false };
  }
  if (blob && blob.type === 'image/png') {
    return { blob, usedPngFallback: format !== 'png' };
  }

  const dataUrl = canvas.toDataURL(mimeType, quality);
  const fallbackBlob = dataUrlToBlob(dataUrl);
  return {
    blob: fallbackBlob,
    usedPngFallback: fallbackBlob.type !== mimeType,
  };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
