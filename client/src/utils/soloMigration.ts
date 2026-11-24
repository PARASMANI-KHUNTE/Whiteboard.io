/** A pending solo→multiplayer board migration, scoped to its target room. */
export interface SoloMigration {
  roomId: string;
}

/**
 * Socket.IO reconnects in place and re-joins the same room, so a transient
 * `connect_error` must not discard a migration for that room. A migration
 * targeting a different room is stale and should be dropped.
 */
export function shouldKeepSoloMigrationAfterConnectError(
  migration: SoloMigration | null,
  activeRoomId: string | null
): boolean {
  return migration !== null && activeRoomId !== null && migration.roomId === activeRoomId;
}
