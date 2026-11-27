/**
 * Build the CORS / OAuth origin allowlist exclusively from environment
 * configuration (`APP_URL`, `CLIENT_URL`, `ALLOWED_ORIGINS`) so development
 * localhost origins are never hardcoded in production builds.
 */
export function buildAllowedOriginSet(
  env: Record<string, string | undefined> = process.env
): Set<string> {
  const allowed = new Set<string>();
  const rawAllowed = [env.APP_URL, env.CLIENT_URL, env.ALLOWED_ORIGINS]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .flatMap((value) => value.split(","));

  for (const raw of rawAllowed) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      allowed.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed origin entries instead of crashing server startup.
    }
  }

  return allowed;
}

export function resolveTrustedOriginFromSet(
  allowedOrigins: Set<string>,
  rawOrigin?: string,
  fallbackAppUrl?: string
): string {
  const fallback =
    (fallbackAppUrl || Array.from(allowedOrigins)[0] || "").replace(/\/$/, "");
  if (!rawOrigin) return fallback;
  try {
    const originUrl = new URL(rawOrigin).origin;
    if (allowedOrigins.has(originUrl)) {
      return originUrl;
    }
  } catch {
    // Fall back to the configured primary origin.
  }
  return fallback;
}
