import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLockToStoredPermissions,
  effectivePermission,
  setExplicitPermission,
  type RoomPermissionMap,
} from './roomPermissions';

test('an explicit revocation survives lock then unlock (#70)', () => {
  const permissions: RoomPermissionMap = {};

  setExplicitPermission(permissions, 'revoked', false);
  assert.deepEqual(effectivePermission(permissions.revoked, false), {
    canWrite: false,
    role: 'viewer',
  });

  applyLockToStoredPermissions(permissions, true, 'host');
  assert.deepEqual(effectivePermission(permissions.revoked, true), {
    canWrite: false,
    role: 'viewer',
  });

  applyLockToStoredPermissions(permissions, false, 'host');
  assert.deepEqual(effectivePermission(permissions.revoked, false), {
    canWrite: false,
    role: 'viewer',
  });
  assert.equal(permissions.revoked.explicit, true);
  assert.equal(permissions.revoked.canWrite, false);
});

test('lock forces view-only access but unlock restores explicit grants (#70)', () => {
  const permissions: RoomPermissionMap = {};
  setExplicitPermission(permissions, 'granted', true);

  applyLockToStoredPermissions(permissions, true, 'host');
  assert.deepEqual(effectivePermission(permissions.granted, true), {
    canWrite: false,
    role: 'viewer',
  });

  applyLockToStoredPermissions(permissions, false, 'host');
  assert.deepEqual(effectivePermission(permissions.granted, false), {
    canWrite: true,
    role: 'editor',
  });
});

test('users without an explicit override follow the room lock', () => {
  const permissions: RoomPermissionMap = {};

  applyLockToStoredPermissions(permissions, true, 'host');
  assert.deepEqual(permissions, {});

  permissions.guest = { canWrite: true, role: 'editor' };
  applyLockToStoredPermissions(permissions, true, 'host');
  assert.deepEqual(permissions.guest, { canWrite: false, role: 'viewer' });
  assert.deepEqual(effectivePermission(permissions.guest, true), {
    canWrite: false,
    role: 'viewer',
  });

  applyLockToStoredPermissions(permissions, false, 'host');
  assert.deepEqual(permissions.guest, { canWrite: true, role: 'editor' });
});

test('the host permission is never rewritten by a lock toggle', () => {
  const permissions: RoomPermissionMap = {
    host: { canWrite: true, role: 'admin' },
  };

  applyLockToStoredPermissions(permissions, true, 'host');

  assert.deepEqual(permissions.host, { canWrite: true, role: 'admin' });
});
