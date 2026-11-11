import { Point } from '../types';

/** Squared distance from a point to a line segment. */
export function squaredDistanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return px * px + py * py;
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = p.x - (a.x + t * dx);
  const py = p.y - (a.y + t * dy);
  return px * px + py * py;
}

/** Distance from a point to a line segment. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  return Math.sqrt(squaredDistanceToSegment(p, a, b));
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  );
}

/** True when two line segments intersect (including touching / collinear). */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    return true;
  }

  // Collinear / touching cases
  if (o1 === 0 && onSegment(a1, a2, b1)) return true;
  if (o2 === 0 && onSegment(a1, a2, b2)) return true;
  if (o3 === 0 && onSegment(b1, b2, a1)) return true;
  if (o4 === 0 && onSegment(b1, b2, a2)) return true;
  return false;
}

/**
 * Minimum distance between two line segments. Used by the eraser to test the
 * whole eraser path against a whole stroke edge in O(1) instead of sampling the
 * path and re-walking every stroke segment for each sample.
 */
export function segmentDistance(a1: Point, a2: Point, b1: Point, b2: Point): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.sqrt(
    Math.min(
      squaredDistanceToSegment(a1, b1, b2),
      squaredDistanceToSegment(a2, b1, b2),
      squaredDistanceToSegment(b1, a1, a2),
      squaredDistanceToSegment(b2, a1, a2)
    )
  );
}

/** True when the segment intersects an axis-aligned rectangle. */
export function segmentIntersectsRect(a: Point, b: Point, rect: { x: number; y: number; width: number; height: number }): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  const inside = (p: Point) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (inside(a) || inside(b)) return true;

  const tl = { x: left, y: top };
  const tr = { x: right, y: top };
  const br = { x: right, y: bottom };
  const bl = { x: left, y: bottom };

  return (
    segmentsIntersect(a, b, tl, tr) ||
    segmentsIntersect(a, b, tr, br) ||
    segmentsIntersect(a, b, br, bl) ||
    segmentsIntersect(a, b, bl, tl)
  );
}

/**
 * Ramer–Douglas–Peucker polyline simplification (iterative, so very long
 * strokes cannot overflow the call stack).
 *
 * `tolerance` is in world units; pass a screen-derived value
 * (e.g. `0.75 / zoom`) to drop points the user cannot visually distinguish.
 * Endpoints are always preserved.
 */
export function simplifyStrokePoints(points: Point[], tolerance = 1): Point[] {
  const n = points.length;
  if (n <= 2) return points;

  const tol = Math.max(0, tolerance);
  const tol2 = tol * tol;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;

  const stack: Array<[number, number]> = [[0, n - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;

    let maxDist2 = -1;
    let farthest = -1;
    for (let i = start + 1; i < end; i++) {
      const d2 = squaredDistanceToSegment(points[i], points[start], points[end]);
      if (d2 > maxDist2) {
        maxDist2 = d2;
        farthest = i;
      }
    }

    if (farthest !== -1 && maxDist2 > tol2) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }

  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}

/** Removes consecutive duplicate / near-duplicate points. */
export function dedupeConsecutivePoints(points: Point[], minDistance = 0.01): Point[] {
  if (points.length <= 1) return points;
  const min2 = minDistance * minDistance;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const dx = points[i].x - prev.x;
    const dy = points[i].y - prev.y;
    if (dx * dx + dy * dy > min2) result.push(points[i]);
  }
  return result;
}
