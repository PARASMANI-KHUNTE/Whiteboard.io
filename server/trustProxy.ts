export interface TrustProxyConfig {
  /** Number of trusted proxy hops, or null when X-Forwarded-For is ignored. */
  hops: number | null;
  /** Reason an unsupported value was ignored, for startup logging. */
  warning?: string;
}

/**
 * Only numeric hop counts are supported. `TRUST_PROXY=true` would make express
 * trust the client-controlled leftmost X-Forwarded-For value, letting callers
 * mint a fresh rate-limit bucket per request (#75).
 */
export function parseTrustProxy(value: string | undefined): TrustProxyConfig {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw || raw === "false" || raw === "off" || raw === "no" || raw === "none") {
    return { hops: null };
  }

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (Number.isSafeInteger(hops)) return { hops };
    return {
      hops: null,
      warning: `Ignoring TRUST_PROXY="${value}": hop count is too large.`,
    };
  }

  return {
    hops: null,
    warning: `Ignoring TRUST_PROXY="${value}": use a non-negative integer hop count, never "true".`,
  };
}
