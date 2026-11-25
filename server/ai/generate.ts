import type {
  CanvasCenter,
  ChatTurn,
  DetailLevel,
  DiagramAuthor,
  DiagramDirection,
  DiagramGraph,
  DiagramPayload,
  DiagramType,
  GlobalAiContext,
} from "./types";
import { sanitizeSessionId } from "./types";
import { RequestAbortedError, throwIfAborted } from "./abort";
import { QueueFullError, ThrottledQueue } from "./requestQueue";
import { TimedCache } from "./responseCache";
import {
  contextCacheFingerprint,
  mergeWithStoredBoardContext,
  recordGlobalContextTurn,
} from "./context";
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
  resolveProviderChainAsync,
  summarizeProvider,
  type AiProviderInfo,
  type AiProviderSelection,
  type AiProviderSummary,
} from "./providers";

export { QueueFullError as AiQueueFullError } from "./requestQueue";

// ---------------------------------------------------------------------------
// Response cache — stores the semantic graph, never geometry or element ids.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

interface CachedGraph {
  graph: DiagramGraph;
  /** Which backend actually produced this graph (the chain may have failed over). */
  provider: AiProviderInfo;
}

function positiveEnvInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const graphCache = new TimedCache<CachedGraph>(positiveEnvInt("AI_CACHE_MAX_ENTRIES", 256), CACHE_TTL_MS);

const cleanupTimer = setInterval(() => {
  graphCache.prune();
}, 10 * 60 * 1000);
cleanupTimer.unref?.();

function cacheKey(
  provider: AiProviderInfo,
  prompt: string,
  type: DiagramType,
  detail: DetailLevel,
  direction: DiagramDirection,
  contextDigest: string
): string {
  return [
    AI_SCHEMA_VERSION,
    provider.name,
    provider.model,
    type,
    detail,
    direction,
    prompt.trim().toLowerCase(),
    contextDigest,
  ].join("|");
}

// ---------------------------------------------------------------------------
// Throttled outbound queue — Gemini's free tier allows ~15 requests/minute,
// while a local Ollama server only needs a small breather between calls.
// ---------------------------------------------------------------------------

const outboundQueue = new ThrottledQueue(
  3000,
  positiveEnvInt("AI_QUEUE_MAX_DEPTH", 24)
);

function outboundIntervalMs(provider: AiProviderInfo): number {
  if (provider.name === "ollama") {
    const configured = Number(process.env.OLLAMA_MIN_INTERVAL_MS);
    return Number.isFinite(configured) && configured >= 0 ? configured : 250;
  }
  if (provider.name !== "gemini") {
    return 400;
  }
  return 3000;
}

function scheduleThrottledTask<T>(
  intervalMs: number,
  task: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  return outboundQueue.schedule(intervalMs, task, signal);
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

/**
 * Thrown only after every backend in the chain has failed. Individual provider
 * reasons are already logged once as the chain tries each backend, so the
 * message stays a short summary instead of repeating all of them in the
 * graceful-fallback line.
 */
export class AiFailoverError extends Error {
  readonly reasons: string[];

  constructor(reasons: string[]) {
    const count = reasons.length;
    super(`All ${count} configured AI provider${count === 1 ? "" : "s"} failed.`);
    this.name = "AiFailoverError";
    this.reasons = reasons;
  }
}

/** The name used in diagnostics when every configured model has failed. */
export { AiFailoverError as AllProvidersFailedError };

/** A provider answered with valid JSON but the graph contained no usable nodes. */
export class EmptyDiagramError extends Error {
  constructor(
    readonly provider: AiProviderInfo,
    readonly failed: AiProviderInfo[] = []
  ) {
    super(`The ${provider.label} model returned an empty diagram.`);
    this.name = "EmptyDiagramError";
  }
}

function callModelOnce(
  provider: AiProviderInfo,
  message: string,
  temperature: number,
  maxRetries: number,
  signal?: AbortSignal
): Promise<unknown> {
  return scheduleThrottledTask(
    outboundIntervalMs(provider),
    () => callAiModel(provider, message, temperature, { maxRetries, signal }),
    signal
  );
}

/** Injectable so overload and cancellation behavior can be tested without a live provider chain. */
export type ModelCall = (
  provider: AiProviderInfo,
  message: string,
  temperature: number,
  maxRetries: number,
  signal?: AbortSignal
) => Promise<unknown>;

export async function callModelChain(
  chain: AiProviderInfo[],
  message: string,
  temperature: number,
  call: ModelCall = callModelOnce,
  signal?: AbortSignal
): Promise<ChainResult> {
  throwIfAborted(signal);
  const failed: AiProviderInfo[] = [];
  const errors: string[] = [];
  // With alternatives available, fail over quickly instead of retrying the same
  // unavailable model (a 503 spike is rarely resolved by waiting).
  const maxRetries = chain.length > 1 ? 1 : 3;

  for (const provider of chain) {
    throwIfAborted(signal);
    try {
      const raw = await call(provider, message, temperature, maxRetries, signal);
      if (failed.length > 0) {
        console.warn(
          `[AI Failover]: ${provider.label} (${provider.model}) answered after skipping ${failed.map((p) => p.model).join(", ")}.`
        );
      }
      return { raw, provider, failed };
    } catch (error: unknown) {
      throwIfAborted(signal);
      if (error instanceof RequestAbortedError) throw error;
      // Every provider shares the same queue. Trying the next one cannot help,
      // and converting this into AiFailoverError hides overload as a 200
      // fallback instead of the documented 429 (#65).
      if (error instanceof QueueFullError) throw error;
      const reason = `${provider.label} (${provider.model}): ${(error as Error).message}`;
      failed.push(provider);
      errors.push(reason);
      const remaining = chain.length - failed.length;
      const disposition = remaining > 0
        ? ` Trying ${remaining} remaining provider${remaining === 1 ? "" : "s"}.`
        : " No providers left.";
      console.warn(`[AI Failover]: ${reason.replace(/\.$/, "")}.${disposition}`);
    }
  }

  throw new AiFailoverError(errors);
}

function failoverPrefix(failed: AiProviderInfo[], chosen: AiProviderInfo): string | undefined {
  if (failed.length === 0) return undefined;
  const names = [...new Set(failed.map(providerDisplayName))].join(", ");
  return `${names} unavailable — ${providerDisplayName(chosen)}`;
}

function failoverNotice(failed: AiProviderInfo[], chosen: AiProviderInfo): string | undefined {
  const prefix = failoverPrefix(failed, chosen);
  return prefix ? `${prefix} produced this diagram.` : undefined;
}

function qualityNotice(issues: string[]): string | undefined {
  return issues.length > 0 ? `Quality checks reported: ${issues[0]}` : undefined;
}

/**
 * Client notices are composed, never selected with a ternary: a failover that
 * also tripped the quality gate must report both facts.
 */
export function composeGenerationNotice(
  issues: string[],
  failed: AiProviderInfo[],
  chosen: AiProviderInfo
): string | undefined {
  const notices = [failoverNotice(failed, chosen), qualityNotice(issues)].filter(
    (notice): notice is string => Boolean(notice)
  );
  return notices.length > 0 ? notices.join(" ") : undefined;
}

function emptyDiagramNotice(error: EmptyDiagramError): string {
  const subject = failoverPrefix(error.failed, error.provider) ?? providerDisplayName(error.provider);
  return `${subject} answered but returned an empty diagram, so this diagram was generated by the local fallback engine.`;
}

function emptyRevisionNotice(failed: AiProviderInfo[], chosen: AiProviderInfo): string {
  const subject = failoverPrefix(failed, chosen) ?? providerDisplayName(chosen);
  return `${subject} answered but returned an empty diagram. Your diagram was left unchanged — try rephrasing the instruction.`;
}

function fallbackNotice(error: unknown, chain: AiProviderInfo[]): string {
  if (error instanceof EmptyDiagramError) return emptyDiagramNotice(error);

  if (error instanceof AiFailoverError) {
    const names = chain.map(providerDisplayName).join(", ");
    return `No AI model responded (${names}), so this diagram was generated by the local fallback engine.`;
  }

  return `The AI response could not be used (${(error as Error).message}), so this diagram was generated by the local fallback engine.`;
}

function revisionFailureNotice(error: unknown, chain: AiProviderInfo[]): string {
  if (error instanceof EmptyDiagramError) {
    return emptyRevisionNotice(error.failed, error.provider);
  }
  if (error instanceof AiFailoverError) {
    const names = chain.map(providerDisplayName).join(", ");
    return `No AI model responded (${names}). Your diagram was left unchanged — please try again.`;
  }
  return `The AI response could not be used (${(error as Error).message}). Your diagram was left unchanged — please try again.`;
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
  globalContext?: GlobalAiContext;
  preferredProvider?: AiProviderSelection;
  preferredModel?: string;
  signal?: AbortSignal;
}

export async function generateDiagram(params: GenerateDiagramParams): Promise<DiagramPayload> {
  const { prompt, type, detail, direction, canvasCenter = { x: 0, y: 0 }, signal } = params;
  throwIfAborted(signal);

  const mergedContext = mergeWithStoredBoardContext(params.globalContext);
  const chain = await resolveProviderChainAsync(signal, {
    preferredProvider: params.preferredProvider,
    preferredModel: params.preferredModel,
  });
  const provider = chain[0] ?? null;
  const sessionId = sanitizeSessionId(params.sessionId);
  const options: NormalizeOptions = {
    type,
    detail,
    mode: "initial",
    fallbackTitle: prompt.length > 70 ? `${prompt.slice(0, 69)}…` : prompt,
  };

  const recordOutcome = (graph: DiagramGraph, engine: AiProviderSummary) => {
    const now = Date.now();
    recordGlobalContextTurn({
      context: mergedContext,
      lastProvider: engine.provider,
      lastModel: engine.model,
      diagram: {
        sessionId,
        title: graph.title,
        type,
        summary: graph.summary,
        provider: engine.provider,
        model: engine.model,
        nodeCount: graph.nodes.length,
        updatedAt: now,
      },
      turns: [
        { role: "user", content: prompt, at: now },
        {
          role: "assistant",
          content: graph.summary || `Generated ${graph.title}`,
          provider: engine.provider,
          model: engine.model,
          diagramTitle: graph.title,
          at: now + 1,
        },
      ],
    });
  };

  // No model backend configured: serve the deterministic local engine.
  if (!provider) {
    const fallback = normalizeGraph(
      buildFallbackGraph(prompt, type, detail, mergedContext) as unknown,
      options
    );
    const engine: AiProviderSummary = {
      provider: "fallback",
      model: "procedural",
      label: "Local fallback engine",
    };
    recordOutcome(fallback.graph, engine);
    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: fallback.graph,
      author: params.author ?? defaultDiagramAuthor(null),
      canvasCenter,
      engine,
      isFallback: true,
      notice:
        "No AI model is configured, so this diagram was generated by the local fallback engine.",
    });
  }

  const key = cacheKey(
    provider,
    prompt,
    type,
    detail,
    direction,
    contextCacheFingerprint(mergedContext)
  );

  const cached = graphCache.get(key);
  if (cached) {
    const engine = summarizeProvider(cached.provider);
    recordOutcome(cached.graph, engine);
    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: cached.graph,
      author: params.author ?? defaultDiagramAuthor(cached.provider),
      canvasCenter,
      engine,
      fromCache: true,
    });
  }

  try {
    const baseMessage = buildInitialUserMessage(prompt, type, detail, direction, mergedContext);
    const attempt = await callModelChain(chain, baseMessage, 0.4, callModelOnce, signal);
    const chosen = attempt.provider;
    let best = normalizeGraph(attempt.raw, options);

    if (best.issues.length > 0) {
      console.warn(`[AI Quality Gate]: ${best.issues.join(" ")} Retrying once with stricter guidance.`);
      const retryMessage = buildRetryUserMessage(baseMessage, best.issues);
      try {
        const secondRaw = await callModelOnce(chosen, retryMessage, 0.3, 2, signal);
        best = pickBetter(best, normalizeGraph(secondRaw, options));
      } catch (retryError: unknown) {
        if (retryError instanceof RequestAbortedError || retryError instanceof QueueFullError) {
          throw retryError;
        }
        console.warn(
          `[AI Quality Gate]: Retry failed: ${(retryError as Error).message}. Keeping the first result.`
        );
      }
    }

    if (best.graph.nodes.length === 0) {
      throw new EmptyDiagramError(chosen, attempt.failed);
    }

    if (best.issues.length === 0) {
      throwIfAborted(signal);
      graphCache.set(key, { graph: best.graph, provider: chosen });
    }

    const notice = composeGenerationNotice(best.issues, attempt.failed, chosen);
    const engine = summarizeProvider(chosen);
    recordOutcome(best.graph, engine);

    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: best.graph,
      author: params.author ?? defaultDiagramAuthor(chosen),
      canvasCenter,
      engine,
      ...(notice ? { notice } : {}),
    });
  } catch (error: unknown) {
    throwIfAborted(signal);
    if (error instanceof RequestAbortedError || error instanceof QueueFullError) throw error;
    const reason = (error as Error).message.replace(/\.+$/, "");
    console.warn(`[AI Graceful Fallback]: ${reason}. Using the local diagram engine.`);
    const fallback = normalizeGraph(
      buildFallbackGraph(prompt, type, detail, mergedContext) as unknown,
      options
    );
    const engine: AiProviderSummary = {
      provider: "fallback",
      model: "procedural",
      label: "Local fallback engine",
    };
    recordOutcome(fallback.graph, engine);
    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: fallback.graph,
      author: params.author ?? defaultDiagramAuthor(null),
      canvasCenter,
      engine,
      isFallback: true,
      notice: fallbackNotice(error, chain),
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
  globalContext?: GlobalAiContext;
  preferredProvider?: AiProviderSelection;
  preferredModel?: string;
  signal?: AbortSignal;
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
    signal,
  } = params;
  throwIfAborted(signal);

  const mergedContext = mergeWithStoredBoardContext(params.globalContext);
  const sessionId = sanitizeSessionId(params.sessionId);
  const current = normalizeGraph(graph, {
    type,
    detail,
    mode: "followup",
    fallbackTitle: graph.title,
    fallbackSummary: graph.summary,
  });

  const chain = await resolveProviderChainAsync(signal, {
    preferredProvider: params.preferredProvider,
    preferredModel: params.preferredModel,
  });
  const provider = chain[0] ?? null;

  // A failed follow-up must never erase the user's existing diagram.
  const keepCurrentDiagram = (reason: string): DiagramPayload => assemblePayload({
    sessionId,
    type,
    detail,
    direction,
    graph: current.graph,
    author: params.author ?? defaultDiagramAuthor(null),
    canvasCenter,
    engine: { provider: "fallback", model: "procedural", label: "Local fallback engine" },
    isFallback: true,
    changes: ["Your diagram was left unchanged."],
    notice: reason,
  });

  if (!provider || chain.length === 0) {
    return keepCurrentDiagram(
      "No AI model is configured on the server, so follow-up edits are unavailable. Your diagram was left unchanged."
    );
  }

  try {
    const baseMessage = buildRevisionUserMessage({
      instruction,
      graph: current.graph,
      history,
      type,
      detail,
      direction,
      globalContext: mergedContext,
    });

    const options: NormalizeOptions = {
      type,
      detail,
      mode: "followup",
      fallbackTitle: current.graph.title,
      fallbackSummary: current.graph.summary,
    };

    const attempt = await callModelChain(chain, baseMessage, 0.3, callModelOnce, signal);
    const chosen = attempt.provider;
    let best = normalizeGraph(attempt.raw, options);

    let bestRaw: unknown = attempt.raw;
    if (best.issues.length > 0) {
      const retryMessage = buildRetryUserMessage(baseMessage, best.issues);
      try {
        const secondRaw = await callModelOnce(chosen, retryMessage, 0.25, 2, signal);
        const second = normalizeGraph(secondRaw, options);
        if (pickBetter(best, second) === second) bestRaw = secondRaw;
        best = pickBetter(best, second);
      } catch (retryError: unknown) {
        if (retryError instanceof RequestAbortedError || retryError instanceof QueueFullError) {
          throw retryError;
        }
        console.warn(
          `[AI Quality Gate]: Revision retry failed: ${(retryError as Error).message}. Keeping the first result.`
        );
      }
    }

    if (best.graph.nodes.length === 0) {
      return keepCurrentDiagram(emptyRevisionNotice(attempt.failed, chosen));
    }

    const rawChanges = extractStringArray(
      typeof bestRaw === "object" && bestRaw !== null
        ? (bestRaw as { changes?: unknown }).changes
        : undefined
    );
    const changes =
      rawChanges.length > 0 ? rawChanges : describeChanges(current.graph, best.graph);
    const notice = composeGenerationNotice(best.issues, attempt.failed, chosen);
    const engine = summarizeProvider(chosen);

    const now = Date.now();
    recordGlobalContextTurn({
      context: mergedContext,
      lastProvider: engine.provider,
      lastModel: engine.model,
      diagram: {
        sessionId,
        title: best.graph.title,
        type,
        summary: best.graph.summary,
        provider: engine.provider,
        model: engine.model,
        nodeCount: best.graph.nodes.length,
        updatedAt: now,
      },
      turns: [
        { role: "user", content: instruction, at: now },
        {
          role: "assistant",
          content: best.graph.summary || changes[0] || "Updated diagram",
          provider: engine.provider,
          model: engine.model,
          diagramTitle: best.graph.title,
          at: now + 1,
        },
      ],
    });

    return assemblePayload({
      sessionId,
      type,
      detail,
      direction,
      graph: best.graph,
      author: params.author ?? defaultDiagramAuthor(chosen),
      canvasCenter,
      changes,
      engine,
      ...(notice ? { notice } : {}),
    });
  } catch (error: unknown) {
    throwIfAborted(signal);
    if (error instanceof RequestAbortedError || error instanceof QueueFullError) throw error;
    const reason = (error as Error).message.replace(/\.+$/, "");
    console.warn(`[AI Revision Graceful Fallback]: ${reason}. Keeping the current diagram.`);
    return keepCurrentDiagram(revisionFailureNotice(error, chain));
  }
}
