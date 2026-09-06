import { MongoClient, Db } from 'mongodb';
import fs from 'fs';
import path from 'path';

export interface StoredUserDoc {
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

export interface SessionTokenDoc {
  token: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionRoomDoc {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  isLocked: boolean;
}

export interface RoomElementsDoc {
  roomId: string;
  elements: Record<string, any>;
  updatedAt: number;
}

let client: MongoClient | null = null;
let db: Db | null = null;
let isMongoConnected = false;

// Local persistent storage fallback
const DATA_DIR = path.resolve(process.cwd(), 'data');
const ELEMENTS_DIR = path.join(DATA_DIR, 'elements');
const APP_DATA_FILE = path.join(DATA_DIR, 'app_data.json');

interface LocalAppData {
  users: StoredUserDoc[];
  tokens: SessionTokenDoc[];
  rooms: SessionRoomDoc[];
}

const localData: LocalAppData = {
  users: [],
  tokens: [],
  rooms: [],
};

const localElementsCache = new Map<string, Record<string, any>>();

function initLocalStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(ELEMENTS_DIR)) {
      fs.mkdirSync(ELEMENTS_DIR, { recursive: true });
    }

    if (fs.existsSync(APP_DATA_FILE)) {
      const content = fs.readFileSync(APP_DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.users)) localData.users = parsed.users;
      if (Array.isArray(parsed.tokens)) localData.tokens = parsed.tokens;
      if (Array.isArray(parsed.rooms)) localData.rooms = parsed.rooms;
    }
  } catch (err) {
    console.warn('[LocalStorage] Could not load local data file:', err);
  }
}

function saveLocalStorage() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(APP_DATA_FILE, JSON.stringify(localData, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[LocalStorage] Error persisting app_data.json:', err);
  }
}

function matchFilter(doc: any, filter: any): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  if (Array.isArray(filter.$or)) {
    return filter.$or.some((sub: any) => matchFilter(doc, sub));
  }

  for (const key of Object.keys(filter)) {
    if (key === '$or') continue;
    if (doc[key] !== filter[key]) {
      return false;
    }
  }
  return true;
}

function createLocalCollection<T extends Record<string, any>>(
  getArray: () => T[],
  setArray: (arr: T[]) => void,
  onPersist: () => void
) {
  return {
    async findOne(filter: any): Promise<T | null> {
      const list = getArray();
      const match = list.find((item) => matchFilter(item, filter));
      return match ? { ...match } : null;
    },
    find(filter: any = {}) {
      const list = getArray().filter((item) => matchFilter(item, filter));
      return {
        sort(sortObj: Record<string, number>) {
          const sorted = [...list];
          const sortKey = Object.keys(sortObj)[0];
          if (sortKey) {
            const dir = sortObj[sortKey];
            sorted.sort((a, b) => {
              if (a[sortKey] < b[sortKey]) return dir > 0 ? -1 : 1;
              if (a[sortKey] > b[sortKey]) return dir > 0 ? 1 : -1;
              return 0;
            });
          }
          return {
            async toArray(): Promise<T[]> {
              return sorted.map((item) => ({ ...item }));
            },
          };
        },
        async toArray(): Promise<T[]> {
          return list.map((item) => ({ ...item }));
        },
      };
    },
    async insertOne(doc: T): Promise<{ acknowledged: boolean; insertedId: any }> {
      const arr = getArray();
      arr.push({ ...doc });
      setArray(arr);
      onPersist();
      return { acknowledged: true, insertedId: (doc as any).id || (doc as any).token || (doc as any).roomId };
    },
    async updateOne(filter: any, update: any, options: { upsert?: boolean } = {}): Promise<{ acknowledged: boolean; modifiedCount: number }> {
      const arr = getArray();
      const index = arr.findIndex((item) => matchFilter(item, filter));

      if (index === -1) {
        if (options.upsert) {
          const newDoc = { ...(filter || {}), ...(update.$set || {}) };
          arr.push(newDoc as T);
          setArray(arr);
          onPersist();
          return { acknowledged: true, modifiedCount: 1 };
        }
        return { acknowledged: true, modifiedCount: 0 };
      }

      const item = { ...arr[index] };
      if (update.$set) {
        Object.assign(item, update.$set);
      }
      if (update.$addToSet) {
        for (const [k, v] of Object.entries(update.$addToSet)) {
          if (!Array.isArray((item as any)[k])) {
            (item as any)[k] = [];
          }
          if (!(item as any)[k].includes(v)) {
            (item as any)[k].push(v);
          }
        }
      }

      arr[index] = item;
      setArray(arr);
      onPersist();
      return { acknowledged: true, modifiedCount: 1 };
    },
    async createIndex(_spec: any, _options?: any): Promise<string> {
      return 'index_created';
    },
  };
}

// Dedicated Elements Collection for fallback
const localElementsCollection = {
  async findOne(filter: { roomId: string }): Promise<RoomElementsDoc | null> {
    const roomId = filter.roomId;
    if (!roomId) return null;

    if (localElementsCache.has(roomId)) {
      return {
        roomId,
        elements: localElementsCache.get(roomId) || {},
        updatedAt: Date.now(),
      };
    }

    try {
      const filePath = path.join(ELEMENTS_DIR, `${roomId}.json`);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const elements = JSON.parse(raw);
        localElementsCache.set(roomId, elements);
        return {
          roomId,
          elements,
          updatedAt: Date.now(),
        };
      }
    } catch (err) {
      console.warn(`[LocalStorage] Failed reading elements for ${roomId}:`, err);
    }

    return null;
  },
  async updateOne(
    filter: { roomId: string },
    update: { $set: { roomId?: string; elements: Record<string, any>; updatedAt?: number } },
    _options?: { upsert?: boolean }
  ) {
    const roomId = filter.roomId;
    if (!roomId) return { acknowledged: false, modifiedCount: 0 };

    const elements = update.$set.elements || {};
    localElementsCache.set(roomId, elements);

    try {
      if (!fs.existsSync(ELEMENTS_DIR)) {
        fs.mkdirSync(ELEMENTS_DIR, { recursive: true });
      }
      const filePath = path.join(ELEMENTS_DIR, `${roomId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(elements), 'utf-8');
    } catch (err) {
      console.warn(`[LocalStorage] Failed writing elements for ${roomId}:`, err);
    }

    return { acknowledged: true, modifiedCount: 1 };
  },
  async createIndex(_spec: any, _options?: any): Promise<string> {
    return 'elements_index_created';
  },
};

export async function connectDb(): Promise<Db | null> {
  initLocalStorage();

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.log('[Database] No MONGODB_URI configured. Using built-in local JSON persistence engine in ./data');
    isMongoConnected = false;
    return null;
  }

  console.log(`[MongoDB] Connecting to MongoDB URI...`);
  try {
    client = new MongoClient(uri, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db();
    isMongoConnected = true;
    console.log(`[MongoDB] Connected successfully to database: ${db.databaseName}`);

    // Create indexes if available
    const users = db.collection<StoredUserDoc>('users');
    const tokens = db.collection<SessionTokenDoc>('tokens');
    const rooms = db.collection<SessionRoomDoc>('rooms');
    const elements = db.collection<RoomElementsDoc>('elements');

    await Promise.allSettled([
      users.createIndex({ id: 1 }, { unique: true }),
      users.createIndex({ username: 1 }),
      users.createIndex({ email: 1 }),
      tokens.createIndex({ token: 1 }, { unique: true }),
      tokens.createIndex({ userId: 1 }),
      rooms.createIndex({ id: 1 }, { unique: true }),
      rooms.createIndex({ creatorId: 1 }),
      elements.createIndex({ roomId: 1 }, { unique: true }),
    ]);

    return db;
  } catch (err: any) {
    console.warn(`[MongoDB] Could not connect to MongoDB (${err.message}). Seamlessly falling back to local persistent storage.`);
    isMongoConnected = false;
    client = null;
    db = null;
    return null;
  }
}

export function isMongoActive(): boolean {
  return isMongoConnected;
}

export function getUsersCollection(): any {
  if (isMongoConnected && db) {
    return db.collection<StoredUserDoc>('users');
  }
  return createLocalCollection<StoredUserDoc>(
    () => localData.users,
    (arr) => { localData.users = arr; },
    saveLocalStorage
  );
}

export function getTokensCollection(): any {
  if (isMongoConnected && db) {
    return db.collection<SessionTokenDoc>('tokens');
  }
  return createLocalCollection<SessionTokenDoc>(
    () => localData.tokens,
    (arr) => { localData.tokens = arr; },
    saveLocalStorage
  );
}

export function getRoomsCollection(): any {
  if (isMongoConnected && db) {
    return db.collection<SessionRoomDoc>('rooms');
  }
  return createLocalCollection<SessionRoomDoc>(
    () => localData.rooms,
    (arr) => { localData.rooms = arr; },
    saveLocalStorage
  );
}

export function getElementsCollection(): any {
  if (isMongoConnected && db) {
    return db.collection<RoomElementsDoc>('elements');
  }
  return localElementsCollection;
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    isMongoConnected = false;
  }
}
