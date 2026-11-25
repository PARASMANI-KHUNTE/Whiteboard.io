interface TimedEntry<T> {
  value: T;
  expiresAt: number;
}

/** Small TTL cache with LRU eviction so graph responses cannot grow forever. */
export class TimedCache<T> {
  private readonly store = new Map<string, TimedEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number
  ) {}

  get size(): number {
    return this.store.size;
  }

  get(key: string, now: number = Date.now()): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }

    // Delete and re-insert so the most recently used entry is last in the Map.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, now: number = Date.now()): void {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: now + this.ttlMs });

    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  prune(now: number = Date.now()): void {
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }
}
