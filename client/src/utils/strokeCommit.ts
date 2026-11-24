import type { DrawingStroke } from '../types';
import { simplifyStrokePoints } from './strokeSimplification';

/**
 * Returns the stroke to persist and broadcast, or null when there is nothing
 * worth committing. Used by both normal pointer-up and gesture interruption
 * (e.g. a second finger starting a pinch) so both paths treat live strokes
 * identically.
 */
export function finalizeStrokeForCommit(
  stroke: DrawingStroke | null,
  zoom: number
): DrawingStroke | null {
  if (!stroke || stroke.points.length === 0) return null;

  const tolerance = 0.75 / Math.max(zoom, 0.01);
  const simplified = simplifyStrokePoints(stroke.points, tolerance);
  return simplified.length === stroke.points.length
    ? stroke
    : { ...stroke, points: simplified };
}
