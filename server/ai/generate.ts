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
  buildInitialUserMessage,
  buildRetryUserMessage,
  buildRevisionUserMessage,
} from "./prompt";
import { normalizeGraph, type NormalizeOptions } from "./normalize";
import type { NormalizedGraph } from "./types";
import { layoutGraph } from "./layout";
import { buildElements } from "./elements";
import { buildFallbackGraph } from "./fallback";
import {
  callAiModel,
  defaultDiagramAuthor,
  providerDisplayName,
  resolveProviderChain,
  summarizeProvider,
  type AiProviderInfo,
  type AiProviderSummary,
} from "./providers";

// ---------------------------------------------------------------------------
// Response cache — stores the semantic graph, never geometry or element ids.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

interface CachedGraph {
  graph: DiagramGraph;
  /** Which backend actually produced this graph (the chain may have failed over). */
  provider: AiProviderInfo;
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
  provider: AiProviderInfo,
  prompt: string,
  type: DiagramType,
  detail: DetailLevel,
  direction: DiagramDirection
): string {
  return [
    AI_SCHEMA_VERSION,
    provider.name,
    provider.model,
    type,
    detail,
    direction,
    prompt.trim().toLowerCase(),
  ].join("|");
}

// ---------------------------------------------------------------------------
// Throttled outbound queue — Gemini's free tier allows ~15 requests/minute,
// while a local Ollama server only needs a small breather between calls.
// ---------------------------------------------------------------------------

let lastOutboundTime = 0;
let queuePromise: Promise<void> = Promise.resolve();

function outboundIntervalMs(provider: AiProviderInfo): number {
  if (provider.name === "ollama") {
    const configured = Number(process.env.OLLAMA_MIN_INTERVAL_MS);
    return Number.isFinite(configured) && configured >= 0 ? configured : 250;
  }
  return 3000;
}

function scheduleThrottledTask<T>(intervalMs: number, task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const elapsed = Date.now() - lastOutboundTime;
    const waitTime = Math.max(0, intervalMs - elapsed);
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
// Failover chain — try the preferred model, then the next ones, so an upstream
// outage degrades to another real model instead of the procedural engine.
// ---------------------------------------------------------------------------

interface ChainResult {
  raw: unknown;
  provider: AiProviderInfo;
  /** Providers that were skipped because they failed. */
  failed: AiProviderInfo[];
}

function callModelOnce(
  provider: AiProviderInfo,
  message: string,
  temperature: number,
  maxRetries: number
): Promise<unknown> {
  return scheduleThrottledTask(outboundIntervalMs(provider), () =>
    callAiModel(provider, message, temperature, { maxRetries })
  );
}

async function callModelChain(
  chain: AiProviderInfo[],
  message: string,
  temperature: number
): Promise<ChainResult> {
  const failed: AiProviderInfo[] = [];
  const errors: string[] = [];
  // With alternatives available, fail over quickly instead of retrying the same
  // unavailable model (a 503 spike is rarely resolved by waiting).
  const maxRetries = chain.length > 1 ? 1 : 3;

  for (const provider of chain) {
    try {
      const raw = await callModelOnce(provider, message, temperature, maxRetries);
      if (failed.length > 0) {
        console.warn(
          `[AI Failover]: ${provider.label} (${provider.model}) answered after skipping ${failed.map((p) => p.model).join(", ")}.`
        );
      }
      return { raw, provider, failed };
    } catch (error: unknown) {
      const reason = `${provider.label} (${provider.model}): ${(error as Error).message}`;
      failed.push(provider);
      errors.push(reason);
      console.warn(`[AI Failover]: ${reason}`);
    }
  }

  throw new Error(
    errors.join(" | ") || "No AI model backend is configured for failover."
  );
}

function failoverNotice(failed: AiProviderInfo[], chosen: AiProviderInfo): string | undefined {
  if (failed.length === 0) return undefined;
  const names = [...new Set(failed.map(providerDisplayName))].join(", ");
  return `${names} unavailable — ${providerDisplayName(chosen)} produced this diagram.`;
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
  engine?: AiProviderSummary;
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
    engine,
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
    ...(engine ? { provider: engine.provider, model: engine.model } : {}),
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
  const { prompt, type, detail, direction, canvasCenter = { x: 0, y: 0 } } = params;

  const chain = resolveProviderChain();
  const provider = chain[0] ?? null;
  const sessionId = sanitizeSessionId(params.sessionId);
  const options: NormalizeOptions = {
    type,
    detail,
    mode: "initial",
    fallbackTitle: prompt.length > 70 ? `${prompt.slice(0, 69)}…` : prompt,
  };

  // No model backend configured: serve the deterministic local engine.
  if (!provider) {
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
      author: params.author ?? defaultDiagramAuthor(null),
      canvasCenter,
      engine: { provider: "fallback", model: "procedural", label: "Local fallback engine" },
      isFallback: true,
      notice:
        "No AI model is configured, so this diagram was generated by the local fallback engine.",
    });
  }

  const key = cacheKey(provider, prompt, type, detail, direction);

  const cached = graphCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: cached.graph,
      author: params.author ?? defaultDiagramAuthor(cached.provider),
      canvasCenter,
      engine: summarizeProvider(cached.provider),
      fromCache: true,
    });
  }

  try {
    const baseMessage = buildInitialUserMessage(prompt, type, detail, direction);
    const attempt = await callModelChain(chain, baseMessage, 0.4);
    const chosen = attempt.provider;
    let best = normalizeGraph(attempt.raw, options);

    if (best.issues.length > 0) {
      console.warn(`[AI Quality Gate]: ${best.issues.join(" ")} Retrying once with stricter guidance.`);
      const retryMessage = buildRetryUserMessage(baseMessage, best.issues);
      try {
        const secondRaw = await callModelOnce(chosen, retryMessage, 0.3, 2);
        best = pickBetter(best, normalizeGraph(secondRaw, options));
      } catch (retryError: unknown) {
        console.warn(
          `[AI Quality Gate]: Retry failed: ${(retryError as Error).message}. Keeping the first result.`
        );
      }
    }

    if (best.graph.nodes.length === 0) {
      throw new Error(`The ${chosen.label} model returned an empty diagram.`);
    }

    if (best.issues.length === 0) {
      graphCache.set(key, { graph: best.graph, provider: chosen, timestamp: Date.now() });
    }

    const notice =
      best.issues.length > 0
        ? `Quality checks reported: ${best.issues[0]}`
        : failoverNotice(attempt.failed, chosen);

    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: best.graph,
      author: params.author ?? defaultDiagramAuthor(chosen),
      canvasCenter,
      engine: summarizeProvider(chosen),
      ...(notice ? { notice } : {}),
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
      author: params.author ?? defaultDiagramAuthor(null),
      canvasCenter,
      engine: { provider: "fallback", model: "procedural", label: "Local fallback engine" },
      isFallback: true,
      notice: `No AI model responded (${chain.map(providerDisplayName).join(", ")}), so this diagram was generated by the local fallback engine.`,
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
  } = params;

  const chain = resolveProviderChain();
  const provider = chain[0] ?? null;

  if (!provider || chain.length === 0) {
    throw new Error(
      "No AI model is configured on the server, so follow-up edits are unavailable."
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

  const attempt = await callModelChain(chain, baseMessage, 0.3);
  const chosen = attempt.provider;
  let best = normalizeGraph(attempt.raw, options);

  let bestRaw: unknown = attempt.raw;
  if (best.issues.length > 0) {
    const retryMessage = buildRetryUserMessage(baseMessage, best.issues);
    try {
      const secondRaw = await callModelOnce(chosen, retryMessage, 0.25, 2);
      const second = normalizeGraph(secondRaw, options);
      if (pickBetter(best, second) === second) bestRaw = secondRaw;
      best = pickBetter(best, second);
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
      author: params.author ?? defaultDiagramAuthor(chosen),
      canvasCenter,
      engine: summarizeProvider(chosen),
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
  const notice = failoverNotice(attempt.failed, chosen);

  return assemblePayload({
    sessionId,
    type,
    detail,
    direction,
    graph: best.graph,
    author: params.author ?? defaultDiagramAuthor(chosen),
    canvasCenter,
    changes,
    engine: summarizeProvider(chosen),
    ...(notice ? { notice } : {}),
  });
}
