import { delay, RequestAbortedError, throwIfAborted } from "./abort";

export class QueueFullError extends Error {
  readonly status = 429;

  constructor() {
    super("The AI request queue is full. Please try again shortly.");
    this.name = "QueueFullError";
  }
}

/**
 * Serializes outbound model calls with a minimum gap between starts.
 *
 * The depth limit turns overload into an immediate 429 instead of an
 * unbounded backlog of HTTP requests holding sockets open while they wait for
 * a provider call that may take tens of seconds. An abort releases the slot
 * immediately, even while the task is still queued or in flight.
 */
export class ThrottledQueue {
  private lastOutboundTime = 0;
  private tail: Promise<void> = Promise.resolve();
  private depth = 0;

  constructor(
    private readonly defaultIntervalMs: number,
    private readonly maxDepth: number
  ) {}

  get size(): number {
    return this.depth;
  }

  async schedule<T>(
    intervalMs: number,
    task: () => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    throwIfAborted(signal);
    if (this.depth >= this.maxDepth) {
      throw new QueueFullError();
    }

    const interval = Number.isFinite(intervalMs) && intervalMs >= 0
      ? intervalMs
      : this.defaultIntervalMs;
    this.depth += 1;

    let removeAbortListener: (() => void) | undefined;
    const aborted = signal
      ? new Promise<never>((_, reject) => {
          const onAbort = () => reject(new RequestAbortedError());
          signal.addEventListener("abort", onAbort, { once: true });
          removeAbortListener = () => signal.removeEventListener("abort", onAbort);
        })
      : undefined;

    const run = async (): Promise<T> => {
      throwIfAborted(signal);
      const elapsed = Date.now() - this.lastOutboundTime;
      const waitTime = Math.max(0, interval - elapsed);
      if (waitTime > 0) {
        await delay(waitTime, signal);
      }
      throwIfAborted(signal);
      this.lastOutboundTime = Date.now();
      return task();
    };

    const next = this.tail.then(run, run);
    this.tail = next.then(
      () => {},
      () => {}
    );
    try {
      return aborted ? await Promise.race([next, aborted]) : await next;
    } finally {
      removeAbortListener?.();
      this.depth -= 1;
    }
  }
}
