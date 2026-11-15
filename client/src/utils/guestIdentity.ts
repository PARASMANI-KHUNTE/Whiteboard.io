/**
 * Stable anonymous identity for this browser.
 *
 * The server persists `rooms.creatorId`, kicks and permissions against the id a
 * client announces. Keeping that id in localStorage (instead of regenerating it
 * on every page load) is what makes host rights and moderation survive a
 * reload, a new tab, or a server restart.
 */

const ID_KEY = 'whiteboard_guest_id';
const NAME_KEY = 'whiteboard_guest_name';
const COLOR_KEY = 'whiteboard_guest_color';

// One-time migration from the old per-tab sessionStorage name/color keys.
const LEGACY_NAME_KEY = 'collab_user_name';
const LEGACY_COLOR_KEY = 'collab_user_color';

const ANIMAL_NAMES = ['Fox', 'Panda', 'Otter', 'Falcon', 'Lynx', 'Koala', 'Owl', 'Badger', 'Dolphin'];

const USER_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
];

export interface GuestIdentity {
  id: string;
  name: string;
  color: string;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode / blocked cookies); the
    // in-memory identity still works for this page load.
  }
}

function createGuestId(): string {
  return 'u_' + Math.random().toString(36).substring(2, 9);
}

export function getGuestIdentityId(): string {
  return getGuestIdentity().id;
}

export function getGuestIdentity(): GuestIdentity {
  if (typeof window === 'undefined') {
    return { id: 'user_ssr', name: 'Artist Guest', color: '#3b82f6' };
  }

  let id = safeGet(ID_KEY);
  if (!id) {
    // Fall back to the old per-page id when localStorage is unavailable so a
    // single session keeps a consistent identity.
    const legacyTabId = (window as unknown as { __collab_tab_session_id?: string }).__collab_tab_session_id;
    id = legacyTabId || createGuestId();
    safeSet(ID_KEY, id);
  }

  let name = safeGet(NAME_KEY);
  if (!name) {
    try {
      name = sessionStorage.getItem(LEGACY_NAME_KEY);
    } catch {
      name = null;
    }
  }
  if (!name) {
    const animal = ANIMAL_NAMES[Math.floor(Math.random() * ANIMAL_NAMES.length)];
    name = `Artist ${animal}`;
  }
  safeSet(NAME_KEY, name);

  let color = safeGet(COLOR_KEY);
  if (!color) {
    try {
      color = sessionStorage.getItem(LEGACY_COLOR_KEY);
    } catch {
      color = null;
    }
  }
  if (!color) {
    color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
  }
  safeSet(COLOR_KEY, color);

  return { id, name, color };
}

export function saveGuestIdentityName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  safeSet(NAME_KEY, trimmed);
}

export function saveGuestIdentityColor(color: string) {
  if (!color) return;
  safeSet(COLOR_KEY, color);
}
