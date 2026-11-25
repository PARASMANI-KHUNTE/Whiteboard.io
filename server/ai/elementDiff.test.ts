import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diffAiElements,
  sameElementContent,
  sameSubstantiveContent,
} from '../../client/src/ai/elementDiff';
import type { ShapeElement, WireElement } from '../../client/src/types';

function makeShape(
  id: string,
  text: string,
  x: number,
  y: number,
  updatedAt = 100
): ShapeElement {
  return {
    id,
    type: 'shape',
    shapeType: 'rectangle',
    x,
    y,
    width: 200,
    height: 90,
    color: '#3b82f6',
    strokeWidth: 2,
    text,
    userId: 'ai',
    userName: 'AI',
    updatedAt,
  };
}

function makeWire(
  id: string,
  fromId: string,
  toId: string,
  updatedAt = 100
): WireElement {
  return {
    id,
    type: 'wire',
    wireType: 'curve',
    fromId,
    toId,
    fromAnchor: 'bottom',
    toAnchor: 'top',
    color: '#64748b',
    strokeWidth: 2,
    arrowEnd: true,
    userId: 'ai',
    userName: 'AI',
    updatedAt,
  };
}

test('diffAiElements isolates newly created nodes and ignores purely shifted siblings (#198)', () => {
  const current = [
    makeShape('ai_s1_n_api', 'API Gateway', 100, 100, 1),
    makeShape('ai_s1_n_db', 'PostgreSQL', 100, 260, 1),
  ];

  // Re-centering shifts existing nodes horizontally by 40px while adding Redis cache
  const next = [
    makeShape('ai_s1_n_api', 'API Gateway', 140, 100, 2),
    makeShape('ai_s1_n_redis', 'Redis Cache', 420, 180, 2),
    makeShape('ai_s1_n_db', 'PostgreSQL', 140, 260, 2),
    makeWire('ai_s1_w_1', 'ai_s1_n_api', 'ai_s1_n_redis', 2),
  ];

  const diff = diffAiElements(current, next);
  assert.deepEqual(
    diff.created.map((e) => e.id),
    ['ai_s1_n_redis', 'ai_s1_w_1']
  );
  assert.equal(diff.updated.length, 2);
  assert.equal(diff.substantivelyUpdated.length, 0);
  assert.deepEqual(
    diff.focusElements.map((e) => e.id),
    ['ai_s1_n_redis', 'ai_s1_w_1']
  );
});

test('diffAiElements isolates substantively edited existing nodes (#198)', () => {
  const current = [
    makeShape('ai_s1_n_api', 'API Gateway', 100, 100, 1),
    makeShape('ai_s1_n_db', 'Database', 100, 260, 1),
  ];
  const next = [
    makeShape('ai_s1_n_api', 'API Gateway', 120, 100, 2),
    makeShape('ai_s1_n_db', 'Primary Postgres + Read Replica', 120, 260, 2),
  ];

  assert.equal(sameElementContent(current[0], next[0]), false);
  assert.equal(sameSubstantiveContent(current[0], next[0]), true);
  assert.equal(sameSubstantiveContent(current[1], next[1]), false);

  const diff = diffAiElements(current, next);
  assert.equal(diff.created.length, 0);
  assert.deepEqual(
    diff.substantivelyUpdated.map((e) => e.id),
    ['ai_s1_n_db']
  );
  assert.deepEqual(
    diff.focusElements.map((e) => e.id),
    ['ai_s1_n_db']
  );
});

test('diffAiElements falls back to updated elements on pure layout shifts (#198)', () => {
  const current = [
    makeShape('ai_s1_n_api', 'API Gateway', 100, 100, 1),
    makeShape('ai_s1_n_db', 'PostgreSQL', 100, 260, 1),
  ];
  const next = [
    makeShape('ai_s1_n_api', 'API Gateway', 100, 100, 2),
    makeShape('ai_s1_n_db', 'PostgreSQL', 360, 100, 2),
  ];

  const diff = diffAiElements(current, next);
  assert.equal(diff.created.length, 0);
  assert.equal(diff.substantivelyUpdated.length, 0);
  assert.deepEqual(
    diff.focusElements.map((e) => e.id),
    ['ai_s1_n_db']
  );
});
