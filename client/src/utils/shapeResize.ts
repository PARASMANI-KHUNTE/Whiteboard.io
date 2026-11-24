export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export interface RotatedResizeInput {
  corner: ResizeCorner;
  initialPos: { x: number; y: number };
  initialSize: { width: number; height: number };
  rotationDeg: number;
  deltaX: number;
  deltaY: number;
  minWidth?: number;
  minHeight?: number;
}

export interface RotatedResizeResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes updated position (x, y) and dimensions (width, height) when resizing
 * a shape rotated around its center by rotationDeg.
 *
 * Keeps the opposite corner (anchor) invariant in world/canvas space.
 */
export function computeRotatedResize({
  corner,
  initialPos,
  initialSize,
  rotationDeg,
  deltaX,
  deltaY,
  minWidth = 40,
  minHeight = 40,
}: RotatedResizeInput): RotatedResizeResult {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Direction signs of the dragged corner relative to center:
  // nw: (-1, -1), ne: (+1, -1), sw: (-1, +1), se: (+1, +1)
  const signX = corner === 'ne' || corner === 'se' ? 1 : -1;
  const signY = corner === 'sw' || corner === 'se' ? 1 : -1;

  // Initial center in world space
  const cx0 = initialPos.x + initialSize.width / 2;
  const cy0 = initialPos.y + initialSize.height / 2;

  // Anchor is the opposite corner relative to center
  const anchorLocalX = -signX * (initialSize.width / 2);
  const anchorLocalY = -signY * (initialSize.height / 2);

  const anchorWorldX = cx0 + (anchorLocalX * cos - anchorLocalY * sin);
  const anchorWorldY = cy0 + (anchorLocalX * sin + anchorLocalY * cos);

  // Dragged corner initial world position
  const draggedLocalX0 = signX * (initialSize.width / 2);
  const draggedLocalY0 = signY * (initialSize.height / 2);

  const draggedWorldX0 = cx0 + (draggedLocalX0 * cos - draggedLocalY0 * sin);
  const draggedWorldY0 = cy0 + (draggedLocalX0 * sin + draggedLocalY0 * cos);

  // Dragged corner with pointer offset in world space
  const draggedWorldX = draggedWorldX0 + deltaX;
  const draggedWorldY = draggedWorldY0 + deltaY;

  // Vector from anchor to dragged corner in world space
  const vWorldX = draggedWorldX - anchorWorldX;
  const vWorldY = draggedWorldY - anchorWorldY;

  // Un-rotate vector into the element's local coordinate space
  const vLocalX = vWorldX * cos + vWorldY * sin;
  const vLocalY = -vWorldX * sin + vWorldY * cos;

  // Tentative width and height along the element's axes
  const tentativeWidth = vLocalX * signX;
  const tentativeHeight = vLocalY * signY;

  const newWidth = Math.max(minWidth, tentativeWidth);
  const newHeight = Math.max(minHeight, tentativeHeight);

  // Recalculate center so that anchorWorld remains pinned
  const anchorNewLocalX = -signX * (newWidth / 2);
  const anchorNewLocalY = -signY * (newHeight / 2);

  const rotOffsetX = anchorNewLocalX * cos - anchorNewLocalY * sin;
  const rotOffsetY = anchorNewLocalX * sin + anchorNewLocalY * cos;

  const newCx = anchorWorldX - rotOffsetX;
  const newCy = anchorWorldY - rotOffsetY;

  return {
    x: newCx - newWidth / 2,
    y: newCy - newHeight / 2,
    width: newWidth,
    height: newHeight,
  };
}

/**
 * Returns the appropriate CSS cursor for a resize handle on a rotated shape.
 */
export function getRotatedResizeCursor(corner: ResizeCorner, rotationDeg: number): string {
  const baseAngles: Record<ResizeCorner, number> = {
    nw: 315,
    ne: 45,
    se: 135,
    sw: 225,
  };
  const normalized = ((rotationDeg % 360) + 360) % 360;
  const effective = (baseAngles[corner] + normalized) % 360;

  if (effective >= 337.5 || effective < 22.5 || (effective >= 157.5 && effective < 202.5)) {
    return 'ns-resize';
  }
  if ((effective >= 22.5 && effective < 67.5) || (effective >= 202.5 && effective < 247.5)) {
    return 'nesw-resize';
  }
  if ((effective >= 67.5 && effective < 112.5) || (effective >= 247.5 && effective < 292.5)) {
    return 'ew-resize';
  }
  return 'nwse-resize';
}
