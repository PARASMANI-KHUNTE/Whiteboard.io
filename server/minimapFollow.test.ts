import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { computeMinimapScene, minimapPointToWorldPan } from '../client/src/utils/minimapGeometry';
import type { ShapeElement } from '../client/src/types';

test('minimap geometry projects elements and maps clicks back to camera pan (#223)', () => {
  const s1: ShapeElement = {
    id: 's1',
    type: 'shape',
    shapeType: 'rectangle',
    x: 400,
    y: 300,
    width: 120,
    height: 80,
    color: '#2563eb',
    strokeWidth: 2,
    userId: 'u1',
    updatedAt: 100,
  };

  const scene = computeMinimapScene({ s1 }, { x: 0, y: 0 }, 1, 1000, 600, 176, 112);
  assert.equal(scene.elements.length, 1);
  assert.equal(scene.elements[0].color, '#2563eb');
  assert.ok(scene.viewport.width >= 10);

  // Clicking the center of projected element should produce a pan centering s1 (460, 340) in (1000, 600)
  const elemBox = scene.elements[0];
  const centerX = elemBox.x + elemBox.width / 2;
  const centerY = elemBox.y + elemBox.height / 2;
  const pan = minimapPointToWorldPan(centerX, centerY, scene, 1000, 600, 1);

  assert.ok(Math.abs(pan.x - (500 - 460)) < 2);
  assert.ok(Math.abs(pan.y - (300 - 340)) < 2);
});

test('ZoomControls, Header, and Canvas wire Fit All, Minimap, and Follow Collaborator (#223)', () => {
  const zoomControls = readFileSync(
    new URL('../client/src/components/ZoomControls.tsx', import.meta.url),
    'utf8'
  );
  assert.match(zoomControls, /id="fit-all-btn"/);
  assert.match(zoomControls, /id="toggle-minimap-btn"/);

  const header = readFileSync(
    new URL('../client/src/components/Header.tsx', import.meta.url),
    'utf8'
  );
  assert.match(header, /onToggleFollowUser\?\.\(u\.id\)/);

  const canvas = readFileSync(
    new URL('../client/src/components/Canvas.tsx', import.meta.url),
    'utf8'
  );
  assert.match(canvas, /fitAllToScreen/);
  assert.match(canvas, /<CanvasMinimap/);
  assert.match(canvas, /followingUserId/);
});
