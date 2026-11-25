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
  orderElementsForExport,
  resolveExportBackground,
  resolveRenderColorTheme,
  resolveStrokeDisplayColor,
  resolveTextDisplayColor,
  resolveWireDisplayColor,
  wrapTextByCharBudget,
  type ExportBackground,
  type ExportSceneMetrics,
  type ExportScope,
  type ExportViewportInfo,
} from './exportTypes';

export interface SvgExportParams {
  elements: Record<string, CanvasElement>;
  viewport: ExportViewportInfo;
  scope: ExportScope;
  background: ExportBackground;
  appTheme: 'light' | 'dark';
  includeGrid: boolean;
  roomName?: string;
}

export interface SvgExportResult {
  svg: string;
  scene: ExportSceneMetrics;
  effectiveBackground: ExportBackground;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '0';
}

function positiveMod(value: number, period: number): number {
  if (period <= 0) return 0;
  return ((value % period) + period) % period;
}

function dashArrayAttr(style?: 'solid' | 'dashed' | 'dotted'): string {
  if (style === 'dashed') return ' stroke-dasharray="9 6"';
  if (style === 'dotted') return ' stroke-dasharray="3 4"';
  return '';
}

function renderStrokeSvg(stroke: DrawingStroke, colorTheme: 'light' | 'dark'): string {
  const points = stroke.points;
  if (!points || points.length === 0) return '';

  const lineWidth = stroke.isHighlighter ? stroke.size * 2.5 : stroke.size;
  const color = escapeXml(resolveStrokeDisplayColor(stroke.color, colorTheme));
  const opacityAttr = stroke.isHighlighter ? ' opacity="0.35"' : '';

  if (points.length === 1) {
    return `<circle cx="${fmt(points[0].x)}" cy="${fmt(points[0].y)}" r="${fmt(lineWidth / 2)}" fill="${color}"${opacityAttr} />`;
  }

  const commands: string[] = [`M ${fmt(points[0].x)} ${fmt(points[0].y)}`];
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    commands.push(`Q ${fmt(points[i].x)} ${fmt(points[i].y)} ${fmt(midX)} ${fmt(midY)}`);
  }
  const last = points[points.length - 1];
  commands.push(`L ${fmt(last.x)} ${fmt(last.y)}`);

  return `<path d="${commands.join(' ')}" fill="none" stroke="${color}" stroke-width="${fmt(lineWidth)}" stroke-linecap="round" stroke-linejoin="round"${opacityAttr} />`;
}

function renderWireSvg(
  wire: WireElement,
  elements: Record<string, CanvasElement>,
  colorTheme: 'light' | 'dark'
): string {
  const sourceEl = elements[wire.fromId];
  const targetEl = elements[wire.toId];
  if (!sourceEl || !targetEl) return '';

  const route = routeWire(sourceEl, targetEl, wire.wireType || 'curve', wire.fromAnchor, wire.toAnchor);
  if (!route) return '';

  const color = escapeXml(resolveWireDisplayColor(wire.color, colorTheme));
  const strokeWidth = wire.strokeWidth || 3;
  const parts: string[] = [
    `<path d="${route.svgPath}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${dashArrayAttr(wire.strokeStyle)} />`,
  ];

  if (wire.arrowEnd !== false) {
    const ref = route.controlPoints ? route.controlPoints[1] : route.fromPoint;
    const { p1, p2 } = computeWireArrowHead(route.toPoint, ref, strokeWidth);
    parts.push(
      `<polygon points="${fmt(route.toPoint.x)},${fmt(route.toPoint.y)} ${fmt(p1.x)},${fmt(p1.y)} ${fmt(p2.x)},${fmt(p2.y)}" fill="${color}" />`
    );
  }

  if (wire.arrowStart) {
    const ref = route.controlPoints ? route.controlPoints[0] : route.toPoint;
    const { p1, p2 } = computeWireArrowHead(route.fromPoint, ref, strokeWidth);
    parts.push(
      `<polygon points="${fmt(route.fromPoint.x)},${fmt(route.fromPoint.y)} ${fmt(p1.x)},${fmt(p1.y)} ${fmt(p2.x)},${fmt(p2.y)}" fill="${color}" />`
    );
  }

  if (wire.label) {
    const bgFill = colorTheme === 'dark' ? '#0f172a' : '#ffffff';
    const bgW = Math.max(24, wire.label.length * 6.8 + 14);
    const bgH = 18;
    parts.push(
      `<rect x="${fmt(route.midpoint.x - bgW / 2)}" y="${fmt(route.midpoint.y - bgH / 2)}" width="${fmt(bgW)}" height="${bgH}" rx="9" fill="${bgFill}" stroke="${color}" stroke-width="1" />`,
      `<text x="${fmt(route.midpoint.x)}" y="${fmt(route.midpoint.y)}" fill="${color}" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle" dominant-baseline="central">${escapeXml(wire.label)}</text>`
    );
  }

  return `<g>${parts.join('')}</g>`;
}

function renderStickySvg(
  note: StickyNote,
  colorTheme: 'light' | 'dark',
  clipId: string
): string {
  const noteWidth = note.width || 224;
  const noteHeight = note.height || 150;
  const fill = escapeXml(note.color || '#fef08a');
  const textColor = colorTheme === 'dark' ? '#0f172a' : '#1e293b';
  const lines = wrapTextByCharBudget(note.text || '', Math.max(24, noteWidth - 24), 14);
  const tspans = lines
    .map(
      (line, idx) =>
        `<tspan x="${fmt(note.x + 12)}" y="${fmt(note.y + 18 + idx * 18)}">${escapeXml(line || ' ')}</tspan>`
    )
    .join('');

  return `<g>
    <clipPath id="${clipId}"><rect x="${fmt(note.x + 8)}" y="${fmt(note.y + 8)}" width="${fmt(Math.max(0, noteWidth - 16))}" height="${fmt(Math.max(0, noteHeight - 16))}" /></clipPath>
    <rect x="${fmt(note.x)}" y="${fmt(note.y)}" width="${fmt(noteWidth)}" height="${fmt(noteHeight)}" rx="8" fill="${fill}" stroke="#e2e8f0" stroke-width="1" />
    <text fill="${textColor}" font-family="sans-serif" font-size="14" dominant-baseline="text-before-edge" clip-path="url(#${clipId})">${tspans}</text>
  </g>`;
}

function renderTextSvg(el: TextElement, colorTheme: 'light' | 'dark'): string {
  const color = escapeXml(resolveTextDisplayColor(el.color, colorTheme));
  const fontSize = el.fontSize || 18;
  const fontFamily = escapeXml(el.fontFamily || 'sans-serif');
  const fontStyle = el.fontStyle || 'normal';
  const fontWeight = el.fontWeight || 'normal';
  const lines = (el.text || '').split('\n');
  const maxWidth = Math.max(10, ...lines.map((l) => l.length)) * (fontSize * 0.58);

  let anchorX = el.x;
  let textAnchor = 'start';
  if (el.textAlign === 'center') {
    anchorX = el.x + maxWidth / 2;
    textAnchor = 'middle';
  } else if (el.textAlign === 'right') {
    anchorX = el.x + maxWidth;
    textAnchor = 'end';
  }

  const lineHeight = fontSize * 1.25;
  const decoration = el.textDecoration === 'underline' ? ' text-decoration="underline"' : '';
  const tspans = lines
    .map(
      (line, idx) =>
        `<tspan x="${fmt(anchorX)}" y="${fmt(el.y + idx * lineHeight)}">${escapeXml(line || ' ')}</tspan>`
    )
    .join('');

  return `<text fill="${color}" font-family="${fontFamily}" font-size="${fmt(fontSize)}" font-style="${fontStyle}" font-weight="${fontWeight}" text-anchor="${textAnchor}" dominant-baseline="text-before-edge"${decoration}>${tspans}</text>`;
}

function shapeGeometrySvg(shape: ShapeElement, stroke: string, fill: string): string {
  const { x, y, width, height, shapeType } = shape;
  const strokeWidth = fmt(shape.strokeWidth || 3);
  const dash = dashArrayAttr(shape.strokeStyle);
  const styleAttrs = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dash}`;

  if (shapeType === 'rectangle') {
    return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" rx="8" ${styleAttrs} />`;
  }
  if (shapeType === 'circle') {
    return `<ellipse cx="${fmt(x + width / 2)}" cy="${fmt(y + height / 2)}" rx="${fmt(width / 2)}" ry="${fmt(height / 2)}" ${styleAttrs} />`;
  }
  if (shapeType === 'diamond') {
    const pts = `${fmt(x + width / 2)},${fmt(y)} ${fmt(x + width)},${fmt(y + height / 2)} ${fmt(x + width / 2)},${fmt(y + height)} ${fmt(x)},${fmt(y + height / 2)}`;
    return `<polygon points="${pts}" ${styleAttrs} />`;
  }
  if (shapeType === 'triangle') {
    const pts = `${fmt(x + width / 2)},${fmt(y)} ${fmt(x + width)},${fmt(y + height)} ${fmt(x)},${fmt(y + height)}`;
    return `<polygon points="${pts}" ${styleAttrs} />`;
  }
  if (shapeType === 'star') {
    const spikes = 5;
    const outerR = Math.min(width, height) / 2;
    const innerR = outerR * 0.45;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const pts: string[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      pts.push(`${fmt(cx + Math.cos(a) * r)},${fmt(cy + Math.sin(a) * r)}`);
    }
    return `<polygon points="${pts.join(' ')}" ${styleAttrs} />`;
  }
  if (shapeType === 'arrow') {
    const arrowH = height * 0.4;
    const headW = Math.min(width * 0.4, height * 0.8);
    const yc = y + height / 2;
    const pts = [
      `${fmt(x)},${fmt(yc - arrowH / 2)}`,
      `${fmt(x + width - headW)},${fmt(yc - arrowH / 2)}`,
      `${fmt(x + width - headW)},${fmt(y)}`,
      `${fmt(x + width)},${fmt(yc)}`,
      `${fmt(x + width - headW)},${fmt(y + height)}`,
      `${fmt(x + width - headW)},${fmt(yc + arrowH / 2)}`,
      `${fmt(x)},${fmt(yc + arrowH / 2)}`,
    ].join(' ');
    return `<polygon points="${pts}" ${styleAttrs} />`;
  }
  return `<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${fmt(height)}" ${styleAttrs} />`;
}

function renderShapeSvg(
  shape: ShapeElement,
  colorTheme: 'light' | 'dark',
  clipId: string
): string {
  const stroke = escapeXml(shape.color || '#0f172a');
  const fill = escapeXml(
    shape.fillColor && shape.fillColor !== 'transparent' ? shape.fillColor : 'none'
  );
  const opacity = typeof shape.opacity === 'number' ? ` opacity="${fmt(shape.opacity)}"` : '';
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const transform = shape.rotation
    ? ` transform="rotate(${fmt(shape.rotation)} ${fmt(cx)} ${fmt(cy)})"`
    : '';

  let labelSvg = '';
  if (shape.text) {
    const fontSize = shape.fontSize || 16;
    const textColor = escapeXml(shape.textColor || (colorTheme === 'dark' ? '#f8fafc' : '#0f172a'));
    const lines = wrapTextByCharBudget(shape.text, Math.max(10, shape.width - 16), fontSize);
    const lineHeight = fontSize * 1.25;
    const startY = shape.y + shape.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    const tspans = lines
      .map(
        (line, idx) =>
          `<tspan x="${fmt(cx)}" y="${fmt(startY + idx * lineHeight)}">${escapeXml(line || ' ')}</tspan>`
      )
      .join('');

    labelSvg = `<clipPath id="${clipId}"><rect x="${fmt(shape.x + 6)}" y="${fmt(shape.y + 6)}" width="${fmt(Math.max(0, shape.width - 12))}" height="${fmt(Math.max(0, shape.height - 12))}" /></clipPath>
    <text fill="${textColor}" font-family="sans-serif" font-size="${fmt(fontSize)}" text-anchor="middle" dominant-baseline="central" clip-path="url(#${clipId})">${tspans}</text>`;
  }

  return `<g${opacity}${transform}>${shapeGeometrySvg(shape, stroke, fill)}${labelSvg}</g>`;
}

function renderIconSvg(icon: IconElement): string {
  const boxSize = (icon.size || 48) + 16;
  const cx = icon.x + boxSize / 2;
  const cy = icon.y + boxSize / 2;
  const transforms: string[] = [`translate(${fmt(cx)} ${fmt(cy)})`];
  if (icon.rotation) transforms.push(`rotate(${fmt(icon.rotation)})`);
  if (icon.flipH || icon.flipV) transforms.push(`scale(${icon.flipH ? -1 : 1} ${icon.flipV ? -1 : 1})`);

  const opacity = typeof icon.opacity === 'number' ? ` opacity="${fmt(icon.opacity)}"` : '';
  const parts: string[] = [];

  if (icon.bgShape && icon.bgShape !== 'none') {
    const bgColor = escapeXml(icon.bgColor || 'rgba(148, 163, 184, 0.2)');
    if (icon.bgShape === 'circle') {
      parts.push(`<circle cx="0" cy="0" r="${fmt(boxSize / 2)}" fill="${bgColor}" />`);
    } else if (icon.bgShape === 'square') {
      parts.push(`<rect x="${fmt(-boxSize / 2)}" y="${fmt(-boxSize / 2)}" width="${fmt(boxSize)}" height="${fmt(boxSize)}" fill="${bgColor}" />`);
    } else {
      parts.push(`<rect x="${fmt(-boxSize / 2)}" y="${fmt(-boxSize / 2)}" width="${fmt(boxSize)}" height="${fmt(boxSize)}" rx="8" fill="${bgColor}" />`);
    }
  }

  const symbol = EXPORT_ICON_GLYPHS[icon.iconName] || '★';
  const fill = escapeXml(icon.color || '#3b82f6');
  const fontSize = Math.max(16, (icon.size || 48) * 0.65);
  parts.push(
    `<text x="0" y="0" fill="${fill}" font-family="sans-serif" font-size="${fmt(fontSize)}" font-weight="bold" text-anchor="middle" dominant-baseline="central">${escapeXml(symbol)}</text>`
  );

  return `<g${opacity} transform="${transforms.join(' ')}">${parts.join('')}</g>`;
}

/**
 * Serializes the whiteboard (or current viewport) into a standalone vector SVG document.
 */
export function renderBoardToSvg({
  elements,
  viewport,
  scope,
  background,
  appTheme,
  includeGrid,
  roomName,
}: SvgExportParams): SvgExportResult {
  const effectiveBackground = resolveExportBackground(background, 'svg', appTheme);
  const colorTheme = resolveRenderColorTheme(effectiveBackground, appTheme);
  const scene = computeExportScene(elements, viewport, { scope, scale: 1, isVector: true });

  const defsParts: string[] = [];
  const bgFill = getBoardBackgroundFill(effectiveBackground);
  const gridStep = 24 * scene.worldZoom;
  const drawGrid = includeGrid && gridStep >= 4;

  if (drawGrid) {
    const gridColor = getBoardGridStroke(colorTheme);
    const offsetX = positiveMod(scene.panX, gridStep);
    const offsetY = positiveMod(scene.panY, gridStep);
    defsParts.push(
      `<pattern id="wb-export-grid" width="${fmt(gridStep)}" height="${fmt(gridStep)}" patternUnits="userSpaceOnUse" patternTransform="translate(${fmt(offsetX)} ${fmt(offsetY)})">
        <path d="M ${fmt(gridStep)} 0 L 0 0 0 ${fmt(gridStep)}" fill="none" stroke="${gridColor}" stroke-width="1" />
      </pattern>`
    );
  }

  const { strokes, wires, positioned } = orderElementsForExport(elements);
  const worldParts: string[] = [];

  for (const stroke of strokes) {
    const rendered = renderStrokeSvg(stroke, colorTheme);
    if (rendered) worldParts.push(rendered);
  }
  for (const wire of wires) {
    const rendered = renderWireSvg(wire, elements, colorTheme);
    if (rendered) worldParts.push(rendered);
  }
  positioned.forEach((el, index) => {
    if (el.type === 'sticky') {
      worldParts.push(renderStickySvg(el, colorTheme, `wb-clip-sticky-${index}`));
    } else if (el.type === 'text') {
      worldParts.push(renderTextSvg(el, colorTheme));
    } else if (el.type === 'shape') {
      worldParts.push(renderShapeSvg(el, colorTheme, `wb-clip-shape-${index}`));
    } else if (el.type === 'icon') {
      worldParts.push(renderIconSvg(el));
    }
  });

  const titleNode = roomName ? `<title>${escapeXml(roomName)}</title>` : '';
  const defsNode = defsParts.length > 0 ? `<defs>${defsParts.join('')}</defs>` : '';
  const bgNode = bgFill ? `<rect width="100%" height="100%" fill="${bgFill}" />` : '';
  const gridNode = drawGrid ? `<rect width="100%" height="100%" fill="url(#wb-export-grid)" />` : '';
  const worldGroup = `<g transform="translate(${fmt(scene.panX)} ${fmt(scene.panY)}) scale(${fmt(scene.worldZoom)})">${worldParts.join('')}</g>`;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">`,
    titleNode,
    defsNode,
    bgNode,
    gridNode,
    worldGroup,
    `</svg>`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    svg,
    scene,
    effectiveBackground,
  };
}
