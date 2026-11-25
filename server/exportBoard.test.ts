import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EXPORT_FORMAT_OPTIONS,
  MAX_RASTER_DIMENSION,
  buildBoardJsonExport,
  computeElementsBoundingBox,
  computeExportScene,
  formatByteSize,
  getExportFormatOption,
  orderElementsForExport,
  resolveExportBackground,
  sanitizeExportFilename,
} from '../client/src/utils/exportTypes';
import { renderBoardToSvg } from '../client/src/utils/boardSvgExporter';
import type { CanvasElement } from '../client/src/types';

function sampleElements(): Record<string, CanvasElement> {
  return {
    rect1: {
      id: 'rect1',
      type: 'shape',
      shapeType: 'rectangle',
      x: 100,
      y: 120,
      width: 180,
      height: 100,
      color: '#0f172a',
      fillColor: '#dbeafe',
      strokeWidth: 3,
      text: 'Gateway & Auth',
      userId: 'u1',
      updatedAt: 10,
      zIndex: 1,
    },
    sticky1: {
      id: 'sticky1',
      type: 'sticky',
      x: 420,
      y: 110,
      width: 224,
      height: 150,
      text: 'Note <important> & safe',
      color: '#fef08a',
      userId: 'u1',
      userName: 'Alice',
      updatedAt: 20,
      zIndex: 2,
    },
    stroke1: {
      id: 'stroke1',
      type: 'stroke',
      points: [
        { x: 50, y: 60 },
        { x: 80, y: 95 },
      ],
      color: '#000000',
      size: 4,
      userId: 'u1',
      createdAt: 15,
    },
    wire1: {
      id: 'wire1',
      type: 'wire',
      fromId: 'rect1',
      toId: 'sticky1',
      wireType: 'curve',
      color: '#3b82f6',
      strokeWidth: 3,
      arrowEnd: true,
      label: 'flows to',
      userId: 'u1',
      updatedAt: 25,
    },
    icon1: {
      id: 'icon1',
      type: 'icon',
      iconName: 'rocket',
      x: 340,
      y: 280,
      size: 48,
      color: '#2563eb',
      bgShape: 'circle',
      userId: 'u1',
      updatedAt: 30,
      zIndex: 0,
    },
  };
}

test('export formats declare PNG, SVG, JPEG, WebP, and JSON with accurate alpha support (#206)', () => {
  const ids = EXPORT_FORMAT_OPTIONS.map((opt) => opt.id);
  assert.deepEqual(ids, ['png', 'svg', 'jpeg', 'webp', 'json']);

  assert.equal(getExportFormatOption('png').supportsTransparency, true);
  assert.equal(getExportFormatOption('svg').supportsTransparency, true);
  assert.equal(getExportFormatOption('webp').supportsTransparency, true);
  assert.equal(getExportFormatOption('jpeg').supportsTransparency, false);
  assert.equal(getExportFormatOption('json').supportsTransparency, false);

  assert.equal(resolveExportBackground('transparent', 'jpeg', 'dark'), 'dark');
  assert.equal(resolveExportBackground('transparent', 'png', 'dark'), 'transparent');
  assert.equal(resolveExportBackground('transparent', 'svg', 'light'), 'transparent');
});

test('computeElementsBoundingBox and computeExportScene crop to board and guard oversized canvases (#206)', () => {
  const emptyBounds = computeElementsBoundingBox({});
  assert.equal(emptyBounds, null);

  const viewport = { pan: { x: -40, y: -20 }, zoom: 1.5, width: 1280, height: 720 };
  const emptyBoardScene = computeExportScene({}, viewport, { scope: 'board', scale: 2 });
  assert.equal(emptyBoardScene.usedViewportFallback, true);
  assert.equal(emptyBoardScene.pixelWidth, 2560);
  assert.equal(emptyBoardScene.pixelHeight, 1440);

  const elements = sampleElements();
  const bounds = computeElementsBoundingBox(elements);
  assert.ok(bounds !== null);
  assert.ok(bounds.x < 50);
  assert.ok(bounds.y < 60);
  assert.ok(bounds.x + bounds.width >= 644);

  const boardScene = computeExportScene(elements, viewport, { scope: 'board', scale: 2 });
  assert.equal(boardScene.usedViewportFallback, false);
  assert.equal(boardScene.scale, 2);
  assert.equal(boardScene.pixelWidth, boardScene.width * 2);

  // Huge board must scale down cleanly rather than blowing browser canvas memory.
  const hugeElements: Record<string, CanvasElement> = {
    far1: {
      id: 'far1',
      type: 'shape',
      shapeType: 'rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      color: '#000000',
      strokeWidth: 2,
      userId: 'u1',
      updatedAt: 1,
    },
    far2: {
      id: 'far2',
      type: 'shape',
      shapeType: 'rectangle',
      x: 5000,
      y: 5000,
      width: 100,
      height: 100,
      color: '#000000',
      strokeWidth: 2,
      userId: 'u1',
      updatedAt: 2,
    },
  };
  const capped = computeExportScene(hugeElements, viewport, { scope: 'board', scale: 3 });
  assert.equal(capped.wasDownscaled, true);
  assert.ok(capped.pixelWidth <= MAX_RASTER_DIMENSION);
  assert.ok(capped.pixelHeight <= MAX_RASTER_DIMENSION);
});

test('orderElementsForExport preserves global zIndex stacking across element types (#206)', () => {
  const ordered = orderElementsForExport(sampleElements());
  assert.deepEqual(
    ordered.positioned.map((el) => el.id),
    ['icon1', 'rect1', 'sticky1']
  );
});

test('renderBoardToSvg produces valid escaped vector SVG with grid, transparency, and adaptive colors (#206)', () => {
  const elements = sampleElements();
  const viewport = { pan: { x: 0, y: 0 }, zoom: 1, width: 1000, height: 600 };

  const darkSvg = renderBoardToSvg({
    elements,
    viewport,
    scope: 'board',
    background: 'dark',
    appTheme: 'light',
    includeGrid: true,
    roomName: 'System <Architecture>',
  });

  assert.match(darkSvg.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(darkSvg.svg, /<title>System &lt;Architecture&gt;<\/title>/);
  assert.match(darkSvg.svg, /Note &lt;important&gt; &amp; safe/);
  assert.match(darkSvg.svg, /id="wb-export-grid"/);
  assert.match(darkSvg.svg, /fill="#0b0f19"/);
  // Black freehand stroke adapts to white in dark background exports
  assert.match(darkSvg.svg, /stroke="#ffffff"/);
  assert.match(darkSvg.svg, /flows to/);
  assert.match(darkSvg.svg, /🚀/);

  const transparentSvg = renderBoardToSvg({
    elements,
    viewport,
    scope: 'viewport',
    background: 'transparent',
    appTheme: 'light',
    includeGrid: false,
  });

  assert.doesNotMatch(transparentSvg.svg, /<rect width="100%" height="100%"/);
  assert.doesNotMatch(transparentSvg.svg, /id="wb-export-grid"/);
});

test('filename sanitization, byte size formatting, and JSON payload export (#206)', () => {
  assert.equal(sanitizeExportFilename('  team:plan/v2  ', 'svg'), 'team-plan-v2.svg');
  assert.equal(sanitizeExportFilename('diagram.png', 'webp'), 'diagram.webp');
  assert.equal(sanitizeExportFilename('', 'json'), 'whiteboard.json');

  assert.equal(formatByteSize(512), '512 B');
  assert.equal(formatByteSize(2048), '2.0 KB');
  assert.equal(formatByteSize(1_572_864), '1.50 MB');

  const json = buildBoardJsonExport({
    roomId: 'ROOM42',
    roomName: 'Sprint Planning',
    theme: 'dark',
    elements: sampleElements(),
  });
  const parsed = JSON.parse(json) as {
    app: string;
    roomId: string;
    elementCount: number;
    elements: unknown[];
  };
  assert.equal(parsed.app, 'Whiteboard.io');
  assert.equal(parsed.roomId, 'ROOM42');
  assert.equal(parsed.elementCount, 5);
  assert.equal(parsed.elements.length, 5);
});

test('ExportModal, App, Canvas, and CSS wire live preview, formats, and shortcut (#206)', () => {
  const modal = readFileSync(
    new URL('../client/src/components/ExportModal.tsx', import.meta.url),
    'utf8'
  );
  const app = readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  const canvas = readFileSync(new URL('../client/src/components/Canvas.tsx', import.meta.url), 'utf8');
  const actions = readFileSync(
    new URL('../client/src/hooks/useWhiteboardActions.ts', import.meta.url),
    'utf8'
  );
  const css = readFileSync(new URL('../client/src/index.css', import.meta.url), 'utf8');

  assert.match(modal, /id="export-preview-stage"/);
  assert.match(modal, /id="export-preview-image"/);
  assert.match(modal, /id="export-json-preview"/);
  assert.match(modal, /id="export-download-btn"/);
  assert.match(modal, /EXPORT_FORMAT_OPTIONS\.map/);
  assert.match(app, /<ExportModal/);
  assert.match(app, /showExportModal/);
  assert.match(canvas, /e\.shiftKey && key === 'e'/);
  assert.match(actions, /Ctrl\+Shift\+E/);
  assert.match(css, /\.wb-checkerboard/);
});
