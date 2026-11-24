import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeNavigationStep,
  cancelNavigationAnimation,
  scheduleNavigationFrame,
} from '../client/src/utils/canvasNavigation';

test('computeNavigationStep computes easeOutCubic pan and zoom progression', () => {
  const startPan = { x: 0, y: 0 };
  const targetPan = { x: 200, y: -100 };
  const startZoom = 1.0;
  const targetZoom = 0.5;
  const startTime = 1000;
  const duration = 500;

  // At start (t = 1000)
  const stepStart = computeNavigationStep({
    startTime,
    now: 1000,
    duration,
    startPan,
    targetPan,
    startZoom,
    targetZoom,
  });
  assert.equal(stepStart.progress, 0);
  assert.deepEqual(stepStart.pan, { x: 0, y: 0 });
  assert.equal(stepStart.zoom, 1.0);
  assert.equal(stepStart.done, false);

  // At midpoint (t = 1250): progress = 0.5, ease = 1 - (1 - 0.5)^3 = 0.875
  const stepMid = computeNavigationStep({
    startTime,
    now: 1250,
    duration,
    startPan,
    targetPan,
    startZoom,
    targetZoom,
  });
  assert.equal(stepMid.progress, 0.5);
  // Pan should be 87.5% toward target
  assert.equal(stepMid.pan.x, Math.round(200 * 0.875));
  assert.equal(stepMid.pan.y, Math.round(-100 * 0.875));
  assert.equal(stepMid.zoom, Number((1.0 + (0.5 - 1.0) * 0.875).toFixed(3)));
  assert.equal(stepMid.done, false);

  // At end (t = 1500)
  const stepEnd = computeNavigationStep({
    startTime,
    now: 1500,
    duration,
    startPan,
    targetPan,
    startZoom,
    targetZoom,
  });
  assert.equal(stepEnd.progress, 1);
  assert.deepEqual(stepEnd.pan, { x: 200, y: -100 });
  assert.equal(stepEnd.zoom, 0.5);
  assert.equal(stepEnd.done, true);

  // Past end (t = 1600)
  const stepPast = computeNavigationStep({
    startTime,
    now: 1600,
    duration,
    startPan,
    targetPan,
    startZoom,
    targetZoom,
  });
  assert.equal(stepPast.progress, 1);
  assert.deepEqual(stepPast.pan, { x: 200, y: -100 });
  assert.equal(stepPast.zoom, 0.5);
  assert.equal(stepPast.done, true);
});

test('cancelNavigationAnimation cancels active rAF handle and clears ref (#93)', () => {
  const cancelledIds: number[] = [];
  const fakeCancel = (id: number) => {
    cancelledIds.push(id);
  };

  const state = { current: 42 };

  // First cancel: cancels id 42, clears to null, returns true
  const didCancel = cancelNavigationAnimation(state, fakeCancel);
  assert.equal(didCancel, true);
  assert.equal(state.current, null);
  assert.deepEqual(cancelledIds, [42]);

  // Second cancel when idle: no-op, returns false
  const didCancelAgain = cancelNavigationAnimation(state, fakeCancel);
  assert.equal(didCancelAgain, false);
  assert.equal(state.current, null);
  assert.deepEqual(cancelledIds, [42]);
});

test('scheduleNavigationFrame stores rAF handle and enables cancellation (#93)', () => {
  let nextId = 100;
  const scheduledCallbacks: Array<(now: number) => void> = [];
  const fakeSchedule = (cb: (now: number) => void) => {
    scheduledCallbacks.push(cb);
    return ++nextId;
  };

  const cancelledIds: number[] = [];
  const fakeCancel = (id: number) => {
    cancelledIds.push(id);
  };

  const state: { current: number | null } = { current: null };

  // Schedule a frame
  scheduleNavigationFrame(state, () => {}, fakeSchedule);
  assert.equal(state.current, 101);
  assert.equal(scheduledCallbacks.length, 1);

  // User gesture cancels the frame
  const cancelled = cancelNavigationAnimation(state, fakeCancel);
  assert.equal(cancelled, true);
  assert.equal(state.current, null);
  assert.deepEqual(cancelledIds, [101]);
});
