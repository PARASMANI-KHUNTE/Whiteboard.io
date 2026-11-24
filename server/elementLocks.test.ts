import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canUpdateElement,
  filterDeletableIds,
  hasLockedElement,
  isElementLocked,
  type LockableElement,
} from './elementLocks';

function note(overrides: Partial<LockableElement> = {}): LockableElement {
  return {
    id: 'note-1',
    type: 'sticky',
    x: 10,
    y: 20,
    text: 'secret',
    updatedAt: 100,
    isLocked: true,
    ...overrides,
  };
}

test('an explicit unlock of a locked element is allowed (#73)', () => {
  const current = note();
  const incoming = note({ isLocked: false, updatedAt: 200 });

  assert.equal(canUpdateElement(current, incoming), true);
});

test('updating content or position of a locked element is rejected (#73)', () => {
  const current = note();

  assert.equal(canUpdateElement(current, note({ isLocked: false, text: 'changed' })), false);
  assert.equal(canUpdateElement(current, note({ isLocked: false, x: 99 })), false);
  assert.equal(canUpdateElement(current, note({ text: 'changed' })), false);
  assert.equal(canUpdateElement(current, note({ isLocked: false, extra: 'x' })), false);
});

test('unlocked elements accept ordinary updates', () => {
  const current = note({ isLocked: false });

  assert.equal(canUpdateElement(current, note({ isLocked: false, text: 'edited' })), true);
  assert.equal(canUpdateElement(undefined, note({ isLocked: false })), true);
});

test('locked ids are never deletable, including batch deletes (#73)', () => {
  const elements: Record<string, LockableElement> = {
    'note-1': note(),
    'note-2': note({ id: 'note-2', isLocked: false }),
  };

  assert.equal(isElementLocked(elements['note-1']), true);
  assert.equal(hasLockedElement(elements, ['note-2', 'note-1']), true);
  assert.deepEqual(filterDeletableIds(elements, ['note-1', 'note-2', 'missing']), [
    'note-2',
    'missing',
  ]);
});
