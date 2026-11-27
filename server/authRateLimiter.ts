import type express from "express";

export interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number, now: number): Promise<RateLimitRecord>;
}

/**
 * Bounded in-memory rate-limit store used as a local fallback (and in tests).
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitRecord>();
  private readonly maxKeys: number;

  constructor(maxKeys = 10_000) {
    this.maxKeys = Math.max(1, Math.floor(maxKeys));
  }

  async increment(key: string, windowMs: number, now: number): Promise<RateLimitRecord> {
    const existing = this.buckets.get(key);
    if (!existing || now > existing.resetTime) {
      const fresh: RateLimitRecord = { count: 1, resetTime: now + windowMs };
      this.remember(key, fresh);
      return { ...fresh };
    }

    existing.count += 1;
    // Refresh insertion order for LRU eviction.
    this.buckets.delete(key);
    this.buckets.set(key, existing);
    return { ...existing };
  }

  prune(now: number = Date.now()): void {
    for (const [key, record] of this.buckets.entries()) {
      if (now > record.resetTime) {
        this.buckets.delete(key);
      }
    }
  }

  get size(): number {
    return this.buckets.size;
  }

  private remember(key: string, record: RateLimitRecord): void {
    if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest !== undefined) this.buckets.delete(oldest);
    }
    this.buckets.set(key, record);
  }
}

export interface MongoRateLimitCollection {
  findOneAndUpdate(
    filter: { key: string },
    update: unknown,
    options: { upsert: boolean; returnDocument: "after" }
  ): Promise<{ count?: number; expiresAt?: Date } | null>;
}

/**
 * Distributed rate-limit store backed by MongoDB so horizontal replicas share
 * per-IP/per-bucket counters instead of multiplying limits by process count.
 * Falls back to the bounded in-memory store if MongoDB is unavailable.
 */
export class DistributedRateLimitStore implements RateLimitStore {
  constructor(
    private readonly getCollection: () => MongoRateLimitCollection | null,
    private readonly fallback: MemoryRateLimitStore
  ) {}

  async increment(key: string, windowMs: number, now: number): Promise<RateLimitRecord> {
    const col = this.getCollection();
    if (!col) {
      return this.fallback.increment(key, windowMs, now);
    }

    const nowDate = new Date(now);
    const nextExpiry = new Date(now + windowMs);

    try {
      const doc = await col.findOneAndUpdate(
        { key },
        [
          {
            $set: {
              count: {
                $cond: [
                  {
                    $or: [
                      { $eq: [{ $ifNull: ["$expiresAt", null] }, null] },
                      { $lte: ["$expiresAt", nowDate] },
                    ],
                  },
                  1,
                  { $add: [{ $ifNull: ["$count", 0] }, 1] },
                ],
              },
              expiresAt: {
                $cond: [
                  {
                    $or: [
                      { $eq: [{ $ifNull: ["$expiresAt", null] }, null] },
                      { $lte: ["$expiresAt", nowDate] },
                    ],
                  },
                  nextExpiry,
                  "$expiresAt",
                ],
              },
            },
          },
        ],
        { upsert: true, returnDocument: "after" }
      );

      if (doc && typeof doc.count === "number" && doc.expiresAt instanceof Date) {
        return { count: doc.count, resetTime: doc.expiresAt.getTime() };
      }
    } catch {
      // Fall back to bounded in-memory limiting rather than failing open or 500ing auth routes.
    }

    return this.fallback.increment(key, windowMs, now);
  }
}

export function createAuthRateLimiter(
  store: RateLimitStore,
  now: () => number = Date.now
) {
  return function authRateLimiter(maxRequests = 30, windowMs = 60000, bucket = "default") {
    return async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ): Promise<void> => {
      const ip = req.ip || req.socket?.remoteAddress || "unknown_ip";
      const key = `${bucket}:${ip}`;
      const record = await store.increment(key, windowMs, now());

      if (record.count > maxRequests) {
        res.status(429).json({
          success: false,
          error: "Too many requests. Please slow down and try again shortly.",
        });
        return;
      }

      next();
    };
  };
}
