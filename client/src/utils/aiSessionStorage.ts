import type {
  AiSessionState,
  GlobalSessionTurn,
  SessionDiagramSummary,
} from '../ai/types';

/**
 * Persistence for the AI diagram chat and cross-diagram global session ledger,
 * scoped to the board it belongs to (room code or "solo").
 */

const PREFIX = 'whiteboard_ai_session:';
const LEDGER_PREFIX = 'whiteboard_ai_global_ctx:';
const PREFERRED_AI_KEY = 'whiteboard_ai_preferred_engine';
const MAX_MESSAGES = 60;
const MAX_LEDGER_DIAGRAMS = 6;
const MAX_LEDGER_TURNS = 16;

export interface PreferredAiEngine {
  provider: string;
  model?: string;
}

export function loadPreferredAiEngine(): PreferredAiEngine {
  try {
    const raw = localStorage.getItem(PREFERRED_AI_KEY);
    if (!raw) return { provider: 'auto' };
    const parsed = JSON.parse(raw) as Partial<PreferredAiEngine>;
    const provider =
      typeof parsed?.provider === 'string' && parsed.provider.trim()
        ? parsed.provider.trim()
        : 'auto';
    const model =
      typeof parsed?.model === 'string' && parsed.model.trim()
        ? parsed.model.trim()
        : undefined;
    return model ? { provider, model } : { provider };
  } catch {
    return { provider: 'auto' };
  }
}

export function savePreferredAiEngine(engine: PreferredAiEngine): void {
  try {
    localStorage.setItem(
      PREFERRED_AI_KEY,
      JSON.stringify({
        provider: engine.provider || 'auto',
        ...(engine.model ? { model: engine.model } : {}),
      })
    );
  } catch {
    // Ignore storage quota errors.
  }
}

export interface BoardAiLedger {
  diagrams: SessionDiagramSummary[];
  turns: GlobalSessionTurn[];
  lastProvider?: string;
  lastModel?: string;
}

export const EMPTY_BOARD_AI_LEDGER: BoardAiLedger = {
  diagrams: [],
  turns: [],
};

function storageKey(boardKey: string): string {
  return PREFIX + (boardKey || 'solo');
}

function ledgerKey(boardKey: string): string {
  return LEDGER_PREFIX + (boardKey || 'solo');
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

export function loadBoardAiLedger(boardKey: string): BoardAiLedger {
  try {
    const raw = localStorage.getItem(ledgerKey(boardKey));
    if (!raw) return EMPTY_BOARD_AI_LEDGER;
    const parsed = JSON.parse(raw) as Partial<BoardAiLedger>;
    return {
      diagrams: Array.isArray(parsed.diagrams) ? parsed.diagrams.slice(-MAX_LEDGER_DIAGRAMS) : [],
      turns: Array.isArray(parsed.turns) ? parsed.turns.slice(-MAX_LEDGER_TURNS) : [],
      ...(typeof parsed.lastProvider === 'string' ? { lastProvider: parsed.lastProvider } : {}),
      ...(typeof parsed.lastModel === 'string' ? { lastModel: parsed.lastModel } : {}),
    };
  } catch {
    return EMPTY_BOARD_AI_LEDGER;
  }
}

export function saveBoardAiLedger(boardKey: string, ledger: BoardAiLedger): void {
  try {
    const trimmed: BoardAiLedger = {
      diagrams: ledger.diagrams.slice(-MAX_LEDGER_DIAGRAMS),
      turns: ledger.turns.slice(-MAX_LEDGER_TURNS),
      ...(ledger.lastProvider ? { lastProvider: ledger.lastProvider } : {}),
      ...(ledger.lastModel ? { lastModel: ledger.lastModel } : {}),
    };
    localStorage.setItem(ledgerKey(boardKey), JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota issues.
  }
}

export function clearBoardAiLedger(boardKey: string): void {
  try {
    localStorage.removeItem(ledgerKey(boardKey));
  } catch {
    // Ignore.
  }
}
