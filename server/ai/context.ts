import { TimedCache } from "./responseCache";
import {
  coerceDiagramType,
  type BoardEdgeContext,
  type BoardNodeContext,
  type BoardSummaryContext,
  type GlobalAiContext,
  type GlobalSessionTurn,
  type SessionDiagramSummary,
} from "./types";

const MAX_BOARDS = 256;
const CONTEXT_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_NODES = 45;
const MAX_EDGES = 50;
const MAX_DIAGRAMS = 6;
const MAX_TURNS = 16;

interface StoredBoardSession {
  boardKey: string;
  roomName?: string;
  mode?: "solo" | "room";
  participantCount?: number;
  theme?: "light" | "dark";
  boardSummary?: BoardSummaryContext;
  sessionSummary?: string;
  priorDiagrams: SessionDiagramSummary[];
  recentTurns: GlobalSessionTurn[];
  lastProvider?: string;
  lastModel?: string;
}

const boardContextStore = new TimedCache<StoredBoardSession>(MAX_BOARDS, CONTEXT_TTL_MS);

function cleanString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

function cleanBoardKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned || undefined;
}

function sanitizeNodes(raw: unknown): BoardNodeContext[] {
  if (!Array.isArray(raw)) return [];
  const allowedKinds = new Set<BoardNodeContext["kind"]>(["sticky", "shape", "text", "icon"]);
  const result: BoardNodeContext[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = cleanString(rec.id, 48);
    const kind = rec.kind as BoardNodeContext["kind"];
    const label = cleanString(rec.label, 140);
    if (!id || !allowedKinds.has(kind) || !label) continue;
    const shapeType = cleanString(rec.shapeType, 32);
    const author = cleanString(rec.author, 48);
    result.push({
      id,
      kind,
      label,
      ...(shapeType ? { shapeType } : {}),
      ...(author ? { author } : {}),
    });
    if (result.length >= MAX_NODES) break;
  }
  return result;
}

function sanitizeConnections(raw: unknown): BoardEdgeContext[] {
  if (!Array.isArray(raw)) return [];
  const result: BoardEdgeContext[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const from = cleanString(rec.from, 48);
    const to = cleanString(rec.to, 48);
    if (!from || !to) continue;
    const label = cleanString(rec.label, 80);
    result.push({
      from,
      to,
      ...(label ? { label } : {}),
    });
    if (result.length >= MAX_EDGES) break;
  }
  return result;
}

function sanitizeBoardSummary(raw: unknown): BoardSummaryContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const totalElements = Number.isFinite(Number(rec.totalElements))
    ? Math.max(0, Math.floor(Number(rec.totalElements)))
    : 0;
  const strokeCount = Number.isFinite(Number(rec.strokeCount))
    ? Math.max(0, Math.floor(Number(rec.strokeCount)))
    : 0;
  const nodes = sanitizeNodes(rec.nodes);
  const connections = sanitizeConnections(rec.connections);
  if (totalElements === 0 && nodes.length === 0 && connections.length === 0 && strokeCount === 0) {
    return undefined;
  }
  return {
    totalElements: Math.max(totalElements, nodes.length + connections.length + strokeCount),
    strokeCount,
    nodes,
    connections,
  };
}

function sanitizeDiagrams(raw: unknown): SessionDiagramSummary[] {
  if (!Array.isArray(raw)) return [];
  const result: SessionDiagramSummary[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const sessionId = cleanString(rec.sessionId, 32);
    const title = cleanString(rec.title, 100);
    const summary = cleanString(rec.summary, 280);
    if (!sessionId || !title || !summary) continue;
    const provider = cleanString(rec.provider, 32);
    const model = cleanString(rec.model, 64);
    const nodeCount = Number.isFinite(Number(rec.nodeCount))
      ? Math.max(0, Math.floor(Number(rec.nodeCount)))
      : 0;
    const updatedAt = Number.isFinite(Number(rec.updatedAt)) ? Number(rec.updatedAt) : Date.now();
    result.push({
      sessionId,
      title,
      type: coerceDiagramType(rec.type),
      summary,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      nodeCount,
      updatedAt,
    });
    if (result.length >= MAX_DIAGRAMS) break;
  }
  return result;
}

function sanitizeTurns(raw: unknown): GlobalSessionTurn[] {
  if (!Array.isArray(raw)) return [];
  const result: GlobalSessionTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (rec.role !== "user" && rec.role !== "assistant") continue;
    const content = cleanString(rec.content, 500);
    if (!content) continue;
    const provider = cleanString(rec.provider, 32);
    const model = cleanString(rec.model, 64);
    const diagramTitle = cleanString(rec.diagramTitle, 100);
    const at = Number.isFinite(Number(rec.at)) ? Number(rec.at) : undefined;
    result.push({
      role: rec.role,
      content,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(diagramTitle ? { diagramTitle } : {}),
      ...(at !== undefined ? { at } : {}),
    });
  }
  return result.slice(-MAX_TURNS);
}

/**
 * Validates and bounds incoming client global context so prompts stay compact
 * and safe across both Gemini and local Ollama models.
 */
export function sanitizeGlobalContext(
  raw: unknown,
  fallbackBoardKey?: string
): GlobalAiContext | undefined {
  if (!raw || typeof raw !== "object") {
    const key = cleanBoardKey(fallbackBoardKey);
    return key ? { boardKey: key } : undefined;
  }
  const rec = raw as Record<string, unknown>;
  const boardKey = cleanBoardKey(rec.boardKey) ?? cleanBoardKey(fallbackBoardKey) ?? "default";
  const roomName = cleanString(rec.roomName, 80);
  const mode = rec.mode === "solo" || rec.mode === "room" ? rec.mode : undefined;
  const participantCount = Number.isFinite(Number(rec.participantCount))
    ? Math.max(1, Math.min(200, Math.floor(Number(rec.participantCount))))
    : undefined;
  const theme = rec.theme === "light" || rec.theme === "dark" ? rec.theme : undefined;
  const boardSummary = sanitizeBoardSummary(rec.boardSummary);
  const sessionSummary = cleanString(rec.sessionSummary, 400);
  const priorDiagrams = sanitizeDiagrams(rec.priorDiagrams);
  const recentTurns = sanitizeTurns(rec.recentTurns);
  const lastProvider = cleanString(rec.lastProvider, 32);
  const lastModel = cleanString(rec.lastModel, 64);

  return {
    boardKey,
    ...(roomName ? { roomName } : {}),
    ...(mode ? { mode } : {}),
    ...(participantCount !== undefined ? { participantCount } : {}),
    ...(theme ? { theme } : {}),
    ...(boardSummary ? { boardSummary } : {}),
    ...(sessionSummary ? { sessionSummary } : {}),
    ...(priorDiagrams.length > 0 ? { priorDiagrams } : {}),
    ...(recentTurns.length > 0 ? { recentTurns } : {}),
    ...(lastProvider ? { lastProvider } : {}),
    ...(lastModel ? { lastModel } : {}),
  };
}

function mergeDiagrams(
  stored: SessionDiagramSummary[],
  incoming: SessionDiagramSummary[]
): SessionDiagramSummary[] {
  const byId = new Map<string, SessionDiagramSummary>();
  for (const item of stored) byId.set(item.sessionId, item);
  for (const item of incoming) {
    const existing = byId.get(item.sessionId);
    if (!existing || item.updatedAt >= existing.updatedAt) {
      byId.set(item.sessionId, item);
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(-MAX_DIAGRAMS);
}

function mergeTurns(
  stored: GlobalSessionTurn[],
  incoming: GlobalSessionTurn[]
): GlobalSessionTurn[] {
  const combined = [...stored];
  const seen = new Set(stored.map((t) => `${t.role}:${t.content}`));
  for (const turn of incoming) {
    const key = `${turn.role}:${turn.content}`;
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(turn);
    }
  }
  return combined.slice(-MAX_TURNS);
}

/**
 * Combines live client canvas state with any server-side session continuity
 * already recorded for the same board so any AI can take over seamlessly.
 */
export function mergeWithStoredBoardContext(
  incoming?: GlobalAiContext
): GlobalAiContext | undefined {
  if (!incoming) return undefined;
  const stored = boardContextStore.get(incoming.boardKey);
  if (!stored) return incoming;

  const priorDiagrams = mergeDiagrams(stored.priorDiagrams, incoming.priorDiagrams ?? []);
  const recentTurns = mergeTurns(stored.recentTurns, incoming.recentTurns ?? []);
  const boardSummary = incoming.boardSummary ?? stored.boardSummary;
  const sessionSummary = incoming.sessionSummary ?? stored.sessionSummary;

  return {
    boardKey: incoming.boardKey,
    roomName: incoming.roomName ?? stored.roomName,
    mode: incoming.mode ?? stored.mode,
    participantCount: incoming.participantCount ?? stored.participantCount,
    theme: incoming.theme ?? stored.theme,
    ...(boardSummary ? { boardSummary } : {}),
    ...(sessionSummary ? { sessionSummary } : {}),
    ...(priorDiagrams.length > 0 ? { priorDiagrams } : {}),
    ...(recentTurns.length > 0 ? { recentTurns } : {}),
    lastProvider: incoming.lastProvider ?? stored.lastProvider,
    lastModel: incoming.lastModel ?? stored.lastModel,
  };
}

export interface RecordContextTurnParams {
  context?: GlobalAiContext;
  turns: GlobalSessionTurn[];
  diagram?: SessionDiagramSummary;
  lastProvider?: string;
  lastModel?: string;
}

/**
 * Persists completed user/assistant turns and diagram summaries under the board's
 * shared global context so the next request—even on a different provider or collaborator—
 * keeps full awareness of the session.
 */
export function recordGlobalContextTurn(params: RecordContextTurnParams): void {
  const { context, turns, diagram, lastProvider, lastModel } = params;
  const boardKey = context?.boardKey;
  if (!boardKey) return;

  const existing = boardContextStore.get(boardKey);
  const priorDiagrams = mergeDiagrams(
    existing?.priorDiagrams ?? context?.priorDiagrams ?? [],
    diagram ? [diagram] : []
  );
  const recentTurns = mergeTurns(
    existing?.recentTurns ?? context?.recentTurns ?? [],
    turns
  );

  boardContextStore.set(boardKey, {
    boardKey,
    roomName: context?.roomName ?? existing?.roomName,
    mode: context?.mode ?? existing?.mode,
    participantCount: context?.participantCount ?? existing?.participantCount,
    theme: context?.theme ?? existing?.theme,
    boardSummary: context?.boardSummary ?? existing?.boardSummary,
    sessionSummary: diagram?.summary ?? context?.sessionSummary ?? existing?.sessionSummary,
    priorDiagrams,
    recentTurns,
    lastProvider: lastProvider ?? context?.lastProvider ?? existing?.lastProvider,
    lastModel: lastModel ?? context?.lastModel ?? existing?.lastModel,
  });
}

export function clearStoredBoardContext(boardKey?: string): void {
  const cleaned = cleanBoardKey(boardKey);
  if (!cleaned) return;
  boardContextStore.delete(cleaned);
}

export function clearAllStoredBoardContexts(): void {
  boardContextStore.clear();
}

export function getStoredBoardContext(boardKey: string): GlobalAiContext | undefined {
  const cleaned = cleanBoardKey(boardKey);
  if (!cleaned) return undefined;
  const entry = boardContextStore.get(cleaned);
  if (!entry) return undefined;
  return { ...entry };
}

/**
 * Formats the shared global session context into a provider-agnostic block that
 * both Gemini and local Ollama models can read directly.
 */
export function formatGlobalContextPrompt(context?: GlobalAiContext): string {
  if (!context) return "";

  const lines: string[] = [];

  const workspaceBits: string[] = [];
  if (context.roomName) workspaceBits.push(`Room "${context.roomName}"`);
  else workspaceBits.push(`Board ${context.boardKey}`);
  if (context.mode) workspaceBits.push(context.mode === "solo" ? "personal canvas" : "collaborative room");
  if (context.participantCount && context.participantCount > 1) {
    workspaceBits.push(`${context.participantCount} active participants`);
  }
  if (context.theme) workspaceBits.push(`${context.theme} theme`);
  if (workspaceBits.length > 0) {
    lines.push(`Workspace: ${workspaceBits.join(" | ")}`);
  }

  if (context.lastProvider || context.lastModel) {
    const engineName = [context.lastProvider, context.lastModel].filter(Boolean).join("/");
    lines.push(
      `Cross-model continuity: Previous session turn was handled by ${engineName}. Preserve established concepts, node ids, and domain naming seamlessly.`
    );
  }

  if (context.sessionSummary) {
    lines.push(`Session focus: ${context.sessionSummary}`);
  }

  const board = context.boardSummary;
  if (board && (board.nodes.length > 0 || board.connections.length > 0 || board.strokeCount > 0)) {
    lines.push(
      `Live whiteboard canvas (${board.totalElements} elements, ${board.strokeCount} freehand strokes):`
    );
    for (const node of board.nodes.slice(0, 30)) {
      const tag = node.shapeType ? `${node.kind}:${node.shapeType}` : node.kind;
      lines.push(`- [${node.id}] (${tag}) ${node.label}`);
    }
    if (board.nodes.length > 30) {
      lines.push(`- ... and ${board.nodes.length - 30} more board items`);
    }
    for (const edge of board.connections.slice(0, 25)) {
      lines.push(
        `- edge ${edge.from} -> ${edge.to}${edge.label ? ` ("${edge.label}")` : ""}`
      );
    }
  }

  if (context.priorDiagrams && context.priorDiagrams.length > 0) {
    lines.push("Diagrams already created in this session:");
    for (const d of context.priorDiagrams.slice(-4)) {
      const by = [d.provider, d.model].filter(Boolean).join("/");
      lines.push(
        `- "${d.title}" (${d.type}, ${d.nodeCount} nodes${by ? `, by ${by}` : ""}): ${d.summary}`
      );
    }
  }

  if (context.recentTurns && context.recentTurns.length > 0) {
    lines.push("Recent session conversation:");
    for (const turn of context.recentTurns.slice(-8)) {
      const actor =
        turn.role === "user"
          ? "User"
          : `Assistant${turn.model ? ` [${turn.provider ?? "ai"}/${turn.model}]` : ""}`;
      lines.push(`- ${actor}: ${turn.content}`);
    }
  }

  if (lines.length === 0) return "";
  return ["[GLOBAL SESSION CONTEXT]", ...lines, "[/GLOBAL SESSION CONTEXT]"].join("\n");
}

/** Deterministic fingerprint of semantic context so graphCache avoids serving stale board responses. */
export function contextCacheFingerprint(context?: GlobalAiContext): string {
  if (!context) return "";
  const compact = {
    b: context.boardKey,
    r: context.roomName ?? "",
    s: context.sessionSummary ?? "",
    n: (context.boardSummary?.nodes ?? []).map((n) => `${n.id}:${n.kind}:${n.label}`),
    e: (context.boardSummary?.connections ?? []).map((c) => `${c.from}>${c.to}:${c.label ?? ""}`),
    d: (context.priorDiagrams ?? []).map((d) => `${d.sessionId}:${d.title}:${d.nodeCount}`),
    t: (context.recentTurns ?? []).map((t) => `${t.role}:${t.content.slice(0, 80)}`),
  };
  return JSON.stringify(compact);
}
