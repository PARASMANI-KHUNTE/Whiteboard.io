import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthUser, SessionRoom } from '../types';
import { BACKEND_URL } from '../config';
import { getGuestIdentity } from '../utils/guestIdentity';
import {
  apiFetchJson,
  AUTH_USER_KEY,
} from '../utils/apiFetch';
import { subscribeToSessionExpired } from '../utils/authSession';
import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safeStorage';

export type { AuthUser, SessionRoom };

const USER_KEY = AUTH_USER_KEY;

/** Origins that are allowed to deliver OAuth credentials via postMessage. */
function getTrustedOAuthOrigins(): Set<string> {
  const allowed = new Set<string>();
  if (typeof window === 'undefined') return allowed;

  allowed.add(window.location.origin);
  if (import.meta.env.DEV) {
    allowed.add('http://localhost:5173');
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:5173');
    allowed.add('http://127.0.0.1:3000');
  }

  if (BACKEND_URL) {
    try {
      allowed.add(new URL(BACKEND_URL, window.location.origin).origin);
    } catch {}
  }

  const customAllowed = (import.meta.env.VITE_ALLOWED_ORIGINS as string | undefined)
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean) || [];
  customAllowed.forEach((o) => {
    try {
      allowed.add(new URL(o, window.location.origin).origin);
    } catch {}
  });

  return allowed;
}

function isTrustedOAuthOrigin(origin: string): boolean {
  if (!origin) return false;
  return getTrustedOAuthOrigins().has(origin);
}

interface OAuthResult {
  success: boolean;
  error?: string;
  isDemo?: boolean;
  message?: string;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const cached = safeGetItem(USER_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(null);
  const [myRooms, setMyRooms] = useState<SessionRoom[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  /** Set when a rejected session could not be replaced by a guest session. */
  const [authError, setAuthError] = useState<string | null>(null);
  const recoveringRef = useRef(false);

  // Every credential write advances this counter so an in-flight /auth/me
  // cannot overwrite a newer OAuth/guest session with stale data.
  const authGenerationRef = useRef(0);
  const popupRef = useRef<Window | null>(null);
  const oauthResolveRef = useRef<((result: OAuthResult) => void) | null>(null);
  const oauthTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveAuth = useCallback((newUser: AuthUser, newToken = 'cookie') => {
    authGenerationRef.current += 1;
    setUser(newUser);
    setToken(newToken);
    safeSetItem(USER_KEY, JSON.stringify(newUser));
  }, []);

  const clearAuth = useCallback(() => {
    authGenerationRef.current += 1;
    setUser(null);
    setToken(null);
    setMyRooms([]);
    setAuthError(null);
    safeRemoveItem(USER_KEY);
  }, []);

  const finishOAuth = useCallback((result: OAuthResult) => {
    if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
    oauthTimeoutRef.current = null;
    popupRef.current = null;
    const resolve = oauthResolveRef.current;
    oauthResolveRef.current = null;
    resolve?.(result);
  }, []);

  // Continue as Guest action. Declared before the auth check below so the
  // initial load can provision a server-issued guest session.
  const continueAsGuest = useCallback(async (
    name?: string,
    color?: string,
    expectedGeneration?: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/guest`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Guest setup failed' };
      }
      // A login may have landed while the guest request was in flight.
      if (expectedGeneration !== undefined && authGenerationRef.current !== expectedGeneration) {
        return { success: false, error: 'Session changed while creating guest account.' };
      }
      saveAuth(data.user);
      setAuthError(null);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }, [saveAuth]);

  /**
   * One recovery path for expired/invalid sessions. Guard against re-entry so
   * a burst of 401s from REST, AI and socket events provisions only one guest.
   */
  const recoverSession = useCallback(async () => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    try {
      // This used to run before the try: a storage failure here skipped the
      // finally block and left recoveringRef true forever (#67).
      clearAuth();
      const guest = getGuestIdentity();
      const result = await continueAsGuest(guest.name, guest.color);
      if (!result.success) {
        setAuthError(result.error || 'Could not create a new guest session. Please sign in.');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Could not create a new guest session. Please sign in.');
    } finally {
      recoveringRef.current = false;
    }
  }, [clearAuth, continueAsGuest]);

  // Any authenticated request can discover expiry; recover centrally.
  useEffect(() => subscribeToSessionExpired((detail) => {
    if (!detail.recoverable) {
      setAuthError(detail.reason);
      return;
    }
    void recoverSession();
  }), [recoverSession]);

  // Fetch current user on mount — session lives in an httpOnly cookie so the
  // server call verifies it without us touching localStorage for the token.
  useEffect(() => {
    const checkAuth = async () => {
      const generation = authGenerationRef.current;

      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
          credentials: 'include',
        });
        const data = await res.json();
        // OAuth/guest login may have completed while this request was in flight.
        if (authGenerationRef.current !== generation) return;
        if (res.ok && data.success && data.user) {
          saveAuth(data.user);
        } else {
          // Expired/invalid token: never leave user/token null with no recovery,
          // otherwise AuthModal opens and cannot be dismissed.
          await recoverSession();
        }
      } catch (err) {
        console.warn('Failed to verify token:', err);
        // A cached token from an offline reload may be stale. Do not present a
        // signed-in UI that the socket will immediately reject.
        await recoverSession();
      } finally {
        setIsLoading(false);
      }
    };

    void checkAuth().catch((err) => {
      // No storage or network failure may leave the app on "Checking
      // authentication..." forever (#67).
      console.warn('Auth check failed:', err);
      setIsLoading(false);
    });
  }, [recoverSession]);

  // The only window message listener for OAuth. Origin alone is not enough:
  // any same-origin/trusted window could inject credentials, so the message
  // must also come from the exact popup we opened.
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (type !== 'GOOGLE_OAUTH_SUCCESS' && type !== 'GOOGLE_OAUTH_ERROR') return;
      if (!popupRef.current || event.source !== popupRef.current) return;
      if (!isTrustedOAuthOrigin(event.origin)) return;

      if (type === 'GOOGLE_OAUTH_SUCCESS') {
        if (!event.data.user) {
          finishOAuth({ success: false, error: 'Google authentication returned invalid credentials.' });
          return;
        }
        saveAuth(event.data.user);
        finishOAuth({ success: true });
      } else {
        finishOAuth({ success: false, error: event.data.error || 'Google authentication failed' });
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => {
      window.removeEventListener('message', handleOAuthMessage);
      if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
    };
  }, [saveAuth, finishOAuth]);

  // Fetch user's created rooms
  const fetchMyRooms = useCallback(async () => {
    if (!token && !user) return;

    try {
      const data = await apiFetchJson<{ success: boolean; rooms: SessionRoom[] }>(
        '/api/rooms/my-rooms'
      );
      if (Array.isArray(data.rooms)) {
        setMyRooms(data.rooms);
      }
    } catch (err) {
      // A 401 already triggered session recovery via apiFetch.
      console.warn('Failed to fetch rooms:', err);
    }
  }, [token]);

  useEffect(() => {
    if (user && !user.isGuest) {
      fetchMyRooms();
    }
  }, [user, fetchMyRooms]);

  // Login action
  const login = async (identifier: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Login failed' };
      }
      saveAuth(data.user);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during login' };
    }
  };

  // Register action
  const register = async (params: {
    username: string;
    email: string;
    password: string;
    name?: string;
    color?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Registration failed' };
      }
      saveAuth(data.user);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during registration' };
    }
  };

  // Logout action
  const logout = async () => {
    clearAuth();
    try {
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
    // Re-initialize a fresh guest identity so whiteboard continues seamlessly
    const guest = getGuestIdentity();
    const result = await continueAsGuest(guest.name, guest.color);
    if (!result.success) {
      setAuthError(result.error || 'Signed out, but guest session setup failed. Please sign in.');
    }
  };

  // Google OAuth action
  const signInWithGoogle = async (_options?: { email?: string; name?: string }): Promise<{
    success: boolean;
    error?: string;
    isDemo?: boolean;
    message?: string;
  }> => {
    try {
      // Start the flow with a top-level navigation to the backend so the nonce
      // cookie is set first-party, even when the frontend is on a separate site.
      const startUrl = `${BACKEND_URL}/api/auth/google/start?origin=${encodeURIComponent(window.location.origin)}`;
      const width = 520;
      const height = 640;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        startUrl,
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );

      if (!popup) {
        return { success: false, error: 'Popup blocked. Please allow popups for this site to sign in with Google.' };
      }

      popupRef.current = popup;
      // The shared listener above resolves this promise; there is no second
      // listener that could saveAuth twice or race with /auth/me.
      return new Promise<OAuthResult>((resolve) => {
        oauthResolveRef.current = resolve;
        oauthTimeoutRef.current = setTimeout(() => {
          finishOAuth({ success: false, error: 'Google sign-in timed out or was closed.' });
        }, 120000);
      });
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during Google sign-in' };
    }
  };

  // Create room action
  const createRoom = async (params: {
    name: string;
    customCode?: string;
    isLocked?: boolean;
  }): Promise<{ success: boolean; room?: SessionRoom; error?: string }> => {
    try {
      const data = await apiFetchJson<{ success: boolean; room: SessionRoom; error?: string }>(
        '/api/rooms/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        }
      );
      setMyRooms((prev) => [data.room, ...prev.filter((r) => r.id !== data.room.id)]);
      return { success: true, room: data.room };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error while creating room' };
    }
  };

  const deleteRoom = async (roomId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await apiFetchJson(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      setMyRooms((prev) => prev.filter((r) => r.id !== roomId));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error while deleting room' };
    }
  };

  return {
    user,
    authUser: user,
    token,
    myRooms,
    isLoading,
    authError,
    login,
    register,
    continueAsGuest,
    logout,
    signInWithGoogle,
    createRoom,
    deleteRoom,
    fetchMyRooms,
    fetchRooms: fetchMyRooms,
  };
}

