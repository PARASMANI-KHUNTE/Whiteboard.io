import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanvasElement } from '../client/src/types';
import { getElementZ, reorderZIndex } from '../client/src/utils/zOrder';

const sticky: CanvasElement = {
  id: 'sticky-1',
  type: 'sticky',
  x: 10,
  y: 10,
  width: 200,
  height: 200,
  text: 'Hello',
  color: '#fef08a',
  userId: 'u1',
  userName: 'Alice',
  updatedAt: 100,
  zIndex: 0,
};

const shape: CanvasElement = {
  id: 'shape-1',
  type: 'shape',
  shapeType: 'rectangle',
  x: 50,
  y: 50,
  width: 150,
  height: 150,
  color: '#3b82f6',
  fillColor: 'transparent',
  strokeWidth: 2,
  strokeStyle: 'solid',
  userId: 'u1',
  updatedAt: 100,
  zIndex: 1,
};

const text: CanvasElement = {
  id: 'text-1',
  type: 'text',
  x: 80,
  y: 80,
  text: 'Text block',
  color: '#000000',
  fontSize: 16,
  fontFamily: 'sans',
  userId: 'u1',
  userName: 'Alice',
  updatedAt: 100,
  zIndex: 2,
};

const icon: CanvasElement = {
  id: 'icon-1',
  type: 'icon',
  iconName: 'star',
  x: 100,
  y: 100,
  size: 32,
  color: '#f59e0b',
  userId: 'u1',
  updatedAt: 100,
  zIndex: 3,
};

test('reorderZIndex brings a sticky note in front of shapes, texts, and icons (#91)', () => {
  const elements = [sticky, shape, text, icon];
  const { reordered, changed } = reorderZIndex(elements, new Set(['sticky-1']), 'front');

  assert.deepEqual(
    reordered.map((el) => el.id),
    ['shape-1', 'text-1', 'icon-1', 'sticky-1']
  );

  const stickyResult = reordered.find((el) => el.id === 'sticky-1');
  assert.equal((stickyResult as { zIndex?: number })?.zIndex, 3);

  // Shape, text, icon shifted down by 1 index
  assert.equal((reordered[0] as { zIndex?: number }).zIndex, 0);
  assert.equal((reordered[1] as { zIndex?: number }).zIndex, 1);
  assert.equal((reordered[2] as { zIndex?: number }).zIndex, 2);
  assert.equal(changed.length, 4);
});

test('reorderZIndex sends an icon to back behind shapes and stickies (#91)', () => {
  const elements = [sticky, shape, text, icon];
  const { reordered } = reorderZIndex(elements, new Set(['icon-1']), 'back');

  assert.deepEqual(
    reordered.map((el) => el.id),
    ['icon-1', 'sticky-1', 'shape-1', 'text-1']
  );
  assert.equal((reordered[0] as { zIndex?: number }).zIndex, 0);
  assert.equal((reordered[1] as { zIndex?: number }).zIndex, 1);
  assert.equal((reordered[2] as { zIndex?: number }).zIndex, 2);
  assert.equal((reordered[3] as { zIndex?: number }).zIndex, 3);
});

test('reorderZIndex moves an element forward and backward across different element types (#91)', () => {
  const elements = [sticky, shape, text, icon];

  // Move sticky-1 forward 1 step (should swap with shape-1)
  const forwardResult = reorderZIndex(elements, new Set(['sticky-1']), 'forward');
  assert.deepEqual(
    forwardResult.reordered.map((el) => el.id),
    ['shape-1', 'sticky-1', 'text-1', 'icon-1']
  );

  // Move text-1 backward 1 step (should swap with shape-1)
  const backwardResult = reorderZIndex(elements, new Set(['text-1']), 'backward');
  assert.deepEqual(
    backwardResult.reordered.map((el) => el.id),
    ['sticky-1', 'text-1', 'shape-1', 'icon-1']
  );
});

test('reorderZIndex ignores wires, strokes, and locked elements (#91)', () => {
  const lockedShape: CanvasElement = {
    ...shape,
    id: 'locked-shape',
    isLocked: true,
  };
  const stroke: CanvasElement = {
    id: 'stroke-1',
    type: 'stroke',
    points: [{ x: 0, y: 0 }],
    color: '#000',
    size: 2,
    userId: 'u1',
    createdAt: 100,
  };

  const elements = [sticky, lockedShape, stroke, text];
  const { reordered } = reorderZIndex(elements, new Set(['sticky-1']), 'front');

  // lockedShape and stroke-1 are not reordered
  assert.deepEqual(
    reordered.map((el) => el.id),
    ['text-1', 'sticky-1']
  );
});

test('getElementZ respects explicit zIndex and falls back to insertion order', () => {
  assert.equal(getElementZ(sticky, 10), 0);
  assert.equal(getElementZ({ ...sticky, zIndex: undefined }, 10), 10);
});
