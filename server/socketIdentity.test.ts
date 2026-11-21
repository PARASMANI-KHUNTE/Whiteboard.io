import assert from 'node:assert/strict';
import test from 'node:test';
import type { SanitizedUser } from './auth';
import { resolveSocketIdentity } from './socketIdentity';

function account(overrides: Partial<SanitizedUser> = {}): SanitizedUser {
  return {
    id: 'guest_server_123',
    username: 'guest_123',
    email: 'guest_123@guest.local',
    name: 'Server Guest',
    color: '#10b981',
    createdAt: Date.now(),
    createdRooms: [],
    isGuest: true,
    ...overrides,
  };
}

test('rejects a join without a server-issued account', () => {
  const identity = resolveSocketIdentity(null, { id: 'u_victim123', name: 'Attacker' });
  assert.equal(identity, null);
});

test('ignores a client-supplied id even when it matches a visible host id', () => {
  const identity = resolveSocketIdentity(account(), { id: 'u_victim123', name: 'Attacker' });
  assert.equal(identity?.id, 'guest_server_123');
});

test('uses the account id when the client omits user details entirely', () => {
  const identity = resolveSocketIdentity(account(), undefined);
  assert.equal(identity?.id, 'guest_server_123');
  assert.equal(identity?.name, 'Server Guest');
  assert.equal(identity?.color, '#10b981');
});

test('allows a client to customize only display name and color', () => {
  const identity = resolveSocketIdentity(account(), {
    id: 'u_other',
    name: '  Artist Fox  ',
    color: '#ff0000',
  });
  assert.equal(identity?.name, 'Artist Fox');
  assert.equal(identity?.color, '#ff0000');
  assert.equal(identity?.id, 'guest_server_123');
});

test('falls back to account values for invalid or oversized display fields', () => {
  const identity = resolveSocketIdentity(account(), {
    name: 'x'.repeat(200),
    color: 'javascript:alert(1)',
  });
  assert.equal(identity?.name.length, 48);
  assert.equal(identity?.color, '#10b981');
});
