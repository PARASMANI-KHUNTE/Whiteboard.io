import type { AiSessionState } from '../ai/types';

/**
 * Persistence for the AI diagram chat, scoped to the board it belongs to.
 * Room boards use the room code as key; the personal canvas uses "solo".
 */

const PREFIX = 'whiteboard_ai_session:';
const MAX_MESSAGES = 60;

function storageKey(boardKey: string): string {
  return PREFIX + (boardKey || 'solo');
}

export function loadAiSession(boardKey: string): AiSessionState | null {
  try {
    const raw = localStorage.getItem(storageKey(boardKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.session ?? parsed;
    if (!session || typeof session !== 'object') return null;
    if (typeof session.sessionId !== 'string' || !Array.isArray(session.messages)) return null;
    return session as AiSessionState;
  } catch {
    return null;
  }
}

export function saveAiSession(boardKey: string, session: AiSessionState): void {
  try {
    const trimmed: AiSessionState = {
      ...session,
      messages: session.messages.slice(-MAX_MESSAGES),
    };
    localStorage.setItem(
      storageKey(boardKey),
      JSON.stringify({ version: 1, session: trimmed })
    );
  } catch {
    // Storage full/unavailable: the live session still works for this tab.
  }
}

export function clearAiSession(boardKey: string): void {
  try {
    localStorage.removeItem(storageKey(boardKey));
  } catch {
    // Ignore.
  }
}
