import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  name: string;
  color: string;
  createdAt: number;
  createdRooms: string[];
  isGuest?: boolean;
}

export interface SanitizedUser {
  id: string;
  username: string;
  email: string;
  name: string;
  color: string;
  createdAt: number;
  createdRooms: string[];
  isGuest?: boolean;
}

export interface SessionRoomMeta {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  isLocked: boolean;
}

// Data Directory for persistent local state
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'app_data.json');

// In-Memory Storage
const usersById = new Map<string, StoredUser>();
const usersByUsername = new Map<string, StoredUser>();
const usersByEmail = new Map<string, StoredUser>();
const tokenToUserId = new Map<string, string>();
const roomMetaById = new Map<string, SessionRoomMeta>();

// Ensure directory & load saved data
function loadPersistedData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.users)) {
        parsed.users.forEach((u: StoredUser) => {
          usersById.set(u.id, u);
          if (u.username) usersByUsername.set(u.username.toLowerCase(), u);
          if (u.email) usersByEmail.set(u.email.toLowerCase(), u);
        });
      }
      if (Array.isArray(parsed.rooms)) {
        parsed.rooms.forEach((r: SessionRoomMeta) => {
          roomMetaById.set(r.id, r);
        });
      }
    }
  } catch (err) {
    console.warn('Could not load persisted app data:', err);
  }
}

function persistData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      users: Array.from(usersById.values()),
      rooms: Array.from(roomMetaById.values()),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist app data:', err);
  }
}

// Initialize on module load
loadPersistedData();

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return checkHash === hash;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function sanitizeUser(u: StoredUser): SanitizedUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    color: u.color,
    createdAt: u.createdAt,
    createdRooms: u.createdRooms || [],
    isGuest: u.isGuest,
  };
}

export function registerUser(params: {
  username: string;
  email: string;
  password: string;
  name?: string;
  color?: string;
}): { token: string; user: SanitizedUser } {
  const username = params.username.trim().toLowerCase();
  const email = params.email.trim().toLowerCase();

  if (username.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }
  if (!email.includes('@') || email.length < 5) {
    throw new Error('Please provide a valid email address.');
  }
  if (params.password.length < 5) {
    throw new Error('Password must be at least 5 characters.');
  }

  if (usersByUsername.has(username)) {
    throw new Error('This username is already taken.');
  }
  if (usersByEmail.has(email)) {
    throw new Error('An account with this email already exists.');
  }

  const { salt, hash } = hashPassword(params.password);
  const id = 'user_' + crypto.randomBytes(6).toString('hex');
  const name = (params.name && params.name.trim()) || params.username;
  const color = params.color || '#3b82f6';

  const newUser: StoredUser = {
    id,
    username,
    email,
    passwordHash: hash,
    salt,
    name,
    color,
    createdAt: Date.now(),
    createdRooms: [],
    isGuest: false,
  };

  usersById.set(id, newUser);
  usersByUsername.set(username, newUser);
  usersByEmail.set(email, newUser);

  const token = generateToken();
  tokenToUserId.set(token, id);

  persistData();

  return { token, user: sanitizeUser(newUser) };
}

export function loginUser(identifier: string, password: string): { token: string; user: SanitizedUser } {
  const cleaned = identifier.trim().toLowerCase();
  const user = usersByUsername.get(cleaned) || usersByEmail.get(cleaned);

  if (!user) {
    throw new Error('Account not found. Please check your username/email or register.');
  }

  const isValid = verifyPassword(password, user.salt, user.passwordHash);
  if (!isValid) {
    throw new Error('Incorrect password. Please try again.');
  }

  const token = generateToken();
  tokenToUserId.set(token, user.id);

  return { token, user: sanitizeUser(user) };
}

export function createGuestUser(name?: string, color?: string): { token: string; user: SanitizedUser } {
  const id = 'guest_' + crypto.randomBytes(5).toString('hex');
  const displayName = (name && name.trim()) || `Guest_${id.slice(-4)}`;
  const displayColor = color || '#10b981';

  const guestUser: StoredUser = {
    id,
    username: `guest_${id.slice(-4)}`,
    email: `${id}@guest.local`,
    passwordHash: '',
    salt: '',
    name: displayName,
    color: displayColor,
    createdAt: Date.now(),
    createdRooms: [],
    isGuest: true,
  };

  usersById.set(id, guestUser);
  const token = generateToken();
  tokenToUserId.set(token, id);

  return { token, user: sanitizeUser(guestUser) };
}

export function findOrCreateGoogleUser(googleProfile: {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}): { token: string; user: SanitizedUser } {
  const emailLower = (googleProfile.email || '').toLowerCase().trim();
  let existingUser = usersByEmail.get(emailLower);

  if (!existingUser && googleProfile.id) {
    existingUser = usersById.get(`google_${googleProfile.id}`);
  }

  if (existingUser) {
    if (googleProfile.name && (!existingUser.name || existingUser.name.startsWith('Guest_'))) {
      existingUser.name = googleProfile.name;
      persistData();
    }
    const token = generateToken();
    tokenToUserId.set(token, existingUser.id);
    return { token, user: sanitizeUser(existingUser) };
  }

  const userId = `google_${googleProfile.id || Math.random().toString(36).substring(2, 10)}`;
  const username = emailLower.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || `user_${userId.slice(-6)}`;
  const displayName = googleProfile.name || emailLower.split('@')[0] || 'Google User';

  const newUser: StoredUser = {
    id: userId,
    username,
    email: emailLower || `${userId}@google.local`,
    passwordHash: '',
    salt: '',
    name: displayName,
    color: '#3b82f6',
    createdAt: Date.now(),
    createdRooms: [],
    isGuest: false,
  };

  usersById.set(userId, newUser);
  if (emailLower) usersByEmail.set(emailLower, newUser);
  usersByUsername.set(username.toLowerCase(), newUser);
  persistData();

  const token = generateToken();
  tokenToUserId.set(token, userId);
  return { token, user: sanitizeUser(newUser) };
}

export function getUserByToken(token: string): SanitizedUser | null {
  if (!token) return null;
  const userId = tokenToUserId.get(token);
  if (!userId) return null;
  const user = usersById.get(userId);
  if (!user) return null;
  return sanitizeUser(user);
}

export function saveRoomMeta(room: SessionRoomMeta) {
  roomMetaById.set(room.id, room);
  // Add to creator's createdRooms
  const creator = usersById.get(room.creatorId);
  if (creator) {
    if (!creator.createdRooms.includes(room.id)) {
      creator.createdRooms.push(room.id);
      persistData();
    }
  } else {
    persistData();
  }
}

export function getRoomMeta(roomId: string): SessionRoomMeta | null {
  return roomMetaById.get(roomId) || null;
}

export function getRoomsForUser(userId: string): SessionRoomMeta[] {
  const list: SessionRoomMeta[] = [];
  roomMetaById.forEach((r) => {
    if (r.creatorId === userId) {
      list.push(r);
    }
  });
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += '-';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const ELEMENTS_DIR = path.join(DATA_DIR, 'elements');

export function loadRoomElements(roomId: string): Record<string, any> {
  try {
    const filePath = path.join(ELEMENTS_DIR, `${encodeURIComponent(roomId)}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`Could not load elements for room ${roomId}:`, err);
  }
  return {};
}

export function saveRoomElements(roomId: string, elements: Record<string, any>) {
  try {
    if (!fs.existsSync(ELEMENTS_DIR)) {
      fs.mkdirSync(ELEMENTS_DIR, { recursive: true });
    }
    const filePath = path.join(ELEMENTS_DIR, `${encodeURIComponent(roomId)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(elements), 'utf-8');
  } catch (err) {
    console.warn(`Could not persist elements for room ${roomId}:`, err);
  }
}
