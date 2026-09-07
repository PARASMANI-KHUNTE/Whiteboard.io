import crypto from 'crypto';
import {
  getUsersCollection,
  getTokensCollection,
  getRoomsCollection,
  getElementsCollection,
  getIndividualElementsCollection,
  StoredUserDoc,
  SessionRoomDoc,
} from './db';

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
  googleId?: string;
  picture?: string;
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
  picture?: string;
}

export interface SessionRoomMeta {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  isLocked: boolean;
}

export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  // Check modern 100k iterations first
  const modernHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  if (modernHash === hash) return true;
  // Fallback to legacy 1,000 iterations
  const legacyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return legacyHash === hash;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function sanitizeUser(u: StoredUserDoc | StoredUser): SanitizedUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    color: u.color,
    createdAt: u.createdAt,
    createdRooms: u.createdRooms || [],
    isGuest: !!u.isGuest,
    picture: u.picture,
  };
}

function sanitizeString(val: any): string {
  if (typeof val !== 'string') return '';
  return val.trim();
}

export async function registerUser(params: {
  username: string;
  email: string;
  password: string;
  name?: string;
  color?: string;
}): Promise<{ token: string; user: SanitizedUser }> {
  const username = sanitizeString(params.username).toLowerCase();
  const email = sanitizeString(params.email).toLowerCase();
  const password = typeof params.password === 'string' ? params.password : '';

  if (username.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }
  if (!email.includes('@') || email.length < 5) {
    throw new Error('Please provide a valid email address.');
  }
  if (password.length < 5) {
    throw new Error('Password must be at least 5 characters.');
  }

  const users = getUsersCollection();
  const tokens = getTokensCollection();

  const existing = await users.findOne({
    $or: [{ username }, { email }],
  });

  if (existing) {
    if (existing.username === username) {
      throw new Error('This username is already taken.');
    }
    throw new Error('An account with this email already exists.');
  }

  const { salt, hash } = hashPassword(password);
  const id = 'user_' + crypto.randomBytes(6).toString('hex');
  const name = sanitizeString(params.name) || username;
  const color = sanitizeString(params.color) || '#3b82f6';

  const newUser: StoredUserDoc = {
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

  await users.insertOne(newUser);

  const token = generateToken();
  await tokens.insertOne({
    token,
    userId: id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { token, user: sanitizeUser(newUser) };
}

export async function loginUser(identifier: string, password: string): Promise<{ token: string; user: SanitizedUser }> {
  const cleaned = sanitizeString(identifier).toLowerCase();
  const pass = typeof password === 'string' ? password : '';

  if (!cleaned || !pass) {
    throw new Error('Please provide both username/email and password.');
  }

  const users = getUsersCollection();
  const tokens = getTokensCollection();

  const user = await users.findOne({
    $or: [{ username: cleaned }, { email: cleaned }],
  });

  if (!user) {
    throw new Error('Account not found. Please check your username/email or register.');
  }

  const isValid = verifyPassword(pass, user.salt, user.passwordHash);
  if (!isValid) {
    throw new Error('Incorrect password. Please try again.');
  }

  const token = generateToken();
  await tokens.insertOne({
    token,
    userId: user.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { token, user: sanitizeUser(user) };
}

export async function createGuestUser(name?: string, color?: string): Promise<{ token: string; user: SanitizedUser }> {
  const id = 'guest_' + crypto.randomBytes(5).toString('hex');
  const displayName = (name && name.trim()) || `Guest_${id.slice(-4)}`;
  const displayColor = color || '#10b981';

  const guestUser: StoredUserDoc = {
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

  const users = getUsersCollection();
  const tokens = getTokensCollection();

  await users.insertOne(guestUser);

  const token = generateToken();
  await tokens.insertOne({
    token,
    userId: id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { token, user: sanitizeUser(guestUser) };
}

export async function findOrCreateGoogleUser(googleProfile: {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}): Promise<{ token: string; user: SanitizedUser }> {
  const emailLower = (googleProfile.email || '').toLowerCase().trim();
  const users = getUsersCollection();
  const tokens = getTokensCollection();

  let existingUser = await users.findOne({
    $or: [
      { email: emailLower },
      { googleId: googleProfile.id },
      { id: `google_${googleProfile.id}` },
    ],
  });

  if (existingUser) {
    // Update name or picture if previously missing
    const updates: Partial<StoredUserDoc> = {};
    if (googleProfile.name && (!existingUser.name || existingUser.name.startsWith('Guest_'))) {
      updates.name = googleProfile.name;
    }
    if (googleProfile.picture && !existingUser.picture) {
      updates.picture = googleProfile.picture;
    }
    if (!existingUser.googleId && googleProfile.id) {
      updates.googleId = googleProfile.id;
    }

    if (Object.keys(updates).length > 0) {
      await users.updateOne({ id: existingUser.id }, { $set: updates });
      existingUser = { ...existingUser, ...updates };
    }

    const token = generateToken();
    await tokens.insertOne({
      token,
      userId: existingUser.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { token, user: sanitizeUser(existingUser) };
  }

  const userId = `google_${googleProfile.id || Math.random().toString(36).substring(2, 10)}`;
  const username = emailLower.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || `user_${userId.slice(-6)}`;
  const displayName = googleProfile.name || emailLower.split('@')[0] || 'Google User';

  const newUser: StoredUserDoc = {
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
    googleId: googleProfile.id,
    picture: googleProfile.picture,
  };

  await users.insertOne(newUser);

  const token = generateToken();
  await tokens.insertOne({
    token,
    userId: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { token, user: sanitizeUser(newUser) };
}

export async function getUserByToken(token: string): Promise<SanitizedUser | null> {
  const cleanToken = sanitizeString(token);
  if (!cleanToken) return null;
  const tokens = getTokensCollection();
  const tokenDoc = await tokens.findOne({ token: cleanToken });
  if (!tokenDoc) return null;

  const users = getUsersCollection();
  const user = await users.findOne({ id: tokenDoc.userId });
  if (!user) return null;

  return sanitizeUser(user);
}

export async function saveRoomMeta(room: SessionRoomMeta) {
  const cleanId = sanitizeString(room.id);
  if (!cleanId) return;

  const rooms = getRoomsCollection();
  const users = getUsersCollection();

  const sanitizedRoom: SessionRoomMeta = {
    ...room,
    id: cleanId,
    name: sanitizeString(room.name) || `Room ${cleanId}`,
    creatorId: sanitizeString(room.creatorId),
    creatorName: sanitizeString(room.creatorName),
  };

  await rooms.updateOne(
    { id: cleanId },
    { $set: sanitizedRoom },
    { upsert: true }
  );

  if (sanitizedRoom.creatorId) {
    await users.updateOne(
      { id: sanitizedRoom.creatorId },
      { $addToSet: { createdRooms: cleanId } }
    );
  }
}

export async function getRoomMeta(roomId: string): Promise<SessionRoomMeta | null> {
  const cleanRoomId = sanitizeString(roomId);
  if (!cleanRoomId) return null;

  const rooms = getRoomsCollection();
  const doc = await rooms.findOne({ id: cleanRoomId });
  if (!doc) return null;
  return {
    id: doc.id,
    name: doc.name,
    creatorId: doc.creatorId,
    creatorName: doc.creatorName,
    createdAt: doc.createdAt,
    isLocked: !!doc.isLocked,
  };
}

export async function getRoomsForUser(userId: string): Promise<SessionRoomMeta[]> {
  const cleanUserId = sanitizeString(userId);
  if (!cleanUserId) return [];

  const rooms = getRoomsCollection();
  const list = await rooms.find({ creatorId: cleanUserId }).sort({ createdAt: -1 }).toArray();
  return list.map((doc) => ({
    id: doc.id,
    name: doc.name,
    creatorId: doc.creatorId,
    creatorName: doc.creatorName,
    createdAt: doc.createdAt,
    isLocked: !!doc.isLocked,
  }));
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

export async function loadRoomElements(roomId: string): Promise<Record<string, any>> {
  const cleanRoomId = sanitizeString(roomId);
  if (!cleanRoomId) return {};

  try {
    const individualCol = getIndividualElementsCollection();
    const docs = await individualCol.find({ roomId: cleanRoomId }).toArray();
    if (docs.length > 0) {
      const result: Record<string, any> = {};
      for (const d of docs) {
        result[d.elementId] = d.data;
      }
      return result;
    }

    // Backward-compatibility: check legacy single document
    const elementsCol = getElementsCollection();
    const doc = await elementsCol.findOne({ roomId: cleanRoomId });
    if (doc && doc.elements) {
      return doc.elements;
    }
  } catch (err) {
    console.warn(`Could not load elements from MongoDB for room ${cleanRoomId}:`, err);
  }
  return {};
}

const pendingElementSaves = new Map<string, NodeJS.Timeout>();

export async function saveRoomElements(roomId: string, elements: Record<string, any>) {
  try {
    const existingTimer = pendingElementSaves.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      pendingElementSaves.delete(roomId);
    }
    const cleanRoomId = sanitizeString(roomId);
    if (!cleanRoomId) return;

    const individualCol = getIndividualElementsCollection();
    const entries = Object.entries(elements);

    if (entries.length === 0) {
      await individualCol.deleteMany({ roomId: cleanRoomId });
      return;
    }

    const bulkOps = entries.map(([elementId, data]) => ({
      updateOne: {
        filter: { roomId: cleanRoomId, elementId },
        update: { $set: { roomId: cleanRoomId, elementId, data, updatedAt: Date.now() } },
        upsert: true,
      },
    }));

    const activeIds = entries.map(([id]) => id);
    await Promise.all([
      individualCol.bulkWrite(bulkOps, { ordered: false }),
      individualCol.deleteMany({ roomId: cleanRoomId, elementId: { $nin: activeIds } }),
    ]);
  } catch (err) {
    console.warn(`Could not persist elements to MongoDB for room ${roomId}:`, err);
  }
}

export function saveRoomElementsDebounced(roomId: string, elements: Record<string, any>, delayMs = 1000) {
  const existingTimer = pendingElementSaves.get(roomId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(async () => {
    pendingElementSaves.delete(roomId);
    await saveRoomElements(roomId, elements);
  }, delayMs);
  pendingElementSaves.set(roomId, timer);
}

export async function deleteRoom(roomId: string, requestingUserId?: string): Promise<boolean> {
  const cleanRoomId = sanitizeString(roomId);
  if (!cleanRoomId) return false;

  const rooms = getRoomsCollection();
  const meta = await rooms.findOne({ id: cleanRoomId });

  // If requestingUserId is provided and creatorId exists, ensure authorization
  if (requestingUserId && meta?.creatorId) {
    const cleanUserId = sanitizeString(requestingUserId);
    if (meta.creatorId !== cleanUserId) {
      return false;
    }
  }

  // Cancel any pending debounced save timer
  const existingTimer = pendingElementSaves.get(cleanRoomId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    pendingElementSaves.delete(cleanRoomId);
  }

  // Delete from rooms collection
  await rooms.deleteOne({ id: cleanRoomId });

  // Delete from room_elements collection
  const individualCol = getIndividualElementsCollection();
  await individualCol.deleteMany({ roomId: cleanRoomId });

  // Delete from legacy elements collection if exists
  const elementsCol = getElementsCollection();
  await elementsCol.deleteOne({ roomId: cleanRoomId });

  // Prune roomId from users' createdRooms array
  const users = getUsersCollection();
  await users.updateMany({}, { $pull: { createdRooms: cleanRoomId } });

  return true;
}

