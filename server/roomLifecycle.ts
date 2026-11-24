/**
 * Room lifecycle manager for empty room cleanup timers (#104).
 * Tracks scheduled cleanup timers per room, clears them when users rejoin or
 * rooms are deleted, and cancels timers on graceful shutdown.
 *
 * It also owns the live-room LRU bookkeeping (#74): joins admit new rooms only
 * while a bounded number of cached rooms exists, evicting the least recently
 * used idle room rather than letting the cache grow forever.
 */
export class RoomCapacityError extends Error {
  constructor() {
    super("Room capacity reached");
    this.name = "RoomCapacityError";
  }
}

export class RoomLifecycleManager<TRoom extends { users: Record<string, unknown> }> {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly lastActiveAt = new Map<string, number>();
  private readonly rooms: Map<string, TRoom>;
  private readonly ttlMs: number;

  constructor(rooms: Map<string, TRoom>, ttlMs = 3600000) {
    this.rooms = rooms;
    this.ttlMs = ttlMs;
  }

  /** Marks a room as recently used. New rooms are touched once loaded. */
  touch(roomId: string, now = Date.now()): void {
    this.lastActiveAt.delete(roomId);
    this.lastActiveAt.set(roomId, now);
  }

  /** Removes a room from the cache, its cleanup timer, and LRU tracking. */
  forget(roomId: string): void {
    this.cancelCleanup(roomId);
    this.rooms.delete(roomId);
    this.lastActiveAt.delete(roomId);
  }

  /**
   * Admits one new room into the bounded cache, evicting idle rooms oldest
   * first. Occupied rooms and the room being joined are never evicted.
   * `pendingCreations` accounts for in-flight loads that will also occupy a
   * slot once they finish. Returns false when no idle room can be reclaimed.
   */
  ensureCapacity(
    roomId: string,
    maxRooms: number,
    pendingCreations = 0,
    now = Date.now(),
    canEvict: (roomId: string) => boolean = () => true
  ): boolean {
    if (!Number.isFinite(maxRooms) || maxRooms < 1) return false;

    const existing = this.rooms.get(roomId);
    if (existing) {
      this.touch(roomId, now);
      return true;
    }

    this.syncTracking(now);
    while (this.rooms.size + pendingCreations >= maxRooms) {
      const victim = this.findIdleRoom(roomId, canEvict);
      if (!victim) return false;
      this.forget(victim);
    }
    return true;
  }

  private syncTracking(now: number): void {
    for (const roomId of this.lastActiveAt.keys()) {
      if (!this.rooms.has(roomId)) this.lastActiveAt.delete(roomId);
    }
    for (const roomId of this.rooms.keys()) {
      if (!this.lastActiveAt.has(roomId)) this.lastActiveAt.set(roomId, 0);
    }
    // Clamp skewed future timestamps so they cannot starve older idle rooms.
    for (const roomId of [...this.lastActiveAt.keys()]) {
      const time = this.lastActiveAt.get(roomId);
      if (time === undefined || time > now) this.lastActiveAt.set(roomId, now);
    }
  }

  private findIdleRoom(
    protectedRoomId: string,
    canEvict: (roomId: string) => boolean
  ): string | undefined {
    const isIdle = (roomId: string): boolean => {
      if (roomId === protectedRoomId) return false;
      const room = this.rooms.get(roomId);
      return Boolean(room && Object.keys(room.users).length === 0 && canEvict(roomId));
    };

    for (const roomId of this.lastActiveAt.keys()) {
      if (isIdle(roomId)) return roomId;
    }
    // Rooms inserted before LRU tracking was enabled are still reclaimable.
    for (const roomId of this.rooms.keys()) {
      if (isIdle(roomId)) return roomId;
    }
    return undefined;
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
        this.lastActiveAt.delete(roomId);
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
