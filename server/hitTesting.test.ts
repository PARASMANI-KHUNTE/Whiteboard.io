import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStrokeHit,
  computeStrokeHitTolerance,
  computeWireHitStrokeWidth,
} from '../client/src/utils/hitTesting';

test('isStrokeHit selects a simplified long stroke in the middle between stored points (#90)', () => {
  // Stroke with only two points spanning 1000 world units along the x axis
  const stroke = {
    points: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
    ],
    size: 4,
  };

  // Click directly on the segment at x = 500, y = 3
  assert.equal(isStrokeHit(stroke, { x: 500, y: 3 }, 1.0), true);

  // Click far away at x = 500, y = 80
  assert.equal(isStrokeHit(stroke, { x: 500, y: 80 }, 1.0), false);
});

test('isStrokeHit normalizes hit tolerance across zoom levels (#90)', () => {
  const stroke = {
    points: [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
    ],
    size: 4,
  };

  // At zoom = 0.25 (zoomed out):
  // 10 screen pixels translates to 40 world units.
  // A click at y = 130 is 30 world units away = 7.5 screen pixels away (within tolerance).
  assert.equal(isStrokeHit(stroke, { x: 200, y: 130 }, 0.25), true);

  // At zoom = 3.0 (zoomed in):
  // 30 world units away translates to 90 screen pixels away!
  // It must NOT select when clicking that far away on screen.
  assert.equal(isStrokeHit(stroke, { x: 200, y: 130 }, 3.0), false);

  // But clicking 2 world units away (6 screen pixels at zoom 3.0) DOES hit.
  assert.equal(isStrokeHit(stroke, { x: 200, y: 102 }, 3.0), true);
});

test('isStrokeHit supports single-point dots and handles empty strokes safely', () => {
  const dot = {
    points: [{ x: 50, y: 50 }],
    size: 6,
  };

  assert.equal(isStrokeHit(dot, { x: 53, y: 54 }, 1.0), true);
  assert.equal(isStrokeHit(dot, { x: 80, y: 80 }, 1.0), false);

  assert.equal(isStrokeHit({ points: [] }, { x: 0, y: 0 }, 1.0), false);
  assert.equal(isStrokeHit({}, { x: 0, y: 0 }, 1.0), false);
});

test('computeWireHitStrokeWidth maintains constant screen-pixel clickable area across zoom levels (#90)', () => {
  // Test across low, normal, and high zoom levels
  const zooms = [0.25, 0.5, 1.0, 2.0, 3.0];

  for (const zoom of zooms) {
    const worldWidth = computeWireHitStrokeWidth(3, zoom, 24);
    const screenPx = worldWidth * zoom;

    // The effective rendered screen width should be at least 24 screen pixels at all zoom levels
    assert.ok(
      screenPx >= 24,
      `Expected screenPx >= 24 at zoom ${zoom}, got ${screenPx}`
    );
  }
});

test('computeStrokeHitTolerance scales inversely with zoom', () => {
  const tol1 = computeStrokeHitTolerance(4, 1.0, 12);
  const tol025 = computeStrokeHitTolerance(4, 0.25, 12);
  const tol3 = computeStrokeHitTolerance(4, 3.0, 12);

  assert.equal(tol1, 14); // 12/1 + 2
  assert.equal(tol025, 50); // 12/0.25 + 2
  assert.equal(tol3, 6); // 12/3 + 2
});
