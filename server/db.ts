import { MongoClient, Db, Collection } from 'mongodb';

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
  /** TTL anchor for guest accounts (BSON Date required by MongoDB TTL indexes). */
  expiresAt?: Date;
}

export interface SessionTokenDoc {
  token: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  /** TTL anchor for session tokens. */
  expiresAt?: Date;
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

export interface IndividualElementDoc {
  roomId: string;
  elementId: string;
  data: any;
  updatedAt: number;
}

let client: MongoClient | null = null;
let db: Db | null = null;
let connectPromise: Promise<Db> | null = null;

function redactMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '<configured MongoDB URI>';
  }
}

export async function connectDb(): Promise<Db> {
  if (db && client) {
    return db;
  }
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whiteboard';
    console.log(`[MongoDB] Connecting to ${redactMongoUri(uri)}...`);

    const newClient = new MongoClient(uri, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
    });
    client = newClient;

    try {
      await newClient.connect();
      const connectedDb = newClient.db();
      db = connectedDb;
      console.log(`[MongoDB] Connected successfully to database: ${connectedDb.databaseName}`);

      // Create required indexes
      const users = connectedDb.collection<StoredUserDoc>('users');
      const tokens = connectedDb.collection<SessionTokenDoc>('tokens');
      const rooms = connectedDb.collection<SessionRoomDoc>('rooms');
      const elements = connectedDb.collection<RoomElementsDoc>('elements');
      const individualElements = connectedDb.collection<IndividualElementDoc>('room_elements');

      const indexSpecs: Array<[string, Promise<string>]> = [
        ['users.id', users.createIndex({ id: 1 }, { unique: true })],
        ['users.username', users.createIndex({ username: 1 }, { unique: true })],
        ['users.email', users.createIndex({ email: 1 }, { unique: true })],
        [
          'users.expiresAt',
          users.createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, partialFilterExpression: { isGuest: true } }
          ),
        ],
        ['tokens.token', tokens.createIndex({ token: 1 }, { unique: true })],
        ['tokens.userId', tokens.createIndex({ userId: 1 })],
        ['tokens.expiresAt', tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })],
        ['rooms.id', rooms.createIndex({ id: 1 }, { unique: true })],
        ['rooms.creatorId', rooms.createIndex({ creatorId: 1 })],
        ['elements.roomId', elements.createIndex({ roomId: 1 }, { unique: true })],
        [
          'room_elements.roomId_elementId',
          individualElements.createIndex({ roomId: 1, elementId: 1 }, { unique: true }),
        ],
        ['room_elements.roomId', individualElements.createIndex({ roomId: 1 })],
      ];

      const results = await Promise.allSettled(indexSpecs.map(([, promise]) => promise));
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.warn(`[MongoDB] Failed to create index ${indexSpecs[i][0]}:`, result.reason?.message || result.reason);
        }
      });

      return connectedDb;
    } catch (err) {
      try {
        await newClient.close();
      } catch {}
      client = null;
      db = null;
      throw err;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database is not initialized. Call connectDb() first.');
  }
  return db;
}

export function getUsersCollection(): Collection<StoredUserDoc> {
  return getDb().collection<StoredUserDoc>('users');
}

export function getTokensCollection(): Collection<SessionTokenDoc> {
  return getDb().collection<SessionTokenDoc>('tokens');
}

export function getRoomsCollection(): Collection<SessionRoomDoc> {
  return getDb().collection<SessionRoomDoc>('rooms');
}

export function getElementsCollection(): Collection<RoomElementsDoc> {
  return getDb().collection<RoomElementsDoc>('elements');
}

export function getIndividualElementsCollection(): Collection<IndividualElementDoc> {
  return getDb().collection<IndividualElementDoc>('room_elements');
}

export async function checkDbHealth(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  if (!db) {
    return { connected: false, error: 'Database not initialized' };
  }
  const start = Date.now();
  try {
    await db.command({ ping: 1 });
    return { connected: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { connected: false, error: err.message || 'Database ping failed' };
  }
}

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

