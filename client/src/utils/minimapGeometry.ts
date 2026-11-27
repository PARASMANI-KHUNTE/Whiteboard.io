import type { CanvasElement } from '../types';
import { getElementBounds } from './wireGeometry';

export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MinimapElementBox extends MinimapRect {
  id: string;
  color: string;
}

export interface MinimapCollaborator {
  id: string;
  name: string;
  color: string;
  cursor?: { x: number; y: number; isDrawing?: boolean };
}

export interface MinimapCursorMarker {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  isDrawing: boolean;
}

export interface MinimapScene {
  worldMinX: number;
  worldMinY: number;
  worldWidth: number;
  worldHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  boxWidth: number;
  boxHeight: number;
  elements: MinimapElementBox[];
  cursors: MinimapCursorMarker[];
  viewport: MinimapRect;
}

/**
 * Projects world-space canvas elements and the active camera viewport into a
 * compact minimap box, preserving aspect ratio cleanly.
 */
export function computeMinimapScene(
  elements: Record<string, CanvasElement>,
  pan: { x: number; y: number },
  zoom: number,
  viewportW: number,
  viewportH: number,
  boxWidth = 176,
  boxHeight = 112,
  collaborators: MinimapCollaborator[] = []
): MinimapScene {
  const safeZoom = Math.max(0.1, zoom || 1);
  const vpWorldX = -pan.x / safeZoom;
  const vpWorldY = -pan.y / safeZoom;
  const vpWorldW = Math.max(100, viewportW) / safeZoom;
  const vpWorldH = Math.max(100, viewportH) / safeZoom;

  let minX = vpWorldX;
  let minY = vpWorldY;
  let maxX = vpWorldX + vpWorldW;
  let maxY = vpWorldY + vpWorldH;

  const rawItems: Array<{ id: string; x: number; y: number; width: number; height: number; color: string }> = [];

  for (const el of Object.values(elements)) {
    if (!el || el.type === 'wire') continue;
    const b = getElementBounds(el);
    if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.width) || !isFinite(b.height)) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
    rawItems.push({
      id: el.id,
      x: b.x,
      y: b.y,
      width: Math.max(4, b.width),
      height: Math.max(4, b.height),
      color: 'color' in el && typeof el.color === 'string' && el.color ? el.color : '#3b82f6',
    });
  }

  // Keep collaborator cursors in frame even when they are outside the visible
  // viewport or beyond the bounds of every element on the board.
  for (const collaborator of collaborators) {
    const cursor = collaborator.cursor;
    if (!cursor || !isFinite(cursor.x) || !isFinite(cursor.y)) continue;
    minX = Math.min(minX, cursor.x);
    minY = Math.min(minY, cursor.y);
    maxX = Math.max(maxX, cursor.x);
    maxY = Math.max(maxY, cursor.y);
  }

  const pad = 120;
  const worldMinX = minX - pad;
  const worldMinY = minY - pad;
  const worldWidth = Math.max(400, maxX - minX + pad * 2);
  const worldHeight = Math.max(260, maxY - minY + pad * 2);

  const innerPad = 6;
  const usableW = boxWidth - innerPad * 2;
  const usableH = boxHeight - innerPad * 2;
  const scale = Math.min(usableW / worldWidth, usableH / worldHeight);
  const offsetX = innerPad + (usableW - worldWidth * scale) / 2;
  const offsetY = innerPad + (usableH - worldHeight * scale) / 2;

  const projectX = (wx: number) => offsetX + (wx - worldMinX) * scale;
  const projectY = (wy: number) => offsetY + (wy - worldMinY) * scale;

  const scene: MinimapScene = {
    worldMinX,
    worldMinY,
    worldWidth,
    worldHeight,
    scale,
    offsetX,
    offsetY,
    boxWidth,
    boxHeight,
    elements: rawItems.map((item) => ({
      id: item.id,
      x: projectX(item.x),
      y: projectY(item.y),
      width: Math.max(2.5, item.width * scale),
      height: Math.max(2.5, item.height * scale),
      color: item.color,
    })),
    cursors: [],
    viewport: {
      x: projectX(vpWorldX),
      y: projectY(vpWorldY),
      width: Math.max(10, vpWorldW * scale),
      height: Math.max(8, vpWorldH * scale),
    },
  };

  return { ...scene, cursors: projectMinimapCursors(collaborators, scene) };
}

/** Projects live collaborator cursors from world space into minimap coordinates. */
export function projectMinimapCursors(
  collaborators: MinimapCollaborator[],
  scene: MinimapScene
): MinimapCursorMarker[] {
  return collaborators.flatMap((collaborator) => {
    const cursor = collaborator.cursor;
    if (!cursor || !isFinite(cursor.x) || !isFinite(cursor.y)) return [];
    return [{
      id: collaborator.id,
      name: collaborator.name || 'Collaborator',
      color: collaborator.color || '#3b82f6',
      x: scene.offsetX + (cursor.x - scene.worldMinX) * scene.scale,
      y: scene.offsetY + (cursor.y - scene.worldMinY) * scene.scale,
      isDrawing: Boolean(cursor.isDrawing),
    }];
  });
}

/**
 * Converts a pointer coordinate inside the minimap SVG back into a camera pan
 * that centers the viewport on that world location.
 */
export function minimapPointToWorldPan(
  localX: number,
  localY: number,
  scene: MinimapScene,
  viewportW: number,
  viewportH: number,
  zoom: number
): { x: number; y: number } {
  const safeZoom = Math.max(0.1, zoom || 1);
  const worldX = scene.worldMinX + (localX - scene.offsetX) / scene.scale;
  const worldY = scene.worldMinY + (localY - scene.offsetY) / scene.scale;
  return {
    x: viewportW / 2 - worldX * safeZoom,
    y: viewportH / 2 - worldY * safeZoom,
  };
}
