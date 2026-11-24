import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { DrawingStroke } from '../client/src/types';
import { finalizeStrokeForCommit } from '../client/src/utils/strokeCommit';

function canvasSource(): string {
  return readFileSync(new URL('../client/src/components/Canvas.tsx', import.meta.url), 'utf8');
}

function stroke(points: DrawingStroke['points']): DrawingStroke {
  return {
    id: 'stroke_test',
    type: 'stroke',
    points,
    color: '#123456',
    size: 4,
    isHighlighter: false,
    userId: 'u1',
    createdAt: 100,
  };
}

test('an empty or missing active stroke is not committed (#87)', () => {
  assert.equal(finalizeStrokeForCommit(null, 1), null);
  assert.equal(finalizeStrokeForCommit(stroke([]), 1), null);
});

test('finalized stroke keeps endpoints and metadata while dropping redundant points (#87)', () => {
  const original = stroke([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ]);

  const finalized = finalizeStrokeForCommit(original, 1);
  assert.ok(finalized);
  assert.deepEqual(finalized.points, [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ]);
  assert.equal(finalized.id, original.id);
  assert.equal(finalized.color, original.color);
  assert.equal(finalized.size, original.size);
  assert.equal(finalized.userId, original.userId);
  assert.equal(finalized.createdAt, original.createdAt);
});

test('short strokes are passed through without copying (#87)', () => {
  const original = stroke([
    { x: 0, y: 0 },
    { x: 5, y: 7 },
  ]);
  assert.equal(finalizeStrokeForCommit(original, 1), original);
});

test('pinch start commits the active stroke through the shared finish path (#87)', () => {
  const source = canvasSource();
  const pinchStart = source.indexOf("if ('touches' in e && e.touches.length >= 2) {");
  const firstFinger = source.indexOf('const t1 = e.touches[0];', pinchStart);
  assert.ok(pinchStart >= 0 && firstFinger > pinchStart, 'pinch branch not found');
  const pinchBranch = source.slice(pinchStart, firstFinger);

  assert.match(pinchBranch, /finishStroke\(\);/);
  assert.doesNotMatch(pinchBranch, /setCurrentStroke\(null\)/);
  assert.doesNotMatch(pinchBranch, /setIsDrawing\(false\)/);
});

test('finishStroke persists the stroke and clears the synchronous ref (#87)', () => {
  const source = canvasSource();
  const start = source.indexOf('const finishStroke = useCallback(() => {');
  const end = source.indexOf('}, [onElementCreate, zoom]);', start);
  assert.ok(start >= 0 && end > start, 'finishStroke not found');
  const finish = source.slice(start, end);

  assert.match(finish, /strokeInProgressRef\.current = null/);
  assert.match(finish, /finalizeStrokeForCommit\(stroke, zoom\)/);
  assert.match(finish, /onElementCreate\(committed\)/);
});

test('pointer-up uses the same finish path and stroke points stay in the ref (#87)', () => {
  const source = canvasSource();
  assert.match(source, /strokeInProgressRef\.current = newStroke;/);
  assert.match(source, /strokeInProgressRef\.current = updatedStroke;/);

  const upStart = source.indexOf('const handlePointerUp = ');
  const upEnd = source.indexOf('\n  };', upStart);
  assert.ok(upStart >= 0 && upEnd > upStart, 'handlePointerUp not found');
  const pointerUp = source.slice(upStart, upEnd);

  assert.match(pointerUp, /finishStroke\(\);/);
  assert.doesNotMatch(pointerUp, /simplifyStrokePoints/);
});
