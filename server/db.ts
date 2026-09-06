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

export async function connectDb(): Promise<Db> {
  if (db && client) {
    return db;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whiteboard';
  console.log(`[MongoDB] Connecting to ${uri}...`);

  client = new MongoClient(uri, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  db = client.db();
  console.log(`[MongoDB] Connected successfully to database: ${db.databaseName}`);

  // Create required indexes
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

export async function disconnectDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
