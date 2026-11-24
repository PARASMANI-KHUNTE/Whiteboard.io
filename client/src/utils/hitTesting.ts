import { Point } from '../types';
import { squaredDistanceToSegment } from './strokeSimplification';

export const DEFAULT_SCREEN_HIT_TOLERANCE = 12;
export const DEFAULT_WIRE_HIT_PX = 24;

/**
 * Calculates world-space hit tolerance for a stroke given screen-pixel tolerance and zoom.
 */
export function computeStrokeHitTolerance(
  strokeSize = 3,
  zoom = 1,
  screenTolerance = DEFAULT_SCREEN_HIT_TOLERANCE
): number {
  const safeZoom = Math.max(0.01, zoom || 1);
  return screenTolerance / safeZoom + (strokeSize || 3) / 2;
}

/**
 * Hit tests a point against a drawing stroke using point-to-segment distance,
 * normalized by zoom so clicks anywhere along simplified segments register reliably.
 */
export function isStrokeHit(
  stroke: { points?: Point[]; size?: number },
  pt: Point,
  zoom = 1,
  screenTolerance = DEFAULT_SCREEN_HIT_TOLERANCE
): boolean {
  const points = stroke.points;
  if (!points || points.length === 0) return false;

  const hitTolerance = computeStrokeHitTolerance(stroke.size, zoom, screenTolerance);
  const hitTolerance2 = hitTolerance * hitTolerance;

  if (points.length === 1) {
    const dx = points[0].x - pt.x;
    const dy = points[0].y - pt.y;
    return dx * dx + dy * dy <= hitTolerance2;
  }

  for (let i = 0; i < points.length - 1; i++) {
    if (squaredDistanceToSegment(pt, points[i], points[i + 1]) <= hitTolerance2) {
      return true;
    }
  }

  return false;
}

/**
 * Computes world-space SVG strokeWidth for an invisible wire hit-test path
 * so that the clickable area remains approximately constant in screen pixels regardless of zoom.
 */
export function computeWireHitStrokeWidth(
  wireStrokeWidth = 3,
  zoom = 1,
  desiredScreenPx = DEFAULT_WIRE_HIT_PX
): number {
  const safeZoom = Math.max(0.01, zoom || 1);
  return Math.max(desiredScreenPx / safeZoom, (wireStrokeWidth || 3) + 12 / safeZoom);
}
