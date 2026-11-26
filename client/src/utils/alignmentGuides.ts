import type { CanvasElement } from '../types';
import { getElementBounds, type ElementBounds } from './wireGeometry';

export const DEFAULT_GRID_SIZE = 24;
export const DEFAULT_SNAP_SCREEN_PX = 6;

export interface AlignmentGuide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: AlignmentGuide[];
}

export interface ComputeSnapInput {
  movingId: string;
  candidateBounds: ElementBounds;
  positionedElements: CanvasElement[];
  zoom?: number;
  snapToGrid?: boolean;
  gridSize?: number;
  disableSnap?: boolean;
}

/**
 * Resolves edge/center alignment snapping against sibling positioned elements,
 * falling back to optional grid snapping when no element alignment wins on an
 * axis. Holding Alt (`disableSnap`) bypasses snapping smoothly.
 */
export function computeSnapAndGuides({
  movingId,
  candidateBounds,
  positionedElements,
  zoom = 1,
  snapToGrid = false,
  gridSize = DEFAULT_GRID_SIZE,
  disableSnap = false,
}: ComputeSnapInput): SnapResult {
  if (disableSnap) {
    return { x: candidateBounds.x, y: candidateBounds.y, guides: [] };
  }

  const tol = DEFAULT_SNAP_SCREEN_PX / Math.max(0.25, zoom);
  const { x, y, width, height } = candidateBounds;

  const candXEdges = [
    { offset: 0, value: x },
    { offset: width / 2, value: x + width / 2 },
    { offset: width, value: x + width },
  ];
  const candYEdges = [
    { offset: 0, value: y },
    { offset: height / 2, value: y + height / 2 },
    { offset: height, value: y + height },
  ];

  let bestX: { dist: number; snappedX: number; guidePos: number; other: ElementBounds } | null = null;
  let bestY: { dist: number; snappedY: number; guidePos: number; other: ElementBounds } | null = null;

  for (const el of positionedElements) {
    if (el.id === movingId) continue;
    const b = getElementBounds(el);
    const targetXs = [b.x, b.x + b.width / 2, b.x + b.width];
    const targetYs = [b.y, b.y + b.height / 2, b.y + b.height];

    for (const c of candXEdges) {
      for (const tx of targetXs) {
        const dist = Math.abs(c.value - tx);
        if (dist <= tol && (!bestX || dist < bestX.dist)) {
          bestX = { dist, snappedX: tx - c.offset, guidePos: tx, other: b };
        }
      }
    }

    for (const c of candYEdges) {
      for (const ty of targetYs) {
        const dist = Math.abs(c.value - ty);
        if (dist <= tol && (!bestY || dist < bestY.dist)) {
          bestY = { dist, snappedY: ty - c.offset, guidePos: ty, other: b };
        }
      }
    }
  }

  let finalX = x;
  let finalY = y;
  const guides: AlignmentGuide[] = [];

  if (bestX) {
    finalX = Math.round(bestX.snappedX);
    guides.push({
      axis: 'x',
      position: bestX.guidePos,
      start: Math.min(y, bestX.other.y) - 12,
      end: Math.max(y + height, bestX.other.y + bestX.other.height) + 12,
    });
  } else if (snapToGrid && gridSize > 0) {
    finalX = Math.round(x / gridSize) * gridSize;
  }

  if (bestY) {
    finalY = Math.round(bestY.snappedY);
    guides.push({
      axis: 'y',
      position: bestY.guidePos,
      start: Math.min(x, bestY.other.x) - 12,
      end: Math.max(x + width, bestY.other.x + bestY.other.width) + 12,
    });
  } else if (snapToGrid && gridSize > 0) {
    finalY = Math.round(y / gridSize) * gridSize;
  }

  return { x: finalX, y: finalY, guides };
}
