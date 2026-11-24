import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeRotatedResize,
  getRotatedResizeCursor,
  type ResizeCorner,
} from '../client/src/utils/shapeResize';

function getAnchorWorldPos(
  corner: ResizeCorner,
  pos: { x: number; y: number },
  size: { width: number; height: number },
  rotationDeg: number
) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const signX = corner === 'ne' || corner === 'se' ? 1 : -1;
  const signY = corner === 'sw' || corner === 'se' ? 1 : -1;

  const cx = pos.x + size.width / 2;
  const cy = pos.y + size.height / 2;

  // Anchor is opposite corner
  const anchorLocalX = -signX * (size.width / 2);
  const anchorLocalY = -signY * (size.height / 2);

  return {
    x: cx + (anchorLocalX * cos - anchorLocalY * sin),
    y: cy + (anchorLocalX * sin + anchorLocalY * cos),
  };
}

test('computeRotatedResize preserves anchor and dimensions on unrotated (0 deg) shapes', () => {
  const initialPos = { x: 100, y: 100 };
  const initialSize = { width: 100, height: 100 };

  // Dragging SE by (20, 30)
  const seResult = computeRotatedResize({
    corner: 'se',
    initialPos,
    initialSize,
    rotationDeg: 0,
    deltaX: 20,
    deltaY: 30,
  });

  assert.equal(Math.round(seResult.width), 120);
  assert.equal(Math.round(seResult.height), 130);
  assert.equal(Math.round(seResult.x), 100);
  assert.equal(Math.round(seResult.y), 100);

  // Dragging NW by (20, 30)
  const nwResult = computeRotatedResize({
    corner: 'nw',
    initialPos,
    initialSize,
    rotationDeg: 0,
    deltaX: 20,
    deltaY: 30,
  });

  assert.equal(Math.round(nwResult.width), 80);
  assert.equal(Math.round(nwResult.height), 70);
  assert.equal(Math.round(nwResult.x), 120);
  assert.equal(Math.round(nwResult.y), 130);
});

test('computeRotatedResize resizes along visual axis for a 45 deg rotated shape (#94)', () => {
  const initialPos = { x: 100, y: 100 };
  const initialSize = { width: 100, height: 100 };
  const rotationDeg = 45;

  const preAnchor = getAnchorWorldPos('se', initialPos, initialSize, rotationDeg);

  // For a 45 deg rotated square, the SE corner points straight down (0, +1) in screen/world space.
  // Moving down by 20 * sqrt(2) extends both width and height by 20 along the local axes.
  const deltaY = 20 * Math.SQRT2;
  const result = computeRotatedResize({
    corner: 'se',
    initialPos,
    initialSize,
    rotationDeg,
    deltaX: 0,
    deltaY,
  });

  assert.ok(Math.abs(result.width - 120) < 1e-4, `Expected width ~120, got ${result.width}`);
  assert.ok(Math.abs(result.height - 120) < 1e-4, `Expected height ~120, got ${result.height}`);

  const postAnchor = getAnchorWorldPos(
    'se',
    { x: result.x, y: result.y },
    { width: result.width, height: result.height },
    rotationDeg
  );

  const anchorDrift = Math.hypot(postAnchor.x - preAnchor.x, postAnchor.y - preAnchor.y);
  assert.ok(anchorDrift < 1e-6, `Anchor drifted by ${anchorDrift}`);
});

test('computeRotatedResize maintains invariant anchor corner across all 4 corners', () => {
  const initialPos = { x: 150, y: 220 };
  const initialSize = { width: 120, height: 80 };
  const corners: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

  for (const corner of corners) {
    for (const angle of [0, 30, 45, 90, 135, 270]) {
      const preAnchor = getAnchorWorldPos(corner, initialPos, initialSize, angle);

      const result = computeRotatedResize({
        corner,
        initialPos,
        initialSize,
        rotationDeg: angle,
        deltaX: 15,
        deltaY: -25,
      });

      const postAnchor = getAnchorWorldPos(
        corner,
        { x: result.x, y: result.y },
        { width: result.width, height: result.height },
        angle
      );

      const anchorDrift = Math.hypot(postAnchor.x - preAnchor.x, postAnchor.y - preAnchor.y);
      assert.ok(
        anchorDrift < 1e-6,
        `Anchor drifted for corner ${corner} at ${angle} deg: drift=${anchorDrift}`
      );
    }
  }
});

test('computeRotatedResize respects minimum width and height constraints', () => {
  const initialPos = { x: 100, y: 100 };
  const initialSize = { width: 100, height: 100 };

  // For a 45 deg shape, moving straight up (deltaY = -200) drags SE past the anchor
  const result = computeRotatedResize({
    corner: 'se',
    initialPos,
    initialSize,
    rotationDeg: 45,
    deltaX: 0,
    deltaY: -200,
    minWidth: 40,
    minHeight: 40,
  });

  assert.equal(result.width, 40);
  assert.equal(result.height, 40);
});

test('getRotatedResizeCursor returns appropriate directional cursor based on rotation', () => {
  // At 0 deg:
  assert.equal(getRotatedResizeCursor('nw', 0), 'nwse-resize');
  assert.equal(getRotatedResizeCursor('ne', 0), 'nesw-resize');
  assert.equal(getRotatedResizeCursor('se', 0), 'nwse-resize');
  assert.equal(getRotatedResizeCursor('sw', 0), 'nesw-resize');

  // At 45 deg:
  assert.equal(getRotatedResizeCursor('nw', 45), 'ns-resize');
  assert.equal(getRotatedResizeCursor('ne', 45), 'ew-resize');
  assert.equal(getRotatedResizeCursor('se', 45), 'ns-resize');
  assert.equal(getRotatedResizeCursor('sw', 45), 'ew-resize');

  // At 90 deg:
  assert.equal(getRotatedResizeCursor('nw', 90), 'nesw-resize');
  assert.equal(getRotatedResizeCursor('ne', 90), 'nwse-resize');
  assert.equal(getRotatedResizeCursor('se', 90), 'nesw-resize');
  assert.equal(getRotatedResizeCursor('sw', 90), 'nwse-resize');

  // Angle normalization (> 360 deg and negative angles)
  assert.equal(getRotatedResizeCursor('nw', 405), 'ns-resize');
  assert.equal(getRotatedResizeCursor('nw', -315), 'ns-resize');
});
