import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTrustProxy } from './trustProxy';

test('TRUST_PROXY=true is ignored so spoofed X-Forwarded-For cannot select a bucket (#75)', () => {
  const config = parseTrustProxy('true');

  assert.equal(config.hops, null);
  assert.match(String(config.warning), /use a non-negative integer hop count/);
  assert.match(String(config.warning), /never "true"/);
});

test('TRUST_PROXY accepts only numeric hop counts or explicit disable (#75)', () => {
  assert.deepEqual(parseTrustProxy(undefined), { hops: null });
  assert.deepEqual(parseTrustProxy('  FALSE '), { hops: null });
  assert.deepEqual(parseTrustProxy('0'), { hops: 0 });
  assert.deepEqual(parseTrustProxy(' 2 '), { hops: 2 });

  const cidr = parseTrustProxy('172.16.0.0/12');
  assert.equal(cidr.hops, null);
  assert.match(String(cidr.warning), /hop count/);

  assert.equal(parseTrustProxy('-1').hops, null);
  assert.equal(parseTrustProxy('one').hops, null);
});
