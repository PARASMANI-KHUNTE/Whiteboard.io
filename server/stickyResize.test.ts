import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { computeRotatedResize } from '../client/src/utils/shapeResize';

test('sticky note resize honors minimum width and height constraints (#219)', () => {
  const shrunk = computeRotatedResize({
    corner: 'se',
    initialPos: { x: 100, y: 100 },
    initialSize: { width: 224, height: 150 },
    rotationDeg: 0,
    deltaX: -200,
    deltaY: -120,
    minWidth: 160,
    minHeight: 120,
  });

  assert.equal(shrunk.width, 160);
  assert.equal(shrunk.height, 120);
  assert.equal(shrunk.x, 100);
  assert.equal(shrunk.y, 100);

  const grownNw = computeRotatedResize({
    corner: 'nw',
    initialPos: { x: 100, y: 100 },
    initialSize: { width: 224, height: 150 },
    rotationDeg: 0,
    deltaX: -40,
    deltaY: -30,
    minWidth: 160,
    minHeight: 120,
  });

  assert.equal(grownNw.width, 264);
  assert.equal(grownNw.height, 180);
  assert.equal(grownNw.x, 60);
  assert.equal(grownNw.y, 70);
});

test('StickyNoteItem wires resize handles, usePopoverDismiss, and aria labels (#219)', () => {
  const source = readFileSync(
    new URL('../client/src/components/StickyNoteItem.tsx', import.meta.url),
    'utf8'
  );
  assert.match(source, /usePopoverDismiss\(elementRef,\s*showColorPicker,\s*closeColorPicker\)/);
  assert.match(source, /data-sticky-resize/);
  assert.match(source, /aria-label="Change sticky note color"/);
  assert.match(source, /aria-label="Delete sticky note"/);
  assert.match(source, /e\.key === 'Escape'/);
});
