import assert from 'node:assert/strict';
import test from 'node:test';
import { TimedCache } from './responseCache';

test('evicts the least recently used entry when full', () => {
  const cache = new TimedCache<string>(2, 1000);
  cache.set('a', 'A', 0);
  cache.set('b', 'B', 0);
  assert.equal(cache.get('a', 1), 'A');
  cache.set('c', 'C', 1);

  assert.equal(cache.get('b', 2), undefined);
  assert.equal(cache.get('a', 2), 'A');
  assert.equal(cache.get('c', 2), 'C');
});

test('get and prune remove expired entries', () => {
  const cache = new TimedCache<string>(4, 10);
  cache.set('old', 'OLD', 0);
  cache.set('fresh', 'FRESH', 9);

  assert.equal(cache.get('old', 11), undefined);
  assert.equal(cache.get('fresh', 11), 'FRESH');
  cache.set('also-old', 'OLD', 0);
  cache.prune(20);
  assert.equal(cache.size, 0);
});
