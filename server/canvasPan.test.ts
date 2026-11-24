import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPanInteraction,
  shouldBailOutItemMouseDown,
  isWorldLayerPointerEventsDisabled,
} from '../client/src/utils/canvasPan.js';

test('isPanInteraction detects middle click, hand tool, and spacebar panning (#88)', () => {
  // Middle mouse click (button === 1)
  assert.equal(isPanInteraction({ button: 1, tool: 'select', isSpacePressed: false }), true);
  assert.equal(isPanInteraction({ button: 1 }), true);

  // Hand tool
  assert.equal(isPanInteraction({ button: 0, tool: 'hand', isSpacePressed: false }), true);

  // Spacebar pan
  assert.equal(isPanInteraction({ button: 0, tool: 'select', isSpacePressed: true }), true);

  // Normal left-click interaction with select or drawing tools
  assert.equal(isPanInteraction({ button: 0, tool: 'select', isSpacePressed: false }), false);
  assert.equal(isPanInteraction({ button: 0, tool: 'pencil', isSpacePressed: false }), false);
  assert.equal(isPanInteraction({}), false);
});

test('shouldBailOutItemMouseDown allows events to bubble for middle click and pan modes (#88)', () => {
  // Middle click (button 1) should bail out so canvas container handles pan
  assert.equal(shouldBailOutItemMouseDown({ button: 1 }), true);

  // Non-primary click (button 2 - right click) should bail out for context menu
  assert.equal(shouldBailOutItemMouseDown({ button: 2 }), true);

  // Explicit pan mode active
  assert.equal(shouldBailOutItemMouseDown({ button: 0 }, true), true);

  // Normal primary left click should NOT bail out
  assert.equal(shouldBailOutItemMouseDown({ button: 0 }, false), false);
  assert.equal(shouldBailOutItemMouseDown({ button: 0 }), false);
});

test('isWorldLayerPointerEventsDisabled disables world layer for hand, space, wire, and eraser (#88)', () => {
  // Hand tool and spacebar pan should allow dragging anywhere on the canvas
  assert.equal(isWorldLayerPointerEventsDisabled('hand', false), true);
  assert.equal(isWorldLayerPointerEventsDisabled('select', true), true);
  assert.equal(isWorldLayerPointerEventsDisabled('sticky', true), true);

  // Wire and eraser tools
  assert.equal(isWorldLayerPointerEventsDisabled('eraser', false), true);
  assert.equal(isWorldLayerPointerEventsDisabled('wire', false), true);

  // Standard interactive tools without spacebar
  assert.equal(isWorldLayerPointerEventsDisabled('select', false), false);
  assert.equal(isWorldLayerPointerEventsDisabled('shape', false), false);
  assert.equal(isWorldLayerPointerEventsDisabled('sticky', false), false);
  assert.equal(isWorldLayerPointerEventsDisabled('text', false), false);
});
