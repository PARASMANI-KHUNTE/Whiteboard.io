/** Rooms this browser has joined, used to rediscover sessions for guests. */

const KEY = 'whiteboard_recent_rooms';
const LIMIT = 8;

export interface RecentRoom {
  id: string;
  name: string;
  lastVisitedAt: number;
}

function read(): RecentRoom[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (room): room is RecentRoom =>
        Boolean(room) && typeof room.id === 'string' && typeof room.name === 'string'
    );
  } catch {
    return [];
  }
}

function write(rooms: RecentRoom[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms));
  } catch {
    // Storage unavailable; recent-session discovery is best-effort.
  }
}

export function getRecentRooms(): RecentRoom[] {
  return read().sort((a, b) => (b.lastVisitedAt || 0) - (a.lastVisitedAt || 0));
}

export function rememberRecentRoom(id: string, name: string): void {
  const cleanId = (id || '').trim().toUpperCase();
  if (!cleanId) return;
  const cleanName = (name || '').trim() || `Room ${cleanId}`;
  const existing = read().filter((room) => room.id !== cleanId);
  write([{ id: cleanId, name: cleanName, lastVisitedAt: Date.now() }, ...existing].slice(0, LIMIT));
}

export function forgetRecentRoom(id: string): void {
  const cleanId = (id || '').trim().toUpperCase();
  if (!cleanId) return;
  write(read().filter((room) => room.id !== cleanId));
}
