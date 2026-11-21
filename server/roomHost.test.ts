import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseReplacementHost } from './roomHost';

const users = {
  host: { id: 'host', name: 'Host', isHost: true, role: 'admin' as const, canWrite: true },
  alice: { id: 'alice', name: 'Alice', role: 'editor' as const, canWrite: true },
  bob: { id: 'bob', name: 'Bob', role: 'viewer' as const, canWrite: false },
};

test('promotes the first remaining participant when the creator leaves', () => {
  assert.equal(chooseReplacementHost(users, 'host', 'host')?.id, 'alice');
});

test('promotes a participant when ownership has not been claimed yet', () => {
  assert.equal(chooseReplacementHost(users, 'host', '')?.id, 'alice');
});

test('does not transfer ownership when the recorded creator stays', () => {
  assert.equal(chooseReplacementHost(users, 'alice', 'host'), null);
});

test('returns null when no participants remain after the creator leaves', () => {
  assert.equal(chooseReplacementHost({ host: users.host }, 'host', 'host'), null);
});
