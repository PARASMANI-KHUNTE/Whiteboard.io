import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canPersistRoomElements,
  finalizeRoomDeletion,
  hasPendingElementSave,
  isRoomBeingDeleted,
  markRoomBeingDeleted,
  saveRoomElementsDebounced,
} from './auth';

test('a deleting room rejects element writes until deletion is finalized (#72)', () => {
  markRoomBeingDeleted('DELETED72');

  assert.equal(isRoomBeingDeleted('DELETED72'), true);
  assert.equal(canPersistRoomElements('DELETED72'), false);

  // A socket emitting during the detach window cannot schedule a late write.
  saveRoomElementsDebounced('DELETED72', { stale: { id: 'stale' } }, 1);
  assert.equal(hasPendingElementSave('DELETED72'), false);

  finalizeRoomDeletion('DELETED72');

  assert.equal(isRoomBeingDeleted('DELETED72'), false);
  assert.equal(canPersistRoomElements('DELETED72'), true);
});

test('finalizing a deletion cancels pending debounced writes (#72)', () => {
  saveRoomElementsDebounced('DELETED72B', { a: { id: 'a' } }, 10_000);
  assert.equal(hasPendingElementSave('DELETED72B'), true);

  finalizeRoomDeletion('DELETED72B');

  assert.equal(hasPendingElementSave('DELETED72B'), false);
});
