import { useState, useEffect, useCallback } from 'react';
import { AuthUser, SessionRoom } from '../types';

export type { AuthUser, SessionRoom };

const TOKEN_KEY = 'whiteboard_auth_token';
const USER_KEY = 'whiteboard_cached_user';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const cached = localStorage.getItem(USER_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY) || null;
  });
  const [myRooms, setMyRooms] = useState<SessionRoom[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const saveAuth = useCallback((newUser: AuthUser, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    setMyRooms([]);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }, []);

  // Fetch current user on mount
  useEffect(() => {
    const checkAuth = async () => {
      const currentToken = localStorage.getItem(TOKEN_KEY);
      if (!currentToken) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${currentToken}` },
        });
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } else {
          // Token expired or invalid
          clearAuth();
        }
      } catch (err) {
        console.warn('Failed to verify token:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [clearAuth]);

  // Global window message listener for OAuth popups
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      const allowedOrigins = [
        window.location.origin,
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
      ];
      if (!allowedOrigins.includes(event.origin)) {
        return;
      }

      if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS' && event.data.token && event.data.user) {
        saveAuth(event.data.user, event.data.token);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [saveAuth]);

  // Fetch user's created rooms
  const fetchMyRooms = useCallback(async () => {
    const currentToken = token || localStorage.getItem(TOKEN_KEY);
    if (!currentToken) return;

    try {
      const res = await fetch('/api/rooms/my-rooms', {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        setMyRooms(data.rooms);
      }
    } catch (err) {
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Login failed' };
      }
      saveAuth(data.user, data.token);
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
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Registration failed' };
      }
      saveAuth(data.user, data.token);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error during registration' };
    }
  };

  // Continue as Guest action
  const continueAsGuest = async (name?: string, color?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Guest setup failed' };
      }
      saveAuth(data.user, data.token);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  // Logout action
  const logout = async () => {
    clearAuth();
    // Re-initialize a fresh guest identity so whiteboard continues seamlessly
    try {
      const res = await fetch('/api/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success && data.user && data.token) {
        saveAuth(data.user, data.token);
      }
    } catch {
      // Ignored
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
      const urlRes = await fetch(`/api/auth/google/url?origin=${encodeURIComponent(window.location.origin)}`);
      const urlData = await urlRes.json();

      if (urlData.configured && urlData.url) {
        const width = 520;
        const height = 640;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
          urlData.url,
          'google_oauth_popup',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );

        if (!popup) {
          return { success: false, error: 'Popup blocked. Please allow popups for this site to sign in with Google.' };
        }

        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            window.removeEventListener('message', handleMsg);
            resolve({ success: false, error: 'Google sign-in timed out or was closed.' });
          }, 120000);

          const handleMsg = (event: MessageEvent) => {
            if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS') {
              clearTimeout(timeout);
              window.removeEventListener('message', handleMsg);
              saveAuth(event.data.user, event.data.token);
              fetchMyRooms();
              resolve({ success: true });
            } else if (event.data?.type === 'GOOGLE_OAUTH_ERROR') {
              clearTimeout(timeout);
              window.removeEventListener('message', handleMsg);
              resolve({ success: false, error: event.data.error || 'Google authentication failed' });
            }
          };

          window.addEventListener('message', handleMsg);
        });
      } else {
        return {
          success: false,
          error: urlData.message || 'Google OAuth is not configured on the server. Please verify GOOGLE_CLIENT_ID in server/.env.',
        };
      }
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
      const currentToken = token || localStorage.getItem(TOKEN_KEY);
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to create room' };
      }
      setMyRooms((prev) => [data.room, ...prev.filter((r) => r.id !== data.room.id)]);
      return { success: true, room: data.room };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error while creating room' };
    }
  };

  const deleteRoom = async (roomId: string): Promise<{ success: boolean; error?: string }> => {
    const currentToken = token || localStorage.getItem(TOKEN_KEY);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to delete room' };
      }
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

