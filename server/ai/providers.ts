import { GRAPH_RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "./prompt";
import type { DiagramAuthor } from "./types";

export type AiProviderName = "gemini" | "ollama";

export interface AiProviderInfo {
  name: AiProviderName;
  model: string;
  label: string;
}

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const DEFAULT_OLLAMA_MODEL = "llama3.2";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

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
    return {
      name: "ollama",
      model: ollamaModel || DEFAULT_OLLAMA_MODEL,
      label: "Ollama",
    };
  }

  if (requested === "gemini") {
    if (!geminiKey) return null;
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    return { name: "gemini", model, label: prettyGeminiModel(model) };
  }

  if (geminiKey) {
    const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
    return { name: "gemini", model, label: prettyGeminiModel(model) };
  }

  if (ollamaModel || ollamaBaseUrl) {
    return {
      name: "ollama",
      model: ollamaModel || DEFAULT_OLLAMA_MODEL,
      label: "Ollama",
    };
  }

  return null;
}

export interface AiProviderSummary {
  provider: AiProviderName | "fallback";
  model: string;
  label: string;
}

/** Human-readable engine description for the client badge / config route. */
export function getProviderSummary(): AiProviderSummary {
  const provider = resolveAiProvider();
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
    label:
      provider.name === "ollama"
        ? `Ollama · ${provider.model}`
        : prettyGeminiModel(provider.model),
  };
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
  maxRetries = 3
): Promise<unknown> {
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
  temperature: number
): Promise<unknown> {
  const endpoint = `${ollamaBaseUrl()}/api/chat`;
  const timeoutMs = numberFromEnv("OLLAMA_TIMEOUT_MS", 180_000, 10_000, 900_000);
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

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });

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
    const error = err as Error & { fatal?: boolean };

    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error(
        `Ollama did not respond within ${Math.round(timeoutMs / 1000)}s while running "${model}". ` +
          "The model may still be loading — try again, or raise OLLAMA_TIMEOUT_MS."
      );
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

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Public dispatch
// ---------------------------------------------------------------------------

export async function callAiModel(
  provider: AiProviderInfo,
  userMessage: string,
  temperature: number
): Promise<unknown> {
  if (provider.name === "ollama") {
    return callOllama(provider.model, userMessage, temperature);
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return callGemini(apiKey, provider.model, userMessage, temperature);
}
