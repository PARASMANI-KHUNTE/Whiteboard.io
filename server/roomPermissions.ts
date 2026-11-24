import type { RoomPermission, RoomRole } from './auth';

export type RoomPermissionMap = Record<string, RoomPermission>;

export interface EffectivePermission {
  canWrite: boolean;
  role: RoomRole;
}

function defaultPermission(isLocked: boolean): EffectivePermission {
  return {
    canWrite: !isLocked,
    role: isLocked ? 'viewer' : 'editor',
  };
}

/**
 * Resolve what a stored permission means right now. An explicit host decision
 * is preserved across lock toggles, but a locked room always forces view-only
 * access (#70).
 */
export function effectivePermission(
  stored: RoomPermission | undefined,
  isLocked: boolean
): EffectivePermission {
  if (stored?.explicit === true) {
    const canWrite = stored.canWrite === true && !isLocked;
    return {
      canWrite,
      role: canWrite ? 'editor' : 'viewer',
    };
  }
  return defaultPermission(isLocked);
}

/** Record an explicit host grant/revoke without folding in the room lock. */
export function setExplicitPermission(
  permissions: RoomPermissionMap,
  userId: string,
  canWrite: boolean
): void {
  permissions[userId] = {
    canWrite,
    role: canWrite ? 'editor' : 'viewer',
    explicit: true,
  };
}

/**
 * Refresh persisted permissions for a lock change. Explicit host decisions are
 * untouched; only lock-derived defaults are recomputed (#70).
 */
export function applyLockToStoredPermissions(
  permissions: RoomPermissionMap,
  isLocked: boolean,
  hostId?: string
): void {
  for (const userId of Object.keys(permissions)) {
    if (userId === hostId) continue;
    if (permissions[userId]?.explicit === true) continue;
    const next = defaultPermission(isLocked);
    permissions[userId] = { ...next };
  }
}
