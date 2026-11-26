import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { stampElementAttribution } from './attribution';
import {
  attributionColorForUser,
  blameOverlayColor,
  getEffectiveAttribution,
  stampLocalAttribution,
} from '../client/src/utils/attributionColor';
import { findHoveredElementAtPoint } from '../client/src/utils/attributionHitTest';
import { SpatialIndex } from '../client/src/utils/spatialIndex';
import type { CanvasElement, DrawingStroke, ShapeElement, StickyNote, WireElement } from '../client/src/types';

test('stampElementAttribution stamps creator and modifier on new element (#214)', () => {
  const actor = { id: 'u_alice', name: 'Alice', color: '#3b82f6' };
  const clean = { id: 'sh_1', type: 'shape', userId: 'u_alice', userName: 'Alice', updatedAt: 1000 };

  const result = stampElementAttribution(clean, undefined, actor, 1000);
  assert.deepEqual(result.attribution, {
    createdBy: 'u_alice',
    createdByName: 'Alice',
    createdByColor: '#3b82f6',
    createdAt: 1000,
    lastModifiedBy: 'u_alice',
    lastModifiedByName: 'Alice',
    lastModifiedByColor: '#3b82f6',
    lastModifiedAt: 1000,
  });
});

test('stampElementAttribution preserves original creator when edited by another user (#214)', () => {
  const alice = { id: 'u_alice', name: 'Alice', color: '#3b82f6' };
  const bob = { id: 'u_bob', name: 'Bob', color: '#10b981' };

  const created = stampElementAttribution(
    { id: 'st_1', type: 'sticky', userId: 'u_alice', userName: 'Alice', updatedAt: 1000 },
    undefined,
    alice,
    1000
  );

  // Bob moves the sticky note (client payload carries Bob's userId/updatedAt)
  const updated = stampElementAttribution(
    { id: 'st_1', type: 'sticky', userId: 'u_bob', userName: 'Bob', updatedAt: 2500 },
    created,
    bob,
    2500
  );

  assert.equal(updated.attribution.createdBy, 'u_alice');
  assert.equal(updated.attribution.createdByName, 'Alice');
  assert.equal(updated.attribution.createdByColor, '#3b82f6');
  assert.equal(updated.attribution.createdAt, 1000);
  assert.equal(updated.attribution.lastModifiedBy, 'u_bob');
  assert.equal(updated.attribution.lastModifiedByName, 'Bob');
  assert.equal(updated.attribution.lastModifiedByColor, '#10b981');
  assert.equal(updated.attribution.lastModifiedAt, 2500);
});

test('stampElementAttribution preserves legacy pre-attribution creator (#214)', () => {
  const legacy = { id: 'sh_legacy', type: 'shape', userId: 'u_orig', userName: 'Original Author', updatedAt: 500 };
  const bob = { id: 'u_bob', name: 'Bob', color: '#10b981' };

  const updated = stampElementAttribution(
    { id: 'sh_legacy', type: 'shape', userId: 'u_bob', userName: 'Bob', updatedAt: 3000 },
    legacy,
    bob,
    3000
  );

  assert.equal(updated.attribution.createdBy, 'u_orig');
  assert.equal(updated.attribution.createdByName, 'Original Author');
  assert.equal(updated.attribution.createdAt, 500);
  assert.equal(updated.attribution.lastModifiedBy, 'u_bob');
  assert.equal(updated.attribution.lastModifiedAt, 3000);
});

test('client attribution utilities provide deterministic colours and local stamping (#214)', () => {
  const c1 = attributionColorForUser('user_123');
  const c2 = attributionColorForUser('user_123');
  assert.equal(c1, c2);
  assert.ok(c1.startsWith('#'));

  assert.equal(attributionColorForUser('user_123', '#ec4899'), '#ec4899');
  assert.equal(blameOverlayColor('#3b82f6', 0.25), 'rgba(59,130,246,0.25)');

  const sticky: StickyNote = {
    id: 'st1',
    type: 'sticky',
    x: 10,
    y: 10,
    width: 200,
    height: 120,
    text: 'Hello',
    color: '#fef08a',
    userId: 'u_guest1',
    userName: 'Artist Fox',
    updatedAt: 1000,
  };
  const stamped = stampLocalAttribution(sticky, undefined, { id: 'u_guest1', name: 'Artist Fox', color: '#f59e0b' }, 1000);
  assert.equal(stamped.attribution?.createdByName, 'Artist Fox');
  assert.equal(stamped.attribution?.createdByColor, '#f59e0b');

  // Legacy fallback without attribution object resolves from element + users map
  const effective = getEffectiveAttribution(sticky, {
    u_guest1: { id: 'u_guest1', name: 'Artist Fox', color: '#f59e0b' },
  });
  assert.equal(effective.createdBy, 'u_guest1');
  assert.equal(effective.createdByName, 'Artist Fox');
  assert.equal(effective.createdByColor, '#f59e0b');
});

test('findHoveredElementAtPoint respects z-order, strokes, wires, and empty canvas (#214)', () => {
  const shapeBottom: ShapeElement = {
    id: 's1',
    type: 'shape',
    shapeType: 'rectangle',
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    color: '#000',
    strokeWidth: 2,
    userId: 'u1',
    updatedAt: 100,
  };
  const stickyTop: StickyNote = {
    id: 'st1',
    type: 'sticky',
    x: 50,
    y: 50,
    width: 100,
    height: 80,
    text: 'Top',
    color: '#fef08a',
    userId: 'u2',
    userName: 'Bob',
    updatedAt: 200,
  };
  const shapeRight: ShapeElement = {
    id: 's2',
    type: 'shape',
    shapeType: 'rectangle',
    x: 400,
    y: 0,
    width: 100,
    height: 100,
    color: '#000',
    strokeWidth: 2,
    userId: 'u1',
    updatedAt: 150,
  };
  const stroke: DrawingStroke = {
    id: 'str1',
    type: 'stroke',
    points: [{ x: 10, y: 300 }, { x: 110, y: 300 }],
    color: '#000',
    size: 4,
    userId: 'u1',
    createdAt: 120,
  };
  const wire: WireElement = {
    id: 'w1',
    type: 'wire',
    fromId: 's1',
    toId: 's2',
    wireType: 'line',
    color: '#000',
    strokeWidth: 3,
    userId: 'u2',
    updatedAt: 250,
  };

  const elements: Record<string, CanvasElement> = {
    s1: shapeBottom,
    st1: stickyTop,
    s2: shapeRight,
    str1: stroke,
    w1: wire,
  };
  const positioned = [shapeBottom, stickyTop, shapeRight];
  const spatial = new SpatialIndex(elements);

  // Overlapping point hits topmost positioned element
  assert.equal(findHoveredElementAtPoint({ x: 80, y: 80 }, positioned, spatial, [wire], elements, 1)?.id, 'st1');
  // Non-overlapping corner hits bottom shape
  assert.equal(findHoveredElementAtPoint({ x: 10, y: 10 }, positioned, spatial, [wire], elements, 1)?.id, 's1');
  // Stroke point hits stroke
  assert.equal(findHoveredElementAtPoint({ x: 60, y: 302 }, positioned, spatial, [wire], elements, 1)?.id, 'str1');
  // Line wire midpoint between (200, 75) and (400, 50) -> (300, 62.5) hits wire
  assert.equal(findHoveredElementAtPoint({ x: 300, y: 63 }, positioned, spatial, [wire], elements, 1)?.id, 'w1');
  // Empty canvas returns null
  assert.equal(findHoveredElementAtPoint({ x: 900, y: 900 }, positioned, spatial, [wire], elements, 1), null);
});

test('server board-cleared includes clearedBy metadata and App wires blame UI (#214)', () => {
  const serverSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(serverSource, /stampElementAttribution/);
  assert.match(serverSource, /clearedBy:\s*\{/);

  const appSource = readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /useBlameMode\(elements,\s*users\)/);
  assert.match(appSource, /<BlameModeLegend/);
  assert.match(appSource, /<AttributionTooltip/);
});
