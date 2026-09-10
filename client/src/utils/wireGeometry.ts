import { CanvasElement, Point, AnchorPosition, WireStyle } from '../types';

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WireRoutingResult {
  fromPoint: Point;
  toPoint: Point;
  fromAnchor: 'top' | 'right' | 'bottom' | 'left';
  toAnchor: 'top' | 'right' | 'bottom' | 'left';
  svgPath: string;
  midpoint: Point;
  controlPoints?: [Point, Point];
}

/**
 * Get the rectangular bounding box for any CanvasElement.
 */
export function getElementBounds(el: CanvasElement): ElementBounds {
  if (el.type === 'shape') {
    return {
      x: el.x,
      y: el.y,
      width: Math.max(30, el.width || 160),
      height: Math.max(30, el.height || 120),
    };
  }

  if (el.type === 'sticky') {
    return {
      x: el.x,
      y: el.y,
      width: Math.max(60, el.width || 224),
      height: Math.max(40, el.height || 150),
    };
  }

  if (el.type === 'text') {
    const fontSize = el.fontSize || 18;
    const textLen = el.text ? el.text.length : 6;
    const estimatedWidth = Math.max(60, Math.min(600, textLen * (fontSize * 0.6) + 24));
    const estimatedHeight = Math.max(32, fontSize * 1.6 + 12);
    return {
      x: el.x,
      y: el.y,
      width: estimatedWidth,
      height: estimatedHeight,
    };
  }

  if (el.type === 'icon') {
    const size = Math.max(24, el.size || 48);
    return {
      x: el.x,
      y: el.y,
      width: size,
      height: size,
    };
  }

  if (el.type === 'stroke') {
    const points = el.points || [];
    if (points.length === 0) {
      return { x: 0, y: 0, width: 20, height: 20 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(20, maxX - minX),
      height: Math.max(20, maxY - minY),
    };
  }

  // Fallback
  return {
    x: (el as any).x || 0,
    y: (el as any).y || 0,
    width: (el as any).width || 100,
    height: (el as any).height || 100,
  };
}

/**
 * Returns the four anchor points for an element.
 */
export function getElementAnchors(bounds: ElementBounds): Record<'top' | 'right' | 'bottom' | 'left', Point> {
  return {
    top: { x: bounds.x + bounds.width / 2, y: bounds.y },
    right: { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    bottom: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    left: { x: bounds.x, y: bounds.y + bounds.height / 2 },
  };
}

/**
 * Resolves an anchor name to a point.
 */
export function getAnchorPoint(bounds: ElementBounds, anchor: AnchorPosition): Point {
  const anchors = getElementAnchors(bounds);
  if (anchor === 'top') return anchors.top;
  if (anchor === 'right') return anchors.right;
  if (anchor === 'bottom') return anchors.bottom;
  if (anchor === 'left') return anchors.left;
  // Default to center
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/**
 * Normal vector direction for each cardinal anchor.
 */
const ANCHOR_VECTORS: Record<'top' | 'right' | 'bottom' | 'left', Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/**
 * Automatically calculates the cleanest anchor pair between two bounding boxes.
 */
export function getOptimalAnchors(
  boundsA: ElementBounds,
  boundsB: ElementBounds,
  preferredFrom?: AnchorPosition,
  preferredTo?: AnchorPosition
): {
  fromAnchor: 'top' | 'right' | 'bottom' | 'left';
  toAnchor: 'top' | 'right' | 'bottom' | 'left';
  fromPoint: Point;
  toPoint: Point;
} {
  const anchorsA = getElementAnchors(boundsA);
  const anchorsB = getElementAnchors(boundsB);

  // If both anchors are explicitly provided, use them
  if (preferredFrom && preferredFrom !== 'auto' && preferredTo && preferredTo !== 'auto') {
    return {
      fromAnchor: preferredFrom,
      toAnchor: preferredTo,
      fromPoint: anchorsA[preferredFrom],
      toPoint: anchorsB[preferredTo],
    };
  }

  const centerA = { x: boundsA.x + boundsA.width / 2, y: boundsA.y + boundsA.height / 2 };
  const centerB = { x: boundsB.x + boundsB.width / 2, y: boundsB.y + boundsB.height / 2 };

  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;

  let fromAnchor: 'top' | 'right' | 'bottom' | 'left';
  let toAnchor: 'top' | 'right' | 'bottom' | 'left';

  // Compare horizontal vs vertical dominance
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      fromAnchor = 'right';
      toAnchor = 'left';
    } else {
      fromAnchor = 'left';
      toAnchor = 'right';
    }
  } else {
    if (dy >= 0) {
      fromAnchor = 'bottom';
      toAnchor = 'top';
    } else {
      fromAnchor = 'top';
      toAnchor = 'bottom';
    }
  }

  // Override if one was explicitly chosen
  if (preferredFrom && preferredFrom !== 'auto') {
    fromAnchor = preferredFrom;
  }
  if (preferredTo && preferredTo !== 'auto') {
    toAnchor = preferredTo;
  }

  return {
    fromAnchor,
    toAnchor,
    fromPoint: anchorsA[fromAnchor],
    toPoint: anchorsB[toAnchor],
  };
}

/**
 * Generates an SVG path and control points for a straight line or smooth bezier curve.
 */
export function calculateWireRoute(
  fromPoint: Point,
  toPoint: Point,
  fromAnchor: 'top' | 'right' | 'bottom' | 'left',
  toAnchor: 'top' | 'right' | 'bottom' | 'left',
  wireType: WireStyle
): { svgPath: string; midpoint: Point; controlPoints?: [Point, Point] } {
  if (wireType === 'line') {
    const midpoint = {
      x: (fromPoint.x + toPoint.x) / 2,
      y: (fromPoint.y + toPoint.y) / 2,
    };
    return {
      svgPath: `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`,
      midpoint,
    };
  }

  // Smooth Bezier Curve
  const v1 = ANCHOR_VECTORS[fromAnchor];
  const v2 = ANCHOR_VECTORS[toAnchor];

  const dist = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
  const curvature = Math.max(30, Math.min(220, dist * 0.45));

  const cp1: Point = {
    x: fromPoint.x + v1.x * curvature,
    y: fromPoint.y + v1.y * curvature,
  };

  const cp2: Point = {
    x: toPoint.x + v2.x * curvature,
    y: toPoint.y + v2.y * curvature,
  };

  // Evaluate cubic bezier at t = 0.5 for midpoint
  // B(0.5) = 0.125 * P0 + 0.375 * P1 + 0.375 * P2 + 0.125 * P3
  const midpoint: Point = {
    x: 0.125 * fromPoint.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * toPoint.x,
    y: 0.125 * fromPoint.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * toPoint.y,
  };

  const svgPath = `M ${fromPoint.x} ${fromPoint.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${toPoint.x} ${toPoint.y}`;

  return {
    svgPath,
    midpoint,
    controlPoints: [cp1, cp2],
  };
}

/**
 * Full routing calculation for a wire between two elements.
 */
export function routeWire(
  sourceEl: CanvasElement,
  targetEl: CanvasElement,
  wireType: WireStyle = 'curve',
  fromAnchorPref?: AnchorPosition,
  toAnchorPref?: AnchorPosition
): WireRoutingResult | null {
  if (!sourceEl || !targetEl) return null;

  const boundsA = getElementBounds(sourceEl);
  const boundsB = getElementBounds(targetEl);

  const { fromAnchor, toAnchor, fromPoint, toPoint } = getOptimalAnchors(
    boundsA,
    boundsB,
    fromAnchorPref,
    toAnchorPref
  );

  const { svgPath, midpoint, controlPoints } = calculateWireRoute(
    fromPoint,
    toPoint,
    fromAnchor,
    toAnchor,
    wireType
  );

  return {
    fromPoint,
    toPoint,
    fromAnchor,
    toAnchor,
    svgPath,
    midpoint,
    controlPoints,
  };
}

/**
 * Route a wire drafting from a source element to an arbitrary cursor point.
 */
export function routeDraftWire(
  sourceEl: CanvasElement,
  cursorPoint: Point,
  wireType: WireStyle = 'curve',
  fromAnchorPref?: AnchorPosition
): { svgPath: string; fromPoint: Point; toPoint: Point } {
  const boundsA = getElementBounds(sourceEl);
  const anchorsA = getElementAnchors(boundsA);

  let fromAnchor: 'top' | 'right' | 'bottom' | 'left' = 'right';

  if (fromAnchorPref && fromAnchorPref !== 'auto') {
    fromAnchor = fromAnchorPref;
  } else {
    const centerA = { x: boundsA.x + boundsA.width / 2, y: boundsA.y + boundsA.height / 2 };
    const dx = cursorPoint.x - centerA.x;
    const dy = cursorPoint.y - centerA.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      fromAnchor = dx >= 0 ? 'right' : 'left';
    } else {
      fromAnchor = dy >= 0 ? 'bottom' : 'top';
    }
  }

  const fromPoint = anchorsA[fromAnchor];
  const toPoint = cursorPoint;

  if (wireType === 'line') {
    return {
      svgPath: `M ${fromPoint.x} ${fromPoint.y} L ${toPoint.x} ${toPoint.y}`,
      fromPoint,
      toPoint,
    };
  }

  const v1 = ANCHOR_VECTORS[fromAnchor];
  const dist = Math.hypot(toPoint.x - fromPoint.x, toPoint.y - fromPoint.y);
  const curvature = Math.max(30, Math.min(180, dist * 0.4));

  const cp1: Point = {
    x: fromPoint.x + v1.x * curvature,
    y: fromPoint.y + v1.y * curvature,
  };

  const svgPath = `M ${fromPoint.x} ${fromPoint.y} Q ${cp1.x} ${cp1.y}, ${toPoint.x} ${toPoint.y}`;

  return {
    svgPath,
    fromPoint,
    toPoint,
  };
}
