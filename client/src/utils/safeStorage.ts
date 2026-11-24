/**
 * localStorage can throw even for simple reads/writes: sandboxed iframes,
 * blocked third-party cookies, privacy modes, and full quotas all surface as
 * SecurityError/QuotaExceededError. Credential handling must keep working with
 * in-memory state when that happens.
 */

export function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when persistence failed; callers can keep in-memory state. */
export function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    // Nothing useful to do: the in-memory credential state is the source of
    // truth for this page load when storage is unavailable.
  }
}
