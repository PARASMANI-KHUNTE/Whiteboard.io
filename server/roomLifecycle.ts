/**
 * Room lifecycle manager for empty room cleanup timers (#104).
 * Tracks scheduled cleanup timers per room, clears them when users rejoin or
 * rooms are deleted, and cancels timers on graceful shutdown.
 */
export class RoomLifecycleManager<TRoom extends { users: Record<string, unknown> }> {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly rooms: Map<string, TRoom>;
  private readonly ttlMs: number;

  constructor(rooms: Map<string, TRoom>, ttlMs = 3600000) {
    this.rooms = rooms;
    this.ttlMs = ttlMs;
  }

  /**
   * Called when a room becomes empty (last user leaves).
   * Schedules a delayed cleanup timer, cancelling any pre-existing timer for that room.
   */
  scheduleCleanup(roomId: string, onCleanup?: (roomId: string) => void): void {
    this.cancelCleanup(roomId);

    const timer = setTimeout(() => {
      this.timers.delete(roomId);
      const room = this.rooms.get(roomId);
      if (room && Object.keys(room.users).length === 0) {
        this.rooms.delete(roomId);
        onCleanup?.(roomId);
      }
    }, this.ttlMs);

    // unref so the cleanup timer doesn't keep the process alive
    timer.unref?.();
    this.timers.set(roomId, timer);
  }

  /**
   * Called when a user joins or accesses a room, or when a room is explicitly deleted.
   * Cancels any pending cleanup timer.
   */
  cancelCleanup(roomId: string): boolean {
    const existing = this.timers.get(roomId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(roomId);
      return true;
    }
    return false;
  }

  /**
   * Checks whether a room has a pending cleanup timer.
   */
  hasPendingCleanup(roomId: string): boolean {
    return this.timers.has(roomId);
  }

  /**
   * Cancels all scheduled room cleanup timers (e.g. during graceful shutdown).
   */
  clearAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}
