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

function pbkdf2Async(password: string, salt: string, iterations: number, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keylen, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** Constant-time comparison of two hex digests. */
function safeCompareHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await pbkdf2Async(password, salt, 100000, 64)).toString('hex');
  return { salt, hash };
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  // Check modern 100k iterations first
  const modernHash = (await pbkdf2Async(password, salt, 100000, 64)).toString('hex');
  if (safeCompareHex(modernHash, hash)) return true;
  // Fallback to legacy 1,000 iterations
  const legacyHash = (await pbkdf2Async(password, salt, 1000, 64)).toString('hex');
  return safeCompareHex(legacyHash, hash);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function buildTokenDoc(token: string, userId: string) {
  const now = Date.now();
  return {
    token,
    userId,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now + TOKEN_TTL_MS),
  };
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

  const { salt, hash } = await hashPassword(password);
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

  try {
    await users.insertOne(newUser);
  } catch (err: any) {
    if (err?.code === 11000) {
      throw new Error('This username or email is already registered.');
    }
    throw err;
  }

  const token = generateToken();
  await tokens.insertOne(buildTokenDoc(token, id));

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
    // Perform a dummy derivation so response timing does not reveal whether the account exists.
    await pbkdf2Async(pass, 'invalid-account-salt', 100000, 64);
    throw new Error('Invalid username/email or password.');
  }

  const isValid = await verifyPassword(pass, user.salt, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid username/email or password.');
  }

  const token = generateToken();
  await tokens.insertOne(buildTokenDoc(token, user.id));

  return { token, user: sanitizeUser(user) };
}

export async function createGuestUser(name?: string, color?: string): Promise<{ token: string; user: SanitizedUser }> {
  const id = 'guest_' + crypto.randomBytes(5).toString('hex');
  const displayName = (name && name.trim()) || `Guest_${id.slice(-4)}`;
  const displayColor = color || '#10b981';
  const username = `guest_${id.slice(-8)}`;

  const guestUser: StoredUserDoc = {
    id,
    username,
    email: `${id}@guest.local`,
    passwordHash: '',
    salt: '',
    name: displayName,
    color: displayColor,
    createdAt: Date.now(),
    createdRooms: [],
    isGuest: true,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };

  const users = getUsersCollection();
  const tokens = getTokensCollection();

  await users.insertOne(guestUser);

  const token = generateToken();
  await tokens.insertOne(buildTokenDoc(token, id));

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
    await tokens.insertOne(buildTokenDoc(token, existingUser.id));

    return { token, user: sanitizeUser(existingUser) };
  }

  const userId = `google_${googleProfile.id || crypto.randomBytes(5).toString('hex')}`;
  const baseUsername = emailLower.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || `user_${userId.slice(-6)}`;
  let username = baseUsername;
  let suffix = 0;
  // Usernames are unique; append a numeric suffix on collision.
  while (await users.findOne({ username })) {
    suffix += 1;
    username = `${baseUsername}${suffix}`;
    if (suffix > 50) {
      username = `${baseUsername}_${crypto.randomBytes(3).toString('hex')}`;
      break;
    }
  }
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
  await tokens.insertOne(buildTokenDoc(token, userId));

  return { token, user: sanitizeUser(newUser) };
}

export async function getUserByToken(token: string): Promise<SanitizedUser | null> {
  const cleanToken = sanitizeString(token);
  if (!cleanToken) return null;
  const tokens = getTokensCollection();
  const tokenDoc = await tokens.findOne({ token: cleanToken });
  if (!tokenDoc) return null;

  // Enforce session expiry even if the TTL index has not run yet.
  const issuedAt = Number(tokenDoc.createdAt) || 0;
  if (!issuedAt || Date.now() - issuedAt > TOKEN_TTL_MS) {
    await tokens.deleteOne({ token: cleanToken });
    return null;
  }

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

  const existing = await rooms.findOne({ id: cleanId });

  if (existing) {
    // A custom room code must not allow taking over an existing room.
    if (existing.creatorId && existing.creatorId !== sanitizedRoom.creatorId) {
      throw new Error('That room code is already in use. Please choose another.');
    }
    await rooms.updateOne(
      { id: cleanId },
      {
        $set: {
          name: sanitizedRoom.name,
          creatorId: existing.creatorId || sanitizedRoom.creatorId,
          creatorName: existing.creatorName || sanitizedRoom.creatorName,
          isLocked: sanitizedRoom.isLocked,
        },
        $setOnInsert: { createdAt: sanitizedRoom.createdAt },
      }
    );
  } else {
    await rooms.insertOne(sanitizedRoom as SessionRoomDoc);
  }

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
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  code += '-';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
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

const pendingElementSaves = new Map<string, { timer: NodeJS.Timeout; elements: Record<string, any> }>();
// Serialize writes per room so an older snapshot cannot delete newer elements.
const roomSaveChains = new Map<string, Promise<void>>();
// Last successfully persisted snapshot per room. Element objects are replaced
// (never mutated) on every create/update, so reference equality is enough to
// detect which rows actually changed and skip rewriting untouched elements.
const persistedElementsCache = new Map<string, Record<string, any>>();
const MAX_CACHED_ROOMS = 500;

function rememberPersistedElements(roomId: string, snapshot: Record<string, any>) {
  // Delete before set so the map's insertion order stays LRU-ish and eviction
  // never drops the snapshot we just wrote.
  persistedElementsCache.delete(roomId);
  persistedElementsCache.set(roomId, snapshot);
  if (persistedElementsCache.size > MAX_CACHED_ROOMS) {
    const oldest = persistedElementsCache.keys().next().value;
    if (oldest !== undefined) persistedElementsCache.delete(oldest);
  }
}

async function persistRoomElements(cleanRoomId: string, elements: Record<string, any>) {
  try {
    // Snapshot before touching the database: the live room map can mutate while
    // the write is in flight, and the cache must only record what this write
    // actually persisted. A newer update schedules its own save that snapshots
    // the latest state and writes the diff.
    const snapshot = { ...elements };
    const individualCol = getIndividualElementsCollection();
    const elementsCol = getElementsCollection();
    const entries = Object.entries(snapshot);
    const previous = persistedElementsCache.get(cleanRoomId);

    // No snapshot yet (first write since boot / after deletion) or the board is
    // empty: do a full sync so rows that are no longer present are pruned too.
    if (!previous || entries.length === 0) {
      if (entries.length === 0) {
        await Promise.all([
          individualCol.deleteMany({ roomId: cleanRoomId }),
          // Remove the legacy document too, otherwise a cleared board would
          // resurrect its old elements on the next server restart.
          elementsCol.deleteOne({ roomId: cleanRoomId }),
        ]);
      } else {
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
          elementsCol.deleteOne({ roomId: cleanRoomId }),
        ]);
      }
      rememberPersistedElements(cleanRoomId, snapshot);
      return;
    }

    // Incremental save: only dirty and removed rows touch MongoDB. Dragging one
    // element in a 2,000-element room now writes one row instead of all 2,000.
    const dirtyOps: Array<{
      updateOne: { filter: Record<string, string>; update: Record<string, any>; upsert: boolean };
    }> = [];
    for (const [elementId, data] of entries) {
      if (previous[elementId] !== data) {
        dirtyOps.push({
          updateOne: {
            filter: { roomId: cleanRoomId, elementId },
            update: { $set: { roomId: cleanRoomId, elementId, data, updatedAt: Date.now() } },
            upsert: true,
          },
        });
      }
    }
    const removedIds = Object.keys(previous).filter((id) => !(id in snapshot));

    if (dirtyOps.length === 0 && removedIds.length === 0) {
      rememberPersistedElements(cleanRoomId, snapshot);
      return;
    }

    const tasks: Promise<unknown>[] = [];
    if (dirtyOps.length > 0) {
      tasks.push(individualCol.bulkWrite(dirtyOps, { ordered: false }));
    }
    if (removedIds.length > 0) {
      tasks.push(individualCol.deleteMany({ roomId: cleanRoomId, elementId: { $in: removedIds } }));
    }
    tasks.push(elementsCol.deleteOne({ roomId: cleanRoomId }));

    await Promise.all(tasks);
    // Only trust the new snapshot once the write actually succeeded.
    rememberPersistedElements(cleanRoomId, snapshot);
  } catch (err) {
    console.warn(`Could not persist elements to MongoDB for room ${cleanRoomId}:`, err);
  }
}

export async function saveRoomElements(roomId: string, elements: Record<string, any>): Promise<void> {
  const existingTimer = pendingElementSaves.get(roomId);
  if (existingTimer) {
    clearTimeout(existingTimer.timer);
    pendingElementSaves.delete(roomId);
  }
  const cleanRoomId = sanitizeString(roomId);
  if (!cleanRoomId) return;

  const previous = roomSaveChains.get(cleanRoomId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => persistRoomElements(cleanRoomId, elements));
  roomSaveChains.set(cleanRoomId, next);
  try {
    await next;
  } finally {
    if (roomSaveChains.get(cleanRoomId) === next) {
      roomSaveChains.delete(cleanRoomId);
    }
  }
}

export function saveRoomElementsDebounced(roomId: string, elements: Record<string, any>, delayMs = 1000) {
  const existing = pendingElementSaves.get(roomId);
  if (existing) {
    clearTimeout(existing.timer);
  }
  const timer = setTimeout(async () => {
    pendingElementSaves.delete(roomId);
    await saveRoomElements(roomId, elements);
  }, delayMs);
  pendingElementSaves.set(roomId, { timer, elements });
}

export async function deleteRoom(roomId: string, requestingUserId?: string): Promise<boolean> {
  const cleanRoomId = sanitizeString(roomId);
  if (!cleanRoomId) return false;

  const rooms = getRoomsCollection();
  const meta = await rooms.findOne({ id: cleanRoomId });

  // Deletion requires ownership when the room has a known creator
  if (meta?.creatorId) {
    const cleanUserId = sanitizeString(requestingUserId || "");
    if (!cleanUserId || meta.creatorId !== cleanUserId) {
      return false;
    }
  }

  // Cancel any pending debounced save timer
  const existingTimer = pendingElementSaves.get(cleanRoomId);
  if (existingTimer) {
    clearTimeout(existingTimer.timer);
    pendingElementSaves.delete(cleanRoomId);
  }

  // Wait for any in-flight write so it cannot re-create rows after deletion
  const inFlight = roomSaveChains.get(cleanRoomId);
  if (inFlight) {
    await inFlight.catch(() => {});
    roomSaveChains.delete(cleanRoomId);
  }
  persistedElementsCache.delete(cleanRoomId);

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

/** Flush every pending debounced write. Call during graceful shutdown. */
export async function flushAllPendingSaves(): Promise<void> {
  // Persist the snapshots behind each pending debounce before cancelling timers,
  // otherwise the last unsaved changes would be dropped on shutdown.
  const pending = Array.from(pendingElementSaves.entries());
  pendingElementSaves.clear();
  pending.forEach(([, entry]) => clearTimeout(entry.timer));

  await Promise.all(pending.map(([roomId, entry]) => saveRoomElements(roomId, entry.elements).catch(() => {})));

  const chains = Array.from(roomSaveChains.values());
  await Promise.all(chains.map((chain) => chain.catch(() => {})));
}

