import type { CanvasElement } from '../types';

/**
 * Local persistence for the personal (solo) canvas.
 *
 * Solo boards never reach the server, so they live in IndexedDB (large stroke
 * payloads would blow the ~5 MB localStorage quota). A localStorage fallback
 * keeps the feature working when IndexedDB is unavailable.
 */

const DB_NAME = 'whiteboard-local';
const DB_VERSION = 1;
const STORE = 'solo-boards';
const LS_PREFIX = 'whiteboard_solo_board:';

type Board = Record<string, CanvasElement>;

export function soloBoardKey(identityId: string): string {
  return identityId || 'anonymous';
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readFallback(key: string): Board | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Board) : null;
  } catch {
    return null;
  }
}

function writeFallback(key: string, board: Board) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(board));
  } catch {
    // Quota exceeded / storage unavailable; the in-memory canvas still works.
  }
}

function removeFallback(key: string) {
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    // Ignore.
  }
}

export async function loadSoloBoard(identityId: string): Promise<Board | null> {
  const key = soloBoardKey(identityId);
  if (!hasIndexedDb()) return readFallback(key);

  try {
    const db = await openDb();
    const board = await new Promise<Board | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result;
        resolve(value && typeof value === 'object' ? (value as Board) : null);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    });
    if (board) return board;
    // Migrate a fallback board written before IndexedDB became available.
    return readFallback(key);
  } catch {
    return readFallback(key);
  }
}

export async function saveSoloBoard(identityId: string, board: Board): Promise<void> {
  const key = soloBoardKey(identityId);
  if (!hasIndexedDb()) {
    writeFallback(key, board);
    return;
  }

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(board, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
    // Drop any stale fallback copy so it cannot resurrect an old board.
    removeFallback(key);
  } catch {
    writeFallback(key, board);
  }
}

export async function clearSoloBoard(identityId: string): Promise<void> {
  const key = soloBoardKey(identityId);
  removeFallback(key);
  if (!hasIndexedDb()) return;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore; the fallback copy is already gone.
  }
}
