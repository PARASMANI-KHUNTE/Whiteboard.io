import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSnapAndGuides } from '../client/src/utils/alignmentGuides';
import type { ShapeElement } from '../client/src/types';

function makeShape(id: string, x: number, y: number, width = 100, height = 80): ShapeElement {
  return {
    id,
    type: 'shape',
    shapeType: 'rectangle',
    x,
    y,
    width,
    height,
    color: '#000',
    strokeWidth: 2,
    userId: 'u1',
    updatedAt: 100,
  };
}

test('computeSnapAndGuides snaps edges/centers and emits guide segments (#222)', () => {
  const neighbor = makeShape('neighbor', 200, 100, 120, 80); // x in [200, 320], centerX 260, y in [100, 180], centerY 140
  const result = computeSnapAndGuides({
    movingId: 'moving',
    candidateBounds: { x: 204, y: 143, width: 80, height: 60 }, // centerY=173 vs neighbor? wait: top 143 vs centerY 140 -> 3px diff!
    positionedElements: [neighbor],
    zoom: 1,
    snapToGrid: false,
  });

  // Left edge snapped to neighbor left edge (200), top edge snapped to neighbor centerY (140)
  assert.equal(result.x, 200);
  assert.equal(result.y, 140);
  assert.equal(result.guides.length, 2);
  assert.deepEqual(
    result.guides.map((g) => g.axis).sort(),
    ['x', 'y']
  );
});

test('computeSnapAndGuides falls back to grid snap and respects Alt bypass (#222)', () => {
  const neighbor = makeShape('far', 800, 800, 100, 80);
  const gridSnapped = computeSnapAndGuides({
    movingId: 'moving',
    candidateBounds: { x: 29, y: 47, width: 100, height: 80 },
    positionedElements: [neighbor],
    zoom: 1,
    snapToGrid: true,
    gridSize: 24,
  });
  assert.equal(gridSnapped.x, 24);
  assert.equal(gridSnapped.y, 48);
  assert.equal(gridSnapped.guides.length, 0);

  const bypassed = computeSnapAndGuides({
    movingId: 'moving',
    candidateBounds: { x: 802, y: 802, width: 100, height: 80 },
    positionedElements: [neighbor],
    zoom: 1,
    snapToGrid: true,
    disableSnap: true,
  });
  assert.equal(bypassed.x, 802);
  assert.equal(bypassed.y, 802);
  assert.equal(bypassed.guides.length, 0);
});
