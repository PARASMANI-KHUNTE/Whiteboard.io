import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanvasElement } from '../client/src/types';
import {
  cloneElementsForPaste,
  isValidClipboardElement,
} from '../client/src/utils/clipboard';

test('isValidClipboardElement validates elements strictly (#102)', () => {
  assert.equal(isValidClipboardElement(null), false);
  assert.equal(isValidClipboardElement(undefined), false);
  assert.equal(isValidClipboardElement(''), false);
  assert.equal(isValidClipboardElement({}), false);
  assert.equal(isValidClipboardElement({ id: '1' }), false);
  assert.equal(isValidClipboardElement({ type: 'stroke' }), false);

  // Stroke missing points or invalid points
  assert.equal(isValidClipboardElement({ id: 's1', type: 'stroke' }), false);
  assert.equal(isValidClipboardElement({ id: 's1', type: 'stroke', points: 'not-an-array' }), false);
  assert.equal(isValidClipboardElement({ id: 's1', type: 'stroke', points: [{ x: NaN, y: 10 }] }), false);
  assert.equal(isValidClipboardElement({ id: 's1', type: 'stroke', points: [{ x: 10, y: Infinity }] }), false);
  assert.equal(isValidClipboardElement({ id: 's1', type: 'stroke', points: [{ x: 10, y: 20 }] }), true);

  // Positioned elements missing x/y
  assert.equal(isValidClipboardElement({ id: 'n1', type: 'sticky' }), false);
  assert.equal(isValidClipboardElement({ id: 'n1', type: 'sticky', x: 10 }), false);
  assert.equal(isValidClipboardElement({ id: 'n1', type: 'sticky', x: 10, y: 20 }), true);

  // Wires
  assert.equal(isValidClipboardElement({ id: 'w1', type: 'wire' }), false);
  assert.equal(isValidClipboardElement({ id: 'w1', type: 'wire', fromId: 'a' }), false);
  assert.equal(isValidClipboardElement({ id: 'w1', type: 'wire', fromId: 'a', toId: 'b' }), true);
});

test('cloneElementsForPaste does not throw on malformed stroke missing points (#102)', () => {
  const malformedStroke = { id: 'bad_stroke', type: 'stroke' } as unknown as CanvasElement;
  const validSticky: CanvasElement = {
    id: 'valid_sticky',
    type: 'sticky',
    x: 100,
    y: 200,
    width: 200,
    height: 100,
    text: 'test',
    color: '#ff0000',
    userId: 'u1',
    userName: 'User',
    updatedAt: 1,
  };

  // Must not throw when malformed element is present
  const result = cloneElementsForPaste([malformedStroke, validSticky], 10, 20);

  // Malformed stroke should be discarded, valid sticky should be cloned
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'sticky');
  assert.notEqual(result[0].id, 'valid_sticky');
  assert.equal((result[0] as any).x, 110);
  assert.equal((result[0] as any).y, 220);
});

test('cloneElementsForPaste filters out invalid stroke points (#102)', () => {
  const strokeWithJunkPoints = {
    id: 'stroke1',
    type: 'stroke',
    points: [
      { x: 10, y: 20 },
      { x: null, y: 30 },
      { x: NaN, y: 40 },
      { x: 50, y: 60 },
    ],
    color: '#000000',
    size: 2,
    userId: 'u1',
    createdAt: 1,
  } as unknown as CanvasElement;

  const result = cloneElementsForPaste([strokeWithJunkPoints], 5, 5);
  assert.equal(result.length, 1);
  if (result[0].type !== 'stroke') assert.fail('expected stroke');
  // Points should be offset for valid ones only
  assert.deepEqual(result[0].points, [
    { x: 15, y: 25 },
    { x: 55, y: 65 },
  ]);
});
