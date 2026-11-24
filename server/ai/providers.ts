import { GRAPH_RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "./prompt";
import type { DiagramAuthor } from "./types";
import { combineWithTimeout, delay, throwIfAborted } from "./abort";

export type AiProviderName = "gemini" | "ollama";

export interface AiProviderInfo {
  name: AiProviderName;
  model: string;
  label: string;
}

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
// Newest Gemini flash tiers can 503 during demand spikes. When that happens the
// next model in the chain is tried instead of dropping straight to the local
// procedural engine. Override with GEMINI_FALLBACK_MODELS (comma separated).
const DEFAULT_GEMINI_FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-3.6-flash"];
const DEFAULT_OLLAMA_MODEL = "llama3.2";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

// ---------------------------------------------------------------------------
// Dynamic Model Discovery & Self-Healing Circuit Breaker
// ---------------------------------------------------------------------------

interface ModelHealth {
  cooldownUntil: number;
  retired?: boolean;
}

const modelHealth = new Map<string, ModelHealth>();
let cachedDiscoveredModels: string[] | null = null;
let lastDiscoveryTime = 0;
const DISCOVERY_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function recordModelFailure(model: string, status: number): void {
  const norm = model.toLowerCase();
  if (status === 404) {
    // Model is retired or does not exist for this API key: exclude for 24 hours
    modelHealth.set(norm, { cooldownUntil: Date.now() + 24 * 60 * 60 * 1000, retired: true });
    console.warn(`[AI Discovery]: Model ${model} returned HTTP 404 and was removed from rotation.`);
  } else if (status === 503 || status === 429) {
    // Transient demand spike: demote for 3 minutes (50ms in test)
    const cooldownMs = process.env.NODE_ENV === "test" ? 50 : 3 * 60 * 1000;
    modelHealth.set(norm, { cooldownUntil: Date.now() + cooldownMs });
    console.warn(
      `[AI Discovery]: Model ${model} temporarily demoted due to HTTP ${status} (cooldown: ${Math.round(cooldownMs / 1000)}s).`
    );
  }
}

export function recordModelSuccess(model: string): void {
  modelHealth.delete(model.toLowerCase());
}

export function isModelHealthy(model: string): boolean {
  const entry = modelHealth.get(model.toLowerCase());
  if (!entry) return true;
  if (entry.retired) return false;
  return Date.now() > entry.cooldownUntil;
}

export function clearModelHealth(): void {
  modelHealth.clear();
}

export function setCachedDiscoveredModels(models: string[] | null): void {
  cachedDiscoveredModels = models;
  lastDiscoveryTime = models ? Date.now() : 0;
}

export async function discoverGeminiModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  if (!apiKey || process.env.NODE_ENV === "test") {
    return cachedDiscoveredModels || [];
  }
  const now = Date.now();
  if (cachedDiscoveredModels && now - lastDiscoveryTime < DISCOVERY_TTL_MS) {
    return cachedDiscoveredModels;
  }
  try {
    const requestSignal = signal ? combineWithTimeout(8000, signal).signal : AbortSignal.timeout(8000);
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
      signal: requestSignal,
    });
    if (!res.ok) {
      return cachedDiscoveredModels || [];
    }
    const data = (await res.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    const candidates = (data.models || [])
      .filter((m) => {
        const methods = m.supportedGenerationMethods || [];
        const name = (m.name || "").replace(/^models\//, "");
        if (!methods.includes("generateContent")) return false;
        if (/tts|image|audio|robotics|computer-use|transcribe|embed/i.test(name)) return false;
        return true;
      })
      .map((m) => (m.name || "").replace(/^models\//, ""));

    const scored = candidates.map((name) => {
      let score = 0;
      if (/flash-lite/i.test(name)) score += 80;
      else if (/flash/i.test(name)) score += 90;
      else if (/pro/i.test(name)) score += 40;
      if (/latest/i.test(name)) score += 15;
      const verMatch = name.match(/(\d+(?:\.\d+)?)/);
      if (verMatch) score += parseFloat(verMatch[1]) * 5;
      return { name, score };
    });
    scored.sort((a, b) => b.score - a.score);

    cachedDiscoveredModels = scored.map((s) => s.name);
    lastDiscoveryTime = now;
    return cachedDiscoveredModels;
  } catch {
    return cachedDiscoveredModels || [];
  }
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Formats retry counts without producing strings like "1 attempts". */
export function attemptCountLabel(count: number): string {
  return `${count} attempt${count === 1 ? "" : "s"}`;
}

function ollamaInfo(): AiProviderInfo {
  const model = process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
  return { name: "ollama", model, label: "Ollama" };
}

function geminiInfo(model: string): AiProviderInfo {
  return { name: "gemini", model, label: prettyGeminiModel(model) };
}

function prettyGeminiModel(model: string): string {
  const cleaned = model.replace(/^gemini[-_]?/i, "");
  const words = cleaned
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return `Gemini ${words.join(" ")}`.trim();
}

/**
 * Which model backend should handle AI diagram requests.
 *
 * Selection order:
 * - `AI_PROVIDER=gemini`   -> Gemini when GEMINI_API_KEY is set, otherwise none.
 * - `AI_PROVIDER=ollama`   -> Ollama (local, no API key needed).
 * - `AI_PROVIDER=fallback` -> force the procedural engine (no model calls).
 * - unset / `auto`         -> Gemini when a key exists, else Ollama when
 *                             OLLAMA_MODEL / OLLAMA_BASE_URL is configured.
 */
export function resolveAiProvider(): AiProviderInfo | null {
  const requested = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const ollamaModel = process.env.OLLAMA_MODEL?.trim();
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim();

  if (requested === "none" || requested === "fallback" || requested === "off") {
    return null;
  }

  if (requested === "ollama") {
    return ollamaInfo();
  }

  if (requested === "gemini") {
    if (!geminiKey) return null;
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    return geminiInfo(model);
  }

  if (geminiKey) {
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    return geminiInfo(model);
  }

  if (ollamaModel || ollamaBaseUrl) {
    return ollamaInfo();
  }

  return null;
}

/** Gemini model chain: configured primary, fallbacks, and dynamically discovered models. */
export function geminiProviderChain(dynamicModels: string[] = []): AiProviderInfo[] {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const configured = process.env.GEMINI_FALLBACK_MODELS?.trim();
  const disabled = /^(none|off|-)$/i.test(configured || "");
  const fallbacks = disabled
    ? []
    : configured
      ? splitList(configured)
      : DEFAULT_GEMINI_FALLBACK_MODELS;

  const rawList = [primary, ...fallbacks, ...dynamicModels, ...(cachedDiscoveredModels || [])];
  const uniqueModels: string[] = [];
  for (const m of rawList) {
    if (m && !uniqueModels.includes(m)) {
      uniqueModels.push(m);
    }
  }

  // Filter out permanently retired models (HTTP 404)
  const activeModels = uniqueModels.filter((m) => {
    const health = modelHealth.get(m.toLowerCase());
    return !health?.retired;
  });

  // Partition into healthy models and currently cooling down models
  const healthy: string[] = [];
  const coolingDown: string[] = [];
  for (const m of activeModels) {
    if (isModelHealthy(m)) {
      healthy.push(m);
    } else {
      coolingDown.push(m);
    }
  }

  const ordered = [...healthy, ...coolingDown];
  return ordered.map(geminiInfo);
}

/**
 * Ollama as a last resort in `auto` mode. Enabled by default so a Gemini outage
 * still produces a real diagram instead of the procedural approximation. Set
 * AI_ALLOW_OLLAMA_FALLBACK=false to keep Gemini-only behaviour.
 */
export function ollamaFallbackEnabled(): boolean {
  return !/^(false|0|off|no)$/i.test((process.env.AI_ALLOW_OLLAMA_FALLBACK || "").trim());
}

/**
 * Ordered list of model backends to try for a single AI turn. The first entry is
 * the preferred engine; the rest are failover candidates. Empty when no model
 * backend is configured.
 *
 * - `AI_PROVIDER=gemini`   -> the Gemini chain only (operator asked for Gemini).
 * - `AI_PROVIDER=ollama`   -> Ollama only.
 * - `AI_PROVIDER=fallback` -> empty (procedural engine).
 * - unset / `auto`         -> Gemini chain, then Ollama (unless disabled).
 * - no Gemini key          -> Ollama when configured.
 */
export function resolveProviderChain(dynamicModels: string[] = []): AiProviderInfo[] {
  const requested = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const ollamaModel = process.env.OLLAMA_MODEL?.trim();
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim();

  if (requested === "none" || requested === "fallback" || requested === "off") {
    return [];
  }
  if (requested === "ollama") {
    return [ollamaInfo()];
  }
  if (requested === "gemini") {
    return geminiKey ? geminiProviderChain(dynamicModels) : [];
  }

  if (geminiKey) {
    const chain = geminiProviderChain(dynamicModels);
    if (ollamaFallbackEnabled()) chain.push(ollamaInfo());
    return chain;
  }

  if (ollamaModel || ollamaBaseUrl) {
    return [ollamaInfo()];
  }

  return [];
}

/** Asynchronously resolves the provider chain, discovering available models when an API key is present. */
export async function resolveProviderChainAsync(signal?: AbortSignal): Promise<AiProviderInfo[]> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const dynamicModels = geminiKey ? await discoverGeminiModels(geminiKey, signal) : [];
  return resolveProviderChain(dynamicModels);
}

export interface AiProviderSummary {
  provider: AiProviderName | "fallback";
  model: string;
  label: string;
}

/** Human-readable engine description for the client badge / config route. */
export function providerDisplayName(provider: AiProviderInfo): string {
  return provider.name === "ollama"
    ? `Ollama · ${provider.model}`
    : prettyGeminiModel(provider.model);
}

export function summarizeProvider(provider: AiProviderInfo | null): AiProviderSummary {
  if (!provider) {
    return {
      provider: "fallback",
      model: "procedural",
      label: "Local fallback engine",
    };
  }
  return {
    provider: provider.name,
    model: provider.model,
    label: providerDisplayName(provider),
  };
}

export function getProviderSummary(): AiProviderSummary {
  return summarizeProvider(resolveAiProvider());
}

// ---------------------------------------------------------------------------
// Author metadata for generated elements
// ---------------------------------------------------------------------------

/**
 * Default creator stamped onto AI-generated elements when the request is not
 * tied to a signed-in user. Keeps the board's presence label honest about
 * which engine actually drew the diagram.
 */
export function defaultDiagramAuthor(provider: AiProviderInfo | null): DiagramAuthor {
  if (provider?.name === "ollama") {
    return { id: "ai_ollama", name: `Ollama (${provider.model})` };
  }
  if (provider?.name === "gemini") {
    return { id: "ai_gemini", name: "Gemini AI" };
  }
  return { id: "ai_local", name: "Local diagram engine" };
}

// ---------------------------------------------------------------------------
// Shared JSON extraction
// ---------------------------------------------------------------------------

export function extractJson(text: string): unknown {
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
    throw new Error("The AI model returned a response that was not valid JSON.");
  }
}

// ---------------------------------------------------------------------------
// Gemini caller
// ---------------------------------------------------------------------------

function getRetryDelayMs(response: Response, attempt: number): number {
  if (process.env.NODE_ENV === "test") {
    return 5;
  }
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

async function callGemini(
  apiKey: string,
  model: string,
  userMessage: string,
  temperature: number,
  maxRetries = 3,
  timeoutMs = 45_000,
  signal?: AbortSignal
): Promise<unknown> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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
    throwIfAborted(signal);
    const requestSignal = combineWithTimeout(timeoutMs, signal);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: requestSignal.signal,
      });
      throwIfAborted(signal);

      if (response.status === 429 || response.status === 503) {
        recordModelFailure(model, response.status);
        if (attempt === maxRetries) {
          const reason = response.status === 429 ? "rate limit" : "service unavailable";
          throw new Error(
            `Gemini ${reason} after ${attemptCountLabel(maxRetries)} (HTTP ${response.status}).`
          );
        }
        const delayMs = getRetryDelayMs(response, attempt);
        console.warn(
          `[AI Retry]: HTTP ${response.status}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
        );
        await response.body?.cancel().catch(() => {});
        await delay(delayMs, signal);
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string };
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!response.ok || !text) {
        recordModelFailure(model, response.status);
        const message =
          data.error?.message || response.statusText || "Failed to generate a diagram from Gemini";
        const error = new Error(`Gemini API Error: ${message}`) as Error & { fatal?: boolean };
        if (response.status >= 400 && response.status < 500) error.fatal = true;
        throw error;
      }

      recordModelSuccess(model);
      return extractJson(text);
    } catch (err: unknown) {
      throwIfAborted(signal);
      const error = err as Error & { fatal?: boolean };
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        const timeoutError = new Error(
          `Gemini ${model} did not respond within ${Math.round(timeoutMs / 1000)}s.`
        ) as Error & { fatal?: boolean };
        if (attempt === maxRetries) throw timeoutError;
        console.warn(
          `[AI Retry]: ${timeoutError.message} Retrying (attempt ${attempt + 1}/${maxRetries})...`
        );
        continue;
      }
      if (attempt === maxRetries || error.fatal) throw error;
      const delayMs = process.env.NODE_ENV === "test"
        ? 5
        : Math.min(1500 * attempt, 5000) + Math.floor(Math.random() * 500);
      console.warn(
        `[AI Retry]: ${error.message}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await delay(delayMs, signal);
    } finally {
      requestSignal.dispose();
    }
  }

  throw new Error("Gemini API call failed after multiple retry attempts");
}

// ---------------------------------------------------------------------------
// Ollama caller (local, OpenAI-free JSON-schema constrained output)
// ---------------------------------------------------------------------------

// Ollama's `format` field expects standard JSON Schema (lowercase types), while
// Gemini's `responseSchema` uses its own uppercase dialect. Convert the shared
// schema so both backends stay in sync from a single definition.
function toStandardJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toStandardJsonSchema);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    // Gemini-only layout hint that Ollama's grammar converter rejects.
    if (key === "propertyOrdering") continue;
    if (key === "type" && typeof entry === "string") {
      result.type = entry.toLowerCase();
      continue;
    }
    result[key] = toStandardJsonSchema(entry);
  }
  return result;
}

const OLLAMA_RESPONSE_SCHEMA = toStandardJsonSchema(GRAPH_RESPONSE_SCHEMA);

function numberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
}

async function callOllama(
  model: string,
  userMessage: string,
  temperature: number,
  maxRetries = 3,
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<unknown> {
  const endpoint = `${ollamaBaseUrl()}/api/chat`;
  const effectiveTimeoutMs = timeoutMs ?? numberFromEnv("OLLAMA_TIMEOUT_MS", 180_000, 10_000, 900_000);
  const numCtx = numberFromEnv("OLLAMA_NUM_CTX", 12_288, 2048, 65_536);
  const numPredict = numberFromEnv("OLLAMA_NUM_PREDICT", 6_144, 512, 32_768);

  const apiKey = process.env.OLLAMA_API_KEY?.trim();

  const requestBody = {
    model,
    stream: false,
    format: OLLAMA_RESPONSE_SCHEMA,
    keep_alive: process.env.OLLAMA_KEEP_ALIVE?.trim() || "10m",
    options: {
      temperature,
      num_ctx: numCtx,
      num_predict: numPredict,
    },
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: userMessage },
    ],
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal);
    const requestSignal = combineWithTimeout(effectiveTimeoutMs, signal);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(requestBody),
        signal: requestSignal.signal,
      });
      throwIfAborted(signal);

      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        if (attempt === maxRetries) {
          const detail = (await response.text().catch(() => "")).slice(0, 300);
          const reason = response.status === 429 ? "rate limit" : "server error";
          throw new Error(
            `Ollama ${reason} after ${attemptCountLabel(maxRetries)} (HTTP ${response.status}${detail ? `: ${detail}` : ""}).`
          );
        }
        const delayMs = getRetryDelayMs(response, attempt);
        console.warn(
          `[AI Retry]: Ollama HTTP ${response.status}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
        );
        await response.body?.cancel().catch(() => {});
        await delay(delayMs, signal);
        continue;
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        const error = new Error(
          `Ollama request failed (HTTP ${response.status}${detail ? `: ${detail}` : ""}).`
        ) as Error & { fatal?: boolean };
        // 400/404 usually mean the model name is wrong, so retrying is pointless.
        if (response.status === 400 || response.status === 404) error.fatal = true;
        throw error;
      }

      const data = (await response.json()) as {
        message?: { content?: string };
        response?: string;
        done_reason?: string;
        error?: string;
      };

      if (data.error) {
        throw new Error(`Ollama error: ${data.error}`);
      }

      const text = data.message?.content || data.response;
      if (!text) {
        throw new Error("Ollama returned an empty response.");
      }

      try {
        return extractJson(text);
      } catch (parseError: unknown) {
        if (data.done_reason === "length") {
          throw new Error(
            `Ollama hit the ${numPredict}-token output limit before finishing the diagram. ` +
              'Raise OLLAMA_NUM_PREDICT and OLLAMA_NUM_CTX, or use the "standard" detail level.'
          );
        }
        throw parseError;
      }
    } catch (err: unknown) {
      throwIfAborted(signal);
      const error = err as Error & { fatal?: boolean };

      if (error.name === "TimeoutError" || error.name === "AbortError") {
        if (attempt === maxRetries) {
          throw new Error(
            `Ollama did not respond within ${Math.round(effectiveTimeoutMs / 1000)}s while running "${model}". ` +
              "The model may still be loading — try again, or raise OLLAMA_TIMEOUT_MS."
          );
        }
        console.warn(
          `[AI Retry]: Ollama "${model}" timed out after ${Math.round(effectiveTimeoutMs / 1000)}s. Retrying (attempt ${attempt + 1}/${maxRetries})...`
        );
        continue;
      }

      if (
        !error.fatal &&
        (error.message.includes("fetch failed") ||
          error.message.includes("ECONNREFUSED") ||
          error.message.includes("connect"))
      ) {
        throw new Error(
          `Could not reach Ollama at ${ollamaBaseUrl()}. Start it with "ollama serve" and confirm the model is pulled with "ollama pull ${model}".`
        );
      }

      if (attempt === maxRetries || error.fatal) throw error;

      const delayMs = process.env.NODE_ENV === "test"
        ? 5
        : Math.min(1500 * attempt, 5000) + Math.floor(Math.random() * 500);
      console.warn(
        `[AI Retry]: ${error.message}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await delay(delayMs, signal);
    } finally {
      requestSignal.dispose();
    }
  }

  throw new Error("Ollama API call failed after multiple retry attempts");
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

export interface AiCallOptions {
  /** How many times to retry transient failures against this model. */
  maxRetries?: number;
  /** Per-attempt timeout for model requests. */
  timeoutMs?: number;
  /** Client disconnect signal; cancels in-flight provider work. */
  signal?: AbortSignal;
}

export async function callAiModel(
  provider: AiProviderInfo,
  userMessage: string,
  temperature: number,
  options: AiCallOptions = {}
): Promise<unknown> {
  throwIfAborted(options.signal);
  if (provider.name === "ollama") {
    return callOllama(
      provider.model,
      userMessage,
      temperature,
      Math.max(1, options.maxRetries ?? 3),
      options.timeoutMs,
      options.signal
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return callGemini(
    apiKey,
    provider.model,
    userMessage,
    temperature,
    Math.max(1, options.maxRetries ?? 3),
    options.timeoutMs ?? numberFromEnv("GEMINI_TIMEOUT_MS", 45_000, 10_000, 180_000),
    options.signal
  );
}
