import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRecord,
  readBoolean,
  readFiniteNumber,
  readPoint,
  readString,
  sanitizeElement,
  sanitizeElementBatch,
  sanitizeElementIds,
  MAX_BATCH_ELEMENTS,
} from './socketPayload';

test('isRecord rejects arrays, null and primitives', () => {
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord('x'), false);
});

test('readString trims, caps length and uses a fallback', () => {
  assert.equal(readString('  abc  ', 10), 'abc');
  assert.equal(readString('abcdefghij', 4), 'abcd');
  assert.equal(readString(42, 10), '');
  assert.equal(readString(undefined, 10, 'guest'), 'guest');
});

test('readFiniteNumber and readBoolean are strict', () => {
  assert.equal(readFiniteNumber('12.5'), 12.5);
  assert.equal(readFiniteNumber('nope'), null);
  assert.equal(readFiniteNumber(NaN), null);
  assert.equal(readBoolean(true), true);
  assert.equal(readBoolean(false), false);
  assert.equal(readBoolean('false'), null);
  assert.equal(readBoolean(1), null);
});

test('readPoint requires finite x and y', () => {
  assert.deepEqual(readPoint({ x: 1, y: '2' }), { x: 1, y: 2 });
  assert.equal(readPoint({ x: 1 }), null);
  assert.equal(readPoint('nope'), null);
});

test('sanitizeElement rejects malformed elements and preserves valid ones', () => {
  assert.equal(sanitizeElement(undefined), null);
  assert.equal(sanitizeElement([]), null);
  assert.equal(sanitizeElement({ type: 'stroke' }), null);
  assert.deepEqual(sanitizeElement({ id: ' a ', type: 'stroke', x: 5 }), {
    id: 'a',
    type: 'stroke',
    x: 5,
  });
});

test('sanitizeElementBatch filters invalid items and caps the batch', () => {
  const huge = Array.from({ length: MAX_BATCH_ELEMENTS + 10 }, (_, i) => ({ id: `e${i}` }));
  assert.equal(sanitizeElementBatch(huge).length, MAX_BATCH_ELEMENTS);
  assert.equal(sanitizeElementBatch({ elementIds: ['x'] }).length, 0);

  const mixed = [{ id: 'ok' }, null, { nope: true }, 'bad', { id: 'also-ok' }];
  assert.deepEqual(sanitizeElementBatch(mixed).map((el) => el.id), ['ok', 'also-ok']);
});

test('sanitizeElementIds turns a string payload into an empty list', () => {
  assert.deepEqual(sanitizeElementIds('not-an-array'), []);
  assert.deepEqual(sanitizeElementIds([' a ', '', 42, 'b']), ['a', 'b']);
});
