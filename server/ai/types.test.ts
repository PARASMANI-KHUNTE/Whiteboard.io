import assert from 'node:assert/strict';
import test from 'node:test';
import { coerceDetailLevel, coerceDirection } from './types';

test('coerceDetailLevel supports aliases and defaults (#99)', () => {
  assert.equal(coerceDetailLevel('standard'), 'standard');
  assert.equal(coerceDetailLevel('balanced'), 'standard');
  assert.equal(coerceDetailLevel('concise'), 'standard');
  assert.equal(coerceDetailLevel('detailed'), 'detailed');
  assert.equal(coerceDetailLevel('unknown'), 'detailed');
  assert.equal(coerceDetailLevel(null), 'detailed');
});

test('coerceDirection supports aliases and defaults (#99)', () => {
  assert.equal(coerceDirection('horizontal'), 'horizontal');
  assert.equal(coerceDirection('vertical'), 'vertical');
  assert.equal(coerceDirection('radial'), 'vertical');
  assert.equal(coerceDirection('free'), 'vertical');
  assert.equal(coerceDirection('unknown'), 'vertical');
  assert.equal(coerceDirection(undefined), 'vertical');
});
