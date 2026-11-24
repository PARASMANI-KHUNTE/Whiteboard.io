import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dprMediaQuery,
  normalizedDpr,
  resizeCanvasBackingStore,
} from '../client/src/utils/canvasSizing';

function trackedCanvas(initialWidth: number, initialHeight: number) {
  let width = initialWidth;
  let height = initialHeight;
  let widthWrites = 0;
  let heightWrites = 0;

  return {
    get width() { return width; },
    set width(value: number) { widthWrites += 1; width = value; },
    get height() { return height; },
    set height(value: number) { heightWrites += 1; height = value; },
    style: { width: '', height: '' },
    get widthWrites() { return widthWrites; },
    get heightWrites() { return heightWrites; },
  };
}

function container(width: number, height: number) {
  return { getBoundingClientRect: () => ({ width, height }) };
}

test('pan and zoom frames do not reassign the canvas backing store (#85)', () => {
  const canvas = trackedCanvas(0, 0);
  const box = container(800, 600);

  assert.equal(resizeCanvasBackingStore(canvas, box, 1), true);
  assert.equal(canvas.width, 800);
  assert.equal(canvas.height, 600);
  assert.equal(canvas.widthWrites, 1);
  assert.equal(canvas.heightWrites, 1);

  for (let frame = 0; frame < 50; frame += 1) {
    assert.equal(resizeCanvasBackingStore(canvas, box, 1), false);
  }

  assert.equal(canvas.widthWrites, 1, 'width must not be reassigned on every frame');
  assert.equal(canvas.heightWrites, 1, 'height must not be reassigned on every frame');
});

test('a DPR change resizes the backing store while CSS size stays fixed (#85)', () => {
  const canvas = trackedCanvas(0, 0);
  const box = container(640, 360);

  resizeCanvasBackingStore(canvas, box, 1);
  assert.deepEqual([canvas.width, canvas.height], [640, 360]);

  assert.equal(resizeCanvasBackingStore(canvas, box, 2), true);
  assert.deepEqual([canvas.width, canvas.height], [1280, 720]);
  assert.equal(canvas.widthWrites, 2);
  assert.equal(canvas.heightWrites, 2);
  assert.equal(canvas.style.width, '640px');
  assert.equal(canvas.style.height, '360px');
});

test('DPR media queries track the current resolution (#85)', () => {
  assert.equal(normalizedDpr(0), 1);
  assert.equal(dprMediaQuery(1), '(resolution: 1dppx)');
  assert.equal(dprMediaQuery(1.5), '(resolution: 1.5dppx)');
  assert.equal(dprMediaQuery(Number.NaN), '(resolution: 1dppx)');
});
