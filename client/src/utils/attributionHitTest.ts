import type { CanvasElement, DrawingStroke, Point, WireElement } from '../types';
import { getElementBounds, routeWire } from './wireGeometry';
import { isStrokeHit } from './hitTesting';
import type { SpatialIndex } from './spatialIndex';

/**
 * Finds the topmost canvas element under a world-space coordinate for
 * attribution hover inspection.
 *
 * Order matches visual stacking: positioned DOM elements (topmost z-order
 * first), then freehand strokes (reverse draw order), then wires.
 */
export function findHoveredElementAtPoint(
  coords: Point,
  positionedElements: CanvasElement[],
  spatialIndex: SpatialIndex,
  wireElements: WireElement[],
  elements: Record<string, CanvasElement>,
  zoom = 1
): CanvasElement | null {
  // 1. Positioned DOM elements in reverse z-order (topmost first)
  for (let i = positionedElements.length - 1; i >= 0; i--) {
    const el = positionedElements[i];
    const bounds = getElementBounds(el);
    if (
      coords.x >= bounds.x &&
      coords.x <= bounds.x + bounds.width &&
      coords.y >= bounds.y &&
      coords.y <= bounds.y + bounds.height
    ) {
      return el;
    }
  }

  // 2. Freehand strokes from spatial index in reverse draw order
  const strokeCandidates = spatialIndex
    .queryPoint(coords)
    .filter((item) => item.element.type === 'stroke')
    .sort((a, b) => b.order - a.order);

  for (const item of strokeCandidates) {
    const stroke = item.element as DrawingStroke;
    if (isStrokeHit(stroke, coords, zoom)) {
      return stroke;
    }
  }

  // 3. Wires (check proximity to routed endpoints & midpoint curve sample)
  const wireTol = Math.max(8, 12 / Math.max(0.25, zoom));
  for (let i = wireElements.length - 1; i >= 0; i--) {
    const wire = wireElements[i];
    const fromEl = elements[wire.fromId];
    const toEl = elements[wire.toId];
    if (!fromEl || !toEl) continue;
    const route = routeWire(
      fromEl,
      toEl,
      wire.wireType || 'curve',
      wire.fromAnchor,
      wire.toAnchor
    );
    if (!route) continue;
    const samplePoints = route.controlPoints
      ? [route.fromPoint, route.controlPoints[0], route.midpoint, route.controlPoints[1], route.toPoint]
      : [route.fromPoint, route.midpoint, route.toPoint];
    for (let j = 0; j < samplePoints.length - 1; j++) {
      const a = samplePoints[j];
      const b = samplePoints[j + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((coords.x - a.x) * dx + (coords.y - a.y) * dy) / lenSq));
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      if (Math.hypot(coords.x - projX, coords.y - projY) <= wireTol) {
        return wire;
      }
    }
  }

  return null;
}
