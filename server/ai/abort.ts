/** Server-side cancellation support shared by the AI queue and providers. */
export class RequestAbortedError extends Error {
  constructor() {
    super("The AI request was cancelled.");
    this.name = "RequestAbortedError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new RequestAbortedError();
}

export interface CombinedSignal {
  signal: AbortSignal;
  dispose(): void;
}

/** Combine the provider timeout with the client's disconnect signal. */
export function combineWithTimeout(timeoutMs: number, external?: AbortSignal): CombinedSignal {
  const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
  const any = (AbortSignal as unknown as {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;
  if (typeof any === "function") {
    return {
      signal: any.call(AbortSignal, external ? [timeout, external] : [timeout]),
      dispose: () => {},
    };
  }

  // Fallback for runtimes without AbortSignal.any.
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  const dispose = () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
  const abort = (reason?: unknown) => {
    dispose();
    controller.abort(reason);
  };
  const attach = (source: AbortSignal) => {
    if (source.aborted) {
      abort(source.reason);
      return;
    }
    const listener = () => abort(source.reason);
    source.addEventListener("abort", listener, { once: true });
    cleanups.push(() => source.removeEventListener("abort", listener));
  };

  attach(timeout);
  if (external) attach(external);
  return { signal: controller.signal, dispose };
}

/** Abortable replacement for retry backoff timers. */
export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (ms <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new RequestAbortedError());
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface AbortableRequest {
  once(event: "aborted", listener: () => void): unknown;
  removeListener?: (event: "aborted", listener: () => void) => unknown;
}

export interface AbortableResponse {
  once(event: "close", listener: () => void): unknown;
  removeListener?: (event: "close", listener: () => void) => unknown;
  writableEnded?: boolean;
}

/** Abort work when the HTTP client disconnect, but not on a normal response. */
export function bindRequestAbort(req: AbortableRequest, res: AbortableResponse) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const onResponseClose = () => {
    if (!res.writableEnded) abort();
  };

  req.once("aborted", abort);
  res.once("close", onResponseClose);

  return {
    signal: controller.signal,
    dispose() {
      req.removeListener?.("aborted", abort);
      res.removeListener?.("close", onResponseClose);
    },
  };
}
