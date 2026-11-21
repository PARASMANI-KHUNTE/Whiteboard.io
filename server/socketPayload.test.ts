import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRecord,
  readBoolean,
  readFiniteNumber,
  readId,
  readPoint,
  readString,
  sanitizeElement,
  sanitizeElementBatch,
  sanitizeElementIds,
  MAX_BATCH_ELEMENTS,
  MAX_POINTS_PER_STROKE,
  MAX_ID_LENGTH,
} from './socketPayload';

const stroke = {
  id: 's1',
  type: 'stroke',
  points: [{ x: 1, y: 2 }],
  color: '#000000',
  size: 3,
  userId: 'u1',
  createdAt: 100,
};

const sticky = {
  id: 'st1',
  type: 'sticky',
  x: 1,
  y: 2,
  width: 224,
  height: 150,
  text: '',
  color: '#fef08a',
  userId: 'u1',
  userName: 'Alice',
  updatedAt: 100,
};

const wire = {
  id: 'w1',
  type: 'wire',
  fromId: 's1',
  toId: 'st1',
  wireType: 'curve',
  color: '#000000',
  strokeWidth: 3,
  userId: 'u1',
  updatedAt: 100,
};

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

test('readFiniteNumber accepts numeric strings but rejects coercible junk', () => {
  assert.equal(readFiniteNumber('12.5'), 12.5);
  assert.equal(readFiniteNumber('nope'), null);
  assert.equal(readFiniteNumber(NaN), null);
  assert.equal(readFiniteNumber(null), null);
  assert.equal(readFiniteNumber(false), null);
  assert.equal(readFiniteNumber([]), null);
  assert.equal(readFiniteNumber(''), null);
  assert.equal(readFiniteNumber('   '), null);
  assert.equal(readFiniteNumber({}), null);
});

test('readBoolean is strict', () => {
  assert.equal(readBoolean(true), true);
  assert.equal(readBoolean(false), false);
  assert.equal(readBoolean('false'), null);
  assert.equal(readBoolean(1), null);
  assert.equal(readBoolean(null), null);
});

test('readId rejects prototype-pollution keys and overlong IDs', () => {
  assert.equal(readId('user-1'), 'user-1');
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    assert.equal(readId(key), null);
  }
  assert.equal(readId('x'.repeat(MAX_ID_LENGTH)), `x`.repeat(MAX_ID_LENGTH));
  assert.equal(readId('x'.repeat(MAX_ID_LENGTH + 1)), null);
  assert.deepEqual(sanitizeElementIds(['a'.repeat(MAX_ID_LENGTH + 1)]), []);
});

test('readPoint requires finite, bounded x and y', () => {
  assert.deepEqual(readPoint({ x: 1, y: '2' }), { x: 1, y: 2 });
  assert.equal(readPoint({ x: 1 }), null);
  assert.equal(readPoint({ x: null, y: null }), null);
  assert.equal(readPoint({ x: 1e9, y: 2 }), null);
  assert.equal(readPoint('nope'), null);
});

test('sanitizeElement rebuilds valid elements from an allowlist', () => {
  assert.deepEqual(sanitizeElement(stroke), stroke);
  assert.deepEqual(sanitizeElement(sticky), sticky);
  assert.deepEqual(sanitizeElement(wire), wire);

  const withJunk = { ...sticky, __proto__: { polluted: true }, extra: 'ignored' };
  const clean = sanitizeElement(withJunk);
  assert.ok(clean);
  assert.equal('extra' in clean, false);
  assert.equal('polluted' in clean, false);
});

test('sanitizeElement rejects malformed and incomplete elements', () => {
  assert.equal(sanitizeElement(undefined), null);
  assert.equal(sanitizeElement([]), null);
  assert.equal(sanitizeElement({ type: 'sticky' }), null);

  // Missing required fields, even though id + type are present.
  assert.equal(sanitizeElement({ id: 'x', type: 'stroke' }), null);
  assert.equal(sanitizeElement({ id: 'x', type: 'sticky', x: 1, y: 2 }), null);
  assert.equal(sanitizeElement({ ...wire, fromId: '__proto__' }), null);

  // Invalid type is rejected rather than preserved from the raw object.
  assert.equal(sanitizeElement({ ...sticky, type: 42 }), null);
  assert.equal(sanitizeElement({ ...sticky, type: '' }), null);
  assert.equal(sanitizeElement({ id: 'x', type: 'unknown', x: 1 }), null);
});

test('sanitizeElement rejects prototype-pollution ids and malformed nested fields', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    assert.equal(sanitizeElement({ ...sticky, id: key }), null);
  }

  assert.equal(sanitizeElement({ ...stroke, points: 'not-an-array' }), null);
  assert.equal(sanitizeElement({ ...stroke, points: [{ x: null, y: null }] }), null);
  assert.equal(
    sanitizeElement({ ...stroke, points: Array.from({ length: MAX_POINTS_PER_STROKE + 1 }, () => ({ x: 0, y: 0 })) }),
    null
  );
  const capped = sanitizeElement({ ...sticky, text: 'x'.repeat(10_001) });
  assert.ok(capped);
  assert.equal((capped.text as string).length, 10_000);
});

test('sanitizeElementBatch filters invalid items and caps the batch', () => {
  const huge = Array.from({ length: MAX_BATCH_ELEMENTS + 10 }, (_, i) => ({ ...sticky, id: `e${i}` }));
  assert.equal(sanitizeElementBatch(huge).length, MAX_BATCH_ELEMENTS);
  assert.equal(sanitizeElementBatch({ elementIds: [sticky.id] }).length, 0);

  const mixed = [sticky, null, { id: 'ok' }, 'bad', wire];
  assert.deepEqual(sanitizeElementBatch(mixed).map((el) => el.id), ['st1', 'w1']);
});

test('sanitizeElementIds turns a string payload into an empty list and blocks unsafe keys', () => {
  assert.deepEqual(sanitizeElementIds('not-an-array'), []);
  assert.deepEqual(sanitizeElementIds([' a ', '', 42, 'b', '__proto__', 'constructor']), ['a', 'b']);
});
