import type { CanvasElement } from '../types';

export const SOLO_BOARD_CHANNEL = 'whiteboard-solo-board';
export const SOLO_BOARD_REVISION_PREFIX = 'whiteboard_solo_revision:';

export type SoloBoard = Record<string, CanvasElement>;

export interface SoloBoardUpdate {
  type: 'solo-board-saved';
  key: string;
  sourceId: string;
  revision: string;
}

export interface SoloBoardSyncOptions {
  key: string;
  sourceId: string;
  onUpdate: (update: SoloBoardUpdate) => void;
}

export interface SoloBoardSync {
  /** Announce a completed local save to other tabs. */
  publish(): SoloBoardUpdate;
  close(): void;
}

export interface SoloBoardMerge {
  board: SoloBoard;
  conflictedIds: string[];
  /** True when the merge contributes something the remote board did not have. */
  changed: boolean;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2);
}

/** One id per hook instance so a tab can ignore the updates it publishes. */
export function createSoloSourceId(): string {
  const browserCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (browserCrypto && typeof browserCrypto.randomUUID === 'function') {
    return browserCrypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${randomSuffix()}`;
}

function createSoloRevision(sourceId: string): string {
  return `${Date.now().toString(36)}-${sourceId}-${randomSuffix()}`;
}

export function isSoloBoardUpdate(value: unknown): value is SoloBoardUpdate {
  if (!value || typeof value !== 'object') return false;
  const update = value as Partial<SoloBoardUpdate>;
  return (
    update.type === 'solo-board-saved' &&
    typeof update.key === 'string' &&
    typeof update.sourceId === 'string' &&
    typeof update.revision === 'string'
  );
}

/** Stable identity for dirty-checking a whole board regardless of key order. */
export function boardSignature(board: SoloBoard): string {
  return JSON.stringify(Object.keys(board).sort().map((id) => [id, board[id]]));
}

function elementTimestamp(element: CanvasElement): number {
  return 'updatedAt' in element ? element.updatedAt : element.createdAt;
}

function preferNewer(a: CanvasElement, b: CanvasElement): CanvasElement {
  const aTime = elementTimestamp(a);
  const bTime = elementTimestamp(b);
  if (aTime !== bTime) return aTime > bTime ? a : b;
  // Deterministic tie-break so both tabs converge even with identical clocks.
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

/**
 * Combine a dirty local snapshot with a save from another tab. Unique elements
 * are preserved from both sides; edits to the same id keep the newest
 * `updatedAt`. The sorted signature prevents cross-tab save ping-pong when the
 * merge does not actually change the remote board.
 */
export function mergeSoloBoards(local: SoloBoard, remote: SoloBoard): SoloBoardMerge {
  const board: SoloBoard = { ...remote };
  const conflictedIds: string[] = [];

  for (const id of Object.keys(local)) {
    const localElement = local[id];
    const remoteElement = remote[id];
    if (!remoteElement) {
      board[id] = localElement;
      continue;
    }
    if (JSON.stringify(localElement) !== JSON.stringify(remoteElement)) {
      conflictedIds.push(id);
    }
    board[id] = preferNewer(localElement, remoteElement);
  }

  return {
    board,
    conflictedIds,
    changed: boardSignature(board) !== boardSignature(remote),
  };
}

/**
 * BroadcastChannel is preferred; a tiny localStorage revision marker covers
 * browsers without it. Both paths share revision deduplication.
 */
export function createSoloBoardSync({
  key,
  sourceId,
  onUpdate,
}: SoloBoardSyncOptions): SoloBoardSync {
  const storageKey = SOLO_BOARD_REVISION_PREFIX + key;
  const seenRevisions = new Set<string>();
  let closed = false;

  const handle = (value: unknown) => {
    if (closed || !isSoloBoardUpdate(value)) return;
    if (value.key !== key || value.sourceId === sourceId) return;
    if (seenRevisions.has(value.revision)) return;
    seenRevisions.add(value.revision);
    if (seenRevisions.size > 100) {
      const oldest = seenRevisions.values().next().value;
      if (oldest) seenRevisions.delete(oldest);
    }
    onUpdate(value);
  };

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(SOLO_BOARD_CHANNEL);
    channel.addEventListener('message', (event: MessageEvent) => handle(event.data));
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      handle(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed revision markers from other apps/versions.
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return {
    publish() {
      const update: SoloBoardUpdate = {
        type: 'solo-board-saved',
        key,
        sourceId,
        revision: createSoloRevision(sourceId),
      };
      if (!closed) channel?.postMessage(update);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(update));
        } catch {
          // Storage may be unavailable; the in-memory channel still works.
        }
      }
      return update;
    },
    close() {
      closed = true;
      channel?.close();
      channel = null;
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    },
  };
}
