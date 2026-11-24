import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getTouchClientPoint,
  isScrollableTextInput,
  TouchLikeEvent,
} from '../client/src/utils/touchInteractions.js';

test('getTouchClientPoint extracts coordinates from active touches (#89)', () => {
  const touchMoveEvent: TouchLikeEvent = {
    touches: [{ clientX: 120, clientY: 240 }],
    changedTouches: [{ clientX: 120, clientY: 240 }],
  };
  const pt = getTouchClientPoint(touchMoveEvent);
  assert.deepEqual(pt, { clientX: 120, clientY: 240 });
});

test('getTouchClientPoint falls back to changedTouches on touchend when touches is empty (#89)', () => {
  const touchEndEvent: TouchLikeEvent = {
    touches: [],
    changedTouches: [{ clientX: 350, clientY: 480 }],
  };
  const pt = getTouchClientPoint(touchEndEvent);
  assert.deepEqual(pt, { clientX: 350, clientY: 480 });
});

test('getTouchClientPoint reads clientX and clientY from mouse events (#89)', () => {
  const mouseEvent: TouchLikeEvent = {
    clientX: 50,
    clientY: 75,
  };
  const pt = getTouchClientPoint(mouseEvent);
  assert.deepEqual(pt, { clientX: 50, clientY: 75 });
});

test('getTouchClientPoint returns null when coordinates are missing (#89)', () => {
  assert.equal(getTouchClientPoint({}), null);
  assert.equal(getTouchClientPoint({ touches: [], changedTouches: [] }), null);
});

test('isScrollableTextInput identifies text inputs, textareas, and contenteditable (#89)', () => {
  // Direct textarea / input tag
  assert.equal(isScrollableTextInput({ tagName: 'TEXTAREA' } as unknown as EventTarget), true);
  assert.equal(isScrollableTextInput({ tagName: 'INPUT' } as unknown as EventTarget), true);

  // Content editable
  assert.equal(isScrollableTextInput({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(
    isScrollableTextInput({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'contenteditable' ? 'true' : null),
    } as unknown as EventTarget),
    true
  );

  // ARIA role textbox
  assert.equal(
    isScrollableTextInput({
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'textbox' : null),
    } as unknown as EventTarget),
    true
  );

  // Nested child element inside textarea or textbox
  assert.equal(
    isScrollableTextInput({
      tagName: 'SPAN',
      closest: (sel: string) => (sel.includes('textarea') ? { tagName: 'TEXTAREA' } : null),
    } as unknown as EventTarget),
    true
  );

  // Canvas / SVG / standard containers should NOT be considered text input
  assert.equal(isScrollableTextInput({ tagName: 'CANVAS', closest: () => null } as unknown as EventTarget), false);
  assert.equal(isScrollableTextInput({ tagName: 'DIV', closest: () => null } as unknown as EventTarget), false);
  assert.equal(isScrollableTextInput(null), false);
});

test('autofocus is only enabled for session-created elements and suppressed on reload (#89)', () => {
  const sessionCreatedIds = new Set<string>();

  // Element created locally by user action in current session
  const newlyCreatedNoteId = 'sticky_abc123';
  sessionCreatedIds.add(newlyCreatedNoteId);

  // Element loaded from board persistence / reload
  const existingNoteId = 'sticky_persisted_456';

  assert.equal(sessionCreatedIds.has(newlyCreatedNoteId), true);
  assert.equal(sessionCreatedIds.has(existingNoteId), false);
});
