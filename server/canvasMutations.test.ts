import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanvasElement } from '../client/src/types';
import { isElementLocked, setElementLocked, translateElement } from '../client/src/utils/elementMutations';

const stroke: CanvasElement = {
  id: 's1',
  type: 'stroke',
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ],
  color: '#000000',
  size: 3,
  userId: 'u1',
  createdAt: 100,
};

const sticky: CanvasElement = {
  id: 'n1',
  type: 'sticky',
  x: 5,
  y: 7,
  width: 224,
  height: 150,
  text: 'hello',
  color: '#fef08a',
  userId: 'u1',
  userName: 'Alice',
  updatedAt: 100,
};

const wire: CanvasElement = {
  id: 'w1',
  type: 'wire',
  fromId: 'n1',
  toId: 'sh1',
  wireType: 'curve',
  color: '#000000',
  strokeWidth: 3,
  userId: 'u1',
  updatedAt: 100,
};

test('translateElement moves strokes and positioned elements but not wires', () => {
  const movedStroke = translateElement(stroke, 5, -10);
  if (movedStroke.type !== 'stroke') assert.fail('expected a stroke');
  assert.deepEqual(movedStroke.points, [
    { x: 15, y: 10 },
    { x: 35, y: 30 },
  ]);
  assert.equal(movedStroke.createdAt, 100);
  assert.equal('updatedAt' in movedStroke, false);

  const movedSticky = translateElement(sticky, 5, -10, 500);
  if (movedSticky.type !== 'sticky') assert.fail('expected a sticky note');
  assert.equal(movedSticky.x, 10);
  assert.equal(movedSticky.y, -3);
  assert.equal(movedSticky.updatedAt, 500);

  assert.equal(translateElement(wire, 5, -10), wire);
  assert.equal(translateElement(sticky, 0, 0), sticky);
});

test('setElementLocked records lock state on every element type', () => {
  assert.equal(isElementLocked(sticky), false);

  const lockedSticky = setElementLocked(sticky, true, 500);
  assert.equal(isElementLocked(lockedSticky), true);
  if (lockedSticky.type !== 'sticky') assert.fail('expected a sticky note');
  assert.equal(lockedSticky.updatedAt, 500);

  const lockedStroke = setElementLocked(stroke, true, 500);
  assert.equal(isElementLocked(lockedStroke), true);
  assert.equal('updatedAt' in lockedStroke, false);

  const unlockedWire = setElementLocked(wire, false, 500);
  assert.equal(isElementLocked(unlockedWire), false);
  assert.equal(isElementLocked(setElementLocked(unlockedWire, true)), true);
});
