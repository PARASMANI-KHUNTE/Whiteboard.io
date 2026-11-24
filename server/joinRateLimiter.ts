/**
 * Bounded sliding-window limiter for socket room joins (#74).
 *
 * Unlike the HTTP rate limiter, this is keyed by socket id and client address
 * because socket.io events never pass through express middleware. Both the
 * number of keys and the timestamps per key are bounded so a flood of joins
 * cannot turn the limiter itself into a memory leak.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the caller may try again when blocked. */
  retryAfterMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, maxKeys = 10_000, now: () => number = Date.now) {
    this.limit = Math.max(1, Math.floor(limit));
    this.windowMs = Math.max(1, Math.floor(windowMs));
    this.maxKeys = Math.max(1, Math.floor(maxKeys));
    this.now = now;
  }

  /** Records one attempt and reports whether it is inside the limit. */
  check(key: string): RateLimitResult {
    const current = this.now();
    const cutoff = current - this.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((time) => time > cutoff);

    if (timestamps.length >= this.limit) {
      // Keep the key so retryAfterMs remains stable for repeated attempts.
      this.hits.set(key, timestamps);
      return {
        allowed: false,
        retryAfterMs: Math.max(1, timestamps[0] + this.windowMs - current),
      };
    }

    timestamps.push(current);
    // Delete before set so iteration order doubles as an LRU eviction order.
    this.hits.delete(key);
    this.hits.set(key, timestamps);
    this.evictOldestKey();
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Drops stale timestamps and empty keys. Safe to call from a timer. */
  prune(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [key, timestamps] of this.hits.entries()) {
      const fresh = timestamps.filter((time) => time > cutoff);
      if (fresh.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, fresh);
      }
    }
  }

  /** Releases a key when its socket disconnects. */
  clear(key: string): void {
    this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }

  private evictOldestKey(): void {
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) return;
      this.hits.delete(oldest);
    }
  }
}
