import assert from 'node:assert/strict';
import test from 'node:test';
import { canDirectClearBoard } from './boardClear';

test('host can clear a board with any number of participants', () => {
  assert.equal(canDirectClearBoard(1, true), true);
  assert.equal(canDirectClearBoard(2, true), true);
  assert.equal(canDirectClearBoard(25, true), true);
});

test('non-host can only clear an empty/solo room', () => {
  assert.equal(canDirectClearBoard(1, false), true);
  assert.equal(canDirectClearBoard(2, false), false);
  assert.equal(canDirectClearBoard(10, false), false);
});

test('invalid participant counts are rejected', () => {
  assert.equal(canDirectClearBoard(0, true), false);
  assert.equal(canDirectClearBoard(NaN, true), false);
  assert.equal(canDirectClearBoard(Infinity, true), false);
});
