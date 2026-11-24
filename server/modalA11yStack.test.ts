import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createModalA11yStack,
  type ScrollLockDocument,
} from '../client/src/hooks/modalA11yStack';

function fakeDocument(overflow = 'auto'): ScrollLockDocument {
  return { body: { style: { overflow } } };
}

test('only the topmost dialog is active (#81)', () => {
  const stack = createModalA11yStack();
  const first = Symbol('first');
  const second = Symbol('second');

  const popFirst = stack.push(first);
  assert.equal(stack.isTop(first), true);

  const popSecond = stack.push(second);
  assert.equal(stack.isTop(first), false);
  assert.equal(stack.isTop(second), true);

  popFirst();
  assert.equal(stack.isTop(first), false);
  assert.equal(stack.isTop(second), true);

  popSecond();
  assert.equal(stack.isTop(second), false);
});

test('body scroll stays locked until the last dialog closes (#81)', () => {
  const stack = createModalA11yStack();
  const doc = fakeDocument('scroll');
  const first = Symbol('first');
  const second = Symbol('second');

  const popFirst = stack.push(first);
  stack.acquireScrollLock(doc);
  assert.equal(doc.body.style.overflow, 'hidden');

  const popSecond = stack.push(second);
  stack.acquireScrollLock(doc);

  popFirst();
  stack.releaseScrollLock(doc);
  assert.equal(doc.body.style.overflow, 'hidden');

  popSecond();
  stack.releaseScrollLock(doc);
  assert.equal(doc.body.style.overflow, 'scroll');

  // Releasing again never corrupts an unrelated later lock.
  stack.releaseScrollLock(doc);
  assert.equal(doc.body.style.overflow, 'scroll');
});

test('Escape handling is topmost-only and stops sibling listeners (#81)', () => {
  const source = readFileSync(
    new URL('../client/src/hooks/useModalA11y.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /modalA11yStack\.isTop\(modalId\)/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(source, /event\.stopPropagation\(\)/);
});
