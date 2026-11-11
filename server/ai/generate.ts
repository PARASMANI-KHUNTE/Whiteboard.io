import type {
  CanvasCenter,
  ChatTurn,
  DetailLevel,
  DiagramAuthor,
  DiagramDirection,
  DiagramGraph,
  DiagramPayload,
  DiagramType,
} from "./types";
import { sanitizeSessionId } from "./types";
import {
  AI_SCHEMA_VERSION,
  GRAPH_RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  buildInitialUserMessage,
  buildRetryUserMessage,
  buildRevisionUserMessage,
} from "./prompt";
import { normalizeGraph, type NormalizeOptions } from "./normalize";
import type { NormalizedGraph } from "./types";
import { layoutGraph } from "./layout";
import { buildElements } from "./elements";
import { buildFallbackGraph } from "./fallback";

// ---------------------------------------------------------------------------
// Response cache — stores the semantic graph, never geometry or element ids.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

interface CachedGraph {
  graph: DiagramGraph;
  timestamp: number;
}

const graphCache = new Map<string, CachedGraph>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of graphCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) graphCache.delete(key);
  }
}, 10 * 60 * 1000);
cleanupTimer.unref?.();

function cacheKey(
  prompt: string,
  type: DiagramType,
  detail: DetailLevel,
  direction: DiagramDirection
): string {
  return [AI_SCHEMA_VERSION, type, detail, direction, prompt.trim().toLowerCase()].join("|");
}

// ---------------------------------------------------------------------------
// Throttled outbound queue — Gemini free tier allows ~15 requests/minute.
// ---------------------------------------------------------------------------

const MIN_REQUEST_INTERVAL_MS = 3000;
let lastOutboundTime = 0;
let queuePromise: Promise<void> = Promise.resolve();

function scheduleThrottledTask<T>(task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const elapsed = Date.now() - lastOutboundTime;
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL_MS - elapsed);
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    lastOutboundTime = Date.now();
    return task();
  };

  const nextPromise = queuePromise.then(run, run);
  queuePromise = nextPromise.then(
    () => {},
    () => {}
  );
  return nextPromise;
}

// ---------------------------------------------------------------------------
// Gemini caller
// ---------------------------------------------------------------------------

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(Math.max(seconds * 1000, 1000), 30_000);
    }
  }
  const exponentialDelay = Math.min(2 ** attempt * 1000, 15_000);
  return exponentialDelay + Math.floor(Math.random() * 500);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error("Gemini returned a response that was not valid JSON.");
  }
}

async function callGemini(
  apiKey: string,
  userMessage: string,
  temperature: number,
  maxRetries = 3
): Promise<unknown> {
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GRAPH_RESPONSE_SCHEMA,
      temperature,
      maxOutputTokens: 8192,
    },
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(45_000),
      });

      if (response.status === 429 || response.status === 503) {
        if (attempt === maxRetries) {
          const reason = response.status === 429 ? "rate limit" : "service unavailable";
          throw new Error(
            `Gemini ${reason} after ${maxRetries} attempts (HTTP ${response.status}).`
          );
        }
        const delayMs = getRetryDelayMs(response, attempt);
        console.warn(
          `[AI Retry]: HTTP ${response.status}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
        );
        await response.body?.cancel().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!response.ok || !text) {
        const message =
          data.error?.message || response.statusText || "Failed to generate a diagram from Gemini";
        const error = new Error(`Gemini API Error: ${message}`) as Error & { fatal?: boolean };
        if (response.status >= 400 && response.status < 500) error.fatal = true;
        throw error;
      }

      return extractJson(text);
    } catch (err: unknown) {
      const error = err as Error & { fatal?: boolean };
      if (attempt === maxRetries || error.fatal) throw error;
      const delayMs = Math.min(1500 * attempt, 5000) + Math.floor(Math.random() * 500);
      console.warn(
        `[AI Retry]: ${error.message}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error("Gemini API call failed after multiple retry attempts");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSuggestions(type: DiagramType): string[] {
  switch (type) {
    case "flowchart":
      return ["Add an error-code table", "Annotate retry and timeout paths", "Split async steps"];
    case "architecture":
      return ["Mark trust boundaries", "Add observability per service", "Annotate failure modes"];
    case "mindmap":
      return ["Turn risks into experiments", "Add an owner to each next step"];
    default:
      return ["Dot-vote the top ideas", "Assign owners to next steps"];
  }
}

function extractStringArray(value: unknown, limit = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function describeChanges(before: DiagramGraph, after: DiagramGraph): string[] {
  const beforeNodes = new Set(before.nodes.map((node) => node.id));
  const afterNodes = new Set(after.nodes.map((node) => node.id));
  const beforeEdges = new Set(before.edges.map((edge) => `${edge.from}>${edge.to}`));
  const afterEdges = new Set(after.edges.map((edge) => `${edge.from}>${edge.to}`));

  const added = after.nodes.filter((node) => !beforeNodes.has(node.id)).length;
  const removed = before.nodes.filter((node) => !afterNodes.has(node.id)).length;
  const addedEdges = [...afterEdges].filter((edge) => !beforeEdges.has(edge)).length;
  const removedEdges = [...beforeEdges].filter((edge) => !afterEdges.has(edge)).length;

  const bullets: string[] = [];
  if (added > 0) bullets.push(`Added ${added} node${added === 1 ? "" : "s"}.`);
  if (removed > 0) bullets.push(`Removed ${removed} node${removed === 1 ? "" : "s"}.`);
  if (addedEdges > 0) bullets.push(`Added ${addedEdges} connection${addedEdges === 1 ? "" : "s"}.`);
  if (removedEdges > 0) {
    bullets.push(`Removed ${removedEdges} connection${removedEdges === 1 ? "" : "s"}.`);
  }
  if (bullets.length === 0) bullets.push("Updated the diagram content and layout.");
  return bullets;
}

function pickBetter(first: NormalizedGraph, second: NormalizedGraph): NormalizedGraph {
  if (second.graph.nodes.length === 0) return first;
  if (first.graph.nodes.length === 0) return second;
  return second.issues.length < first.issues.length ? second : first;
}

interface AssembleParams {
  sessionId: string;
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
  graph: DiagramGraph;
  author: DiagramAuthor;
  canvasCenter: CanvasCenter;
  changes?: string[];
  fromCache?: boolean;
  isFallback?: boolean;
  notice?: string;
}

function assemblePayload(params: AssembleParams): DiagramPayload {
  const {
    sessionId,
    type,
    detail,
    direction,
    graph,
    author,
    canvasCenter,
    changes = [],
    fromCache,
    isFallback,
    notice,
  } = params;

  const layout = layoutGraph(graph, type, direction);
  const elements = buildElements({
    sessionId,
    type,
    graph,
    layout,
    author,
    canvasCenter,
  });

  return {
    sessionId,
    type,
    detail,
    direction,
    graph,
    elements,
    title: graph.title,
    summary: graph.summary,
    suggestions: graph.suggestions.length > 0 ? graph.suggestions : defaultSuggestions(type),
    changes,
    ...(fromCache ? { fromCache } : {}),
    ...(isFallback ? { isFallback } : {}),
    ...(notice ? { notice } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateDiagramParams {
  prompt: string;
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
  canvasCenter?: CanvasCenter;
  author?: DiagramAuthor;
  sessionId?: string;
}

export async function generateDiagram(params: GenerateDiagramParams): Promise<DiagramPayload> {
  const {
    prompt,
    type,
    detail,
    direction,
    canvasCenter = { x: 0, y: 0 },
    author = { id: "ai_gemini", name: "Gemini AI" },
  } = params;

  const sessionId = sanitizeSessionId(params.sessionId);
  const key = cacheKey(prompt, type, detail, direction);
  const options: NormalizeOptions = {
    type,
    detail,
    mode: "initial",
    fallbackTitle: prompt.length > 70 ? `${prompt.slice(0, 69)}…` : prompt,
  };

  const cached = graphCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: cached.graph,
      author,
      canvasCenter,
      fromCache: true,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    const fallback = normalizeGraph(
      buildFallbackGraph(prompt, type, detail) as unknown,
      options
    );
    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: fallback.graph,
      author,
      canvasCenter,
      isFallback: true,
      notice:
        "GEMINI_API_KEY is not configured, so this diagram was generated by the local fallback engine.",
    });
  }

  try {
    const baseMessage = buildInitialUserMessage(prompt, type, detail, direction);
    const firstRaw = await scheduleThrottledTask(() => callGemini(apiKey, baseMessage, 0.4));
    const first = normalizeGraph(firstRaw, options);

    let best = first;
    if (first.issues.length > 0) {
      console.warn(`[AI Quality Gate]: ${first.issues.join(" ")} Retrying once with stricter guidance.`);
      const retryMessage = buildRetryUserMessage(baseMessage, first.issues);
      try {
        const secondRaw = await scheduleThrottledTask(() =>
          callGemini(apiKey, retryMessage, 0.3)
        );
        best = pickBetter(first, normalizeGraph(secondRaw, options));
      } catch (retryError: unknown) {
        console.warn(
          `[AI Quality Gate]: Retry failed: ${(retryError as Error).message}. Keeping the first result.`
        );
      }
    }

    if (best.graph.nodes.length === 0) {
      throw new Error("Gemini returned an empty diagram.");
    }

    if (best.issues.length === 0) {
      graphCache.set(key, { graph: best.graph, timestamp: Date.now() });
    }

    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: best.graph,
      author,
      canvasCenter,
      ...(best.issues.length > 0
        ? { notice: `Quality checks reported: ${best.issues[0]}` }
        : {}),
    });
  } catch (error: unknown) {
    console.warn(
      `[AI Graceful Fallback]: ${(error as Error).message}. Using the local diagram engine.`
    );
    const fallback = normalizeGraph(
      buildFallbackGraph(prompt, type, detail) as unknown,
      options
    );
    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: fallback.graph,
      author,
      canvasCenter,
      isFallback: true,
      notice: "Gemini was unavailable, so this diagram was generated by the local fallback engine.",
    });
  }
}

export interface ReviseDiagramParams {
  instruction: string;
  graph: DiagramGraph;
  history?: ChatTurn[];
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
  canvasCenter?: CanvasCenter;
  author?: DiagramAuthor;
  sessionId?: string;
}

export async function reviseDiagram(params: ReviseDiagramParams): Promise<DiagramPayload> {
  const {
    instruction,
    graph,
    history = [],
    type,
    detail,
    direction,
    canvasCenter = { x: 0, y: 0 },
    author = { id: "ai_gemini", name: "Gemini AI" },
  } = params;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server, so follow-up edits are unavailable."
    );
  }

  const sessionId = sanitizeSessionId(params.sessionId);
  const current = normalizeGraph(graph, {
    type,
    detail,
    mode: "followup",
    fallbackTitle: graph.title,
    fallbackSummary: graph.summary,
  });

  const baseMessage = buildRevisionUserMessage({
    instruction,
    graph: current.graph,
    history,
    type,
    detail,
    direction,
  });

  const options: NormalizeOptions = {
    type,
    detail,
    mode: "followup",
    fallbackTitle: current.graph.title,
    fallbackSummary: current.graph.summary,
  };

  const firstRaw = await scheduleThrottledTask(() => callGemini(apiKey, baseMessage, 0.3));
  const first = normalizeGraph(firstRaw, options);

  let best = first;
  let bestRaw: unknown = firstRaw;
  if (first.issues.length > 0) {
    const retryMessage = buildRetryUserMessage(baseMessage, first.issues);
    try {
      const secondRaw = await scheduleThrottledTask(() =>
        callGemini(apiKey, retryMessage, 0.25)
      );
      const second = normalizeGraph(secondRaw, options);
      if (pickBetter(first, second) === second) bestRaw = secondRaw;
      best = pickBetter(first, second);
    } catch (retryError: unknown) {
      console.warn(
        `[AI Quality Gate]: Revision retry failed: ${(retryError as Error).message}. Keeping the first result.`
      );
    }
  }

  // Never let a failed revision erase a diagram the user already has.
  if (best.graph.nodes.length === 0) {
    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: current.graph,
      author,
      canvasCenter,
      changes: ["The AI returned no usable nodes, so the diagram was left unchanged."],
      notice: "The AI response was empty. Your diagram was left as it was — try rephrasing the instruction.",
    });
  }

  const rawChanges = extractStringArray(
    typeof bestRaw === "object" && bestRaw !== null
      ? (bestRaw as { changes?: unknown }).changes
      : undefined
  );
  const changes =
    rawChanges.length > 0 ? rawChanges : describeChanges(current.graph, best.graph);

  return assemblePayload({
    sessionId,
    type,
    detail,
    direction,
    graph: best.graph,
    author,
    canvasCenter,
    changes,
  });
}
