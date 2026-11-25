import type { CanvasElement } from "../types";
import type {
  AiSessionState,
  BoardEdgeContext,
  BoardNodeContext,
  BoardSummaryContext,
  GlobalAiContext,
} from "./types";
import type { BoardAiLedger } from "../utils/aiSessionStorage";

const MAX_CONTEXT_NODES = 45;
const MAX_CONTEXT_EDGES = 50;

function trimLabel(raw: string | undefined, maxLen = 120): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

/**
 * Distills live whiteboard elements (stickies, shapes, texts, icons, wires)
 * into a compact semantic graph snapshot that any LLM can read.
 */
export function summarizeBoardElements(
  elements: Record<string, CanvasElement>
): BoardSummaryContext | undefined {
  const all = Object.values(elements);
  if (all.length === 0) return undefined;

  let strokeCount = 0;
  const candidateNodes: Array<{ node: BoardNodeContext; updatedAt: number }> = [];
  const rawWires: Array<{ edge: BoardEdgeContext; updatedAt: number }> = [];

  for (const el of all) {
    if (el.type === "stroke") {
      strokeCount += 1;
      continue;
    }

    if (el.type === "wire") {
      const label = trimLabel(el.label, 80);
      rawWires.push({
        edge: {
          from: el.fromId,
          to: el.toId,
          ...(label ? { label } : {}),
        },
        updatedAt: el.updatedAt ?? 0,
      });
      continue;
    }

    if (el.type === "sticky") {
      const label = trimLabel(el.text) || "Sticky note";
      candidateNodes.push({
        node: {
          id: el.id,
          kind: "sticky",
          label,
          ...(el.userName ? { author: el.userName } : {}),
        },
        updatedAt: el.updatedAt ?? 0,
      });
    } else if (el.type === "text") {
      const label = trimLabel(el.text);
      if (label) {
        candidateNodes.push({
          node: {
            id: el.id,
            kind: "text",
            label,
            ...(el.userName ? { author: el.userName } : {}),
          },
          updatedAt: el.updatedAt ?? 0,
        });
      }
    } else if (el.type === "shape") {
      const label = trimLabel(el.text) || el.shapeType;
      candidateNodes.push({
        node: {
          id: el.id,
          kind: "shape",
          label,
          shapeType: el.shapeType,
          ...(el.userName ? { author: el.userName } : {}),
        },
        updatedAt: el.updatedAt ?? 0,
      });
    } else if (el.type === "icon") {
      candidateNodes.push({
        node: {
          id: el.id,
          kind: "icon",
          label: trimLabel(el.iconName, 40) || "icon",
          ...(el.userName ? { author: el.userName } : {}),
        },
        updatedAt: el.updatedAt ?? 0,
      });
    }
  }

  candidateNodes.sort((a, b) => b.updatedAt - a.updatedAt);
  const nodes = candidateNodes.slice(0, MAX_CONTEXT_NODES).map((entry) => entry.node);
  const keptIds = new Set(nodes.map((node) => node.id));

  rawWires.sort((a, b) => b.updatedAt - a.updatedAt);
  const connections = rawWires
    .map((entry) => entry.edge)
    .filter((edge) => keptIds.has(edge.from) && keptIds.has(edge.to))
    .slice(0, MAX_CONTEXT_EDGES);

  return {
    totalElements: all.length,
    strokeCount,
    nodes,
    connections,
  };
}

export interface BuildGlobalAiContextParams {
  boardKey: string;
  roomName?: string;
  isSoloMode: boolean;
  participantCount: number;
  theme: "light" | "dark";
  elements: Record<string, CanvasElement>;
  activeSession: AiSessionState | null;
  boardLedger: BoardAiLedger;
}

/**
 * Builds the canonical, provider-agnostic session context sent to Gemini, Ollama,
 * or the local fallback engine on every generation or revision turn.
 */
export function buildGlobalAiContext({
  boardKey,
  roomName,
  isSoloMode,
  participantCount,
  theme,
  elements,
  activeSession,
  boardLedger,
}: BuildGlobalAiContextParams): GlobalAiContext {
  const boardSummary = summarizeBoardElements(elements);

  const sessionSummary =
    activeSession?.summary ||
    boardLedger.diagrams[boardLedger.diagrams.length - 1]?.summary;

  const sessionTurns = (activeSession?.messages ?? []).map((msg) => ({
    role: msg.role,
    content: msg.content,
    ...(msg.provider ? { provider: msg.provider } : {}),
    ...(msg.model ? { model: msg.model } : {}),
    diagramTitle: activeSession?.title,
    at: msg.at,
  }));

  const combinedTurns = [...boardLedger.turns];
  const seen = new Set(combinedTurns.map((t) => `${t.role}:${t.content}`));
  for (const turn of sessionTurns) {
    const key = `${turn.role}:${turn.content}`;
    if (!seen.has(key)) {
      seen.add(key);
      combinedTurns.push(turn);
    }
  }

  return {
    boardKey: boardKey || "solo",
    ...(roomName ? { roomName } : {}),
    mode: isSoloMode ? "solo" : "room",
    participantCount: Math.max(1, participantCount),
    theme,
    ...(boardSummary ? { boardSummary } : {}),
    ...(sessionSummary ? { sessionSummary } : {}),
    ...(boardLedger.diagrams.length > 0 ? { priorDiagrams: boardLedger.diagrams } : {}),
    ...(combinedTurns.length > 0 ? { recentTurns: combinedTurns.slice(-16) } : {}),
    ...(boardLedger.lastProvider ? { lastProvider: boardLedger.lastProvider } : {}),
    ...(boardLedger.lastModel ? { lastModel: boardLedger.lastModel } : {}),
  };
}
