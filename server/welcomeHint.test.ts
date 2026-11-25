import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  WELCOME_HINT_DURATION_MS,
  createPausableTimer,
  pausePausableTimer,
  resumePausableTimer,
  startPausableTimer,
} from '../client/src/utils/pausableTimer';

test('welcome hint default countdown stays within 5-10 seconds (#204)', () => {
  assert.ok(WELCOME_HINT_DURATION_MS >= 5000 && WELCOME_HINT_DURATION_MS <= 10000);
});

test('pausableTimer pauses countdown on hover and preserves remaining time across cycles (#204)', () => {
  let state = createPausableTimer(8000);
  state = startPausableTimer(state, 1000);
  assert.equal(state.remainingMs, 8000);
  assert.equal(state.paused, false);

  // User hovers after 2.5s -> 5.5s remains and countdown stops
  state = pausePausableTimer(state, 3500);
  assert.equal(state.remainingMs, 5500);
  assert.equal(state.paused, true);
  assert.equal(state.startedAt, null);

  // Pausing again while already paused is a no-op
  state = pausePausableTimer(state, 9999);
  assert.equal(state.remainingMs, 5500);

  // Hover ends at t=9000 -> resumes with exact 5500ms remaining
  state = resumePausableTimer(state, 9000);
  assert.equal(state.remainingMs, 5500);
  assert.equal(state.paused, false);
  assert.equal(state.startedAt, 9000);

  // Runs past the remaining 5500ms -> remaining clamps cleanly to 0
  state = pausePausableTimer(state, 15000);
  assert.equal(state.remainingMs, 0);
});

test('WelcomeHintToast wires hover/focus pause handlers and App mounts it after blocking overlays (#204)', () => {
  const toast = readFileSync(
    new URL('../client/src/components/WelcomeHintToast.tsx', import.meta.url),
    'utf8'
  );
  const app = readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../client/src/index.css', import.meta.url), 'utf8');

  assert.match(toast, /onMouseEnter=\{\(\) => setIsHovered\(true\)\}/);
  assert.match(toast, /onMouseLeave=\{\(\) => setIsHovered\(false\)\}/);
  assert.match(toast, /animationPlayState:\s*isPaused \? 'paused' : 'running'/);
  assert.match(app, /isOpen=\{showWelcomeHint && !isBlockingOverlayOpen\}/);
  assert.match(css, /#welcome-hint-pill/);
});
