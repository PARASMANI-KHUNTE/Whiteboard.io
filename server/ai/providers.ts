import { GRAPH_RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from "./prompt";
import type { DiagramAuthor } from "./types";
import { combineWithTimeout, delay, throwIfAborted } from "./abort";

export type OpenAiCompatibleProviderName = "groq" | "nvidia" | "openrouter" | "deepseek";
export type AiProviderName = "gemini" | OpenAiCompatibleProviderName | "ollama";
export type AiProviderSelection = AiProviderName | "auto" | "fallback";

export interface AiProviderInfo {
  name: AiProviderName;
  model: string;
  label: string;
}

export interface AvailableAiProviderOption {
  id: AiProviderName | "fallback";
  label: string;
  model: string;
  models: string[];
  configured: boolean;
  local: boolean;
}

interface OpenAiProviderSpec {
  name: OpenAiCompatibleProviderName;
  displayName: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  modelEnv: string;
  fallbackModelsEnv: string;
  timeoutEnv: string;
  defaultBaseUrl: string;
  defaultModel: string;
  defaultFallbacks: string[];
  prioritizeFreeDiscovery?: boolean;
}

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
// Newest Gemini flash tiers can 503 during demand spikes. When that happens the
// next model in the chain is tried instead of dropping straight to fallback.
const DEFAULT_GEMINI_FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-3.6-flash"];
const DEFAULT_OLLAMA_MODEL = "llama3.2";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

const OPENAI_PROVIDER_SPECS: readonly OpenAiProviderSpec[] = [
  {
    name: "groq",
    displayName: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    baseUrlEnv: "GROQ_BASE_URL",
    modelEnv: "GROQ_MODEL",
    fallbackModelsEnv: "GROQ_FALLBACK_MODELS",
    timeoutEnv: "GROQ_TIMEOUT_MS",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "qwen/qwen3.8-27b",
    defaultFallbacks: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  },
  {
    name: "nvidia",
    displayName: "NVIDIA NIM",
    apiKeyEnv: "NVIDIA_API_KEY",
    baseUrlEnv: "NVIDIA_BASE_URL",
    modelEnv: "NVIDIA_MODEL",
    fallbackModelsEnv: "NVIDIA_FALLBACK_MODELS",
    timeoutEnv: "NVIDIA_TIMEOUT_MS",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "minimaxai/minimax-m3.1-flash",
    defaultFallbacks: [
      "nvidia/nemotron-3.5-lightning-30b-a3b",
      "z-ai/glm-5.3-flash",
      "mistralai/mistral-large-4-1t-a52b",
    ],
  },
  {
    name: "openrouter",
    displayName: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    modelEnv: "OPENROUTER_MODEL",
    fallbackModelsEnv: "OPENROUTER_FALLBACK_MODELS",
    timeoutEnv: "OPENROUTER_TIMEOUT_MS",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "baidu/ernie-5.5-flash-preview:free",
    defaultFallbacks: [
      "inclusionai/ling-3.2-flash:free",
      "nvidia/nemotron-3.5-lightning:free",
      "google/gemma-4-26b-a4b-it:free",
    ],
    prioritizeFreeDiscovery: true,
  },
  {
    name: "deepseek",
    displayName: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    modelEnv: "DEEPSEEK_MODEL",
    fallbackModelsEnv: "DEEPSEEK_FALLBACK_MODELS",
    timeoutEnv: "DEEPSEEK_TIMEOUT_MS",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-flash",
    defaultFallbacks: ["deepseek-v4-pro"],
  },
];

const OPENAI_SPEC_BY_NAME = new Map<AiProviderName, OpenAiProviderSpec>(
  OPENAI_PROVIDER_SPECS.map((spec) => [spec.name, spec])
);

const VALID_PROVIDER_SELECTIONS = new Set<string>([
  "auto",
  "fallback",
  "gemini",
  "ollama",
  "groq",
  "nvidia",
  "openrouter",
  "deepseek",
]);

export function coerceProviderSelection(value: unknown): AiProviderSelection | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === "none" || trimmed === "off") return "fallback";
  if (VALID_PROVIDER_SELECTIONS.has(trimmed)) {
    return trimmed as AiProviderSelection;
  }
  return undefined;
}

export function sanitizeModelName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) return undefined;
  if (!/^[a-zA-Z0-9._:/-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

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

const cachedOpenAiModels = new Map<OpenAiCompatibleProviderName, string[]>();
const lastOpenAiDiscoveryTime = new Map<OpenAiCompatibleProviderName, number>();

export function recordModelFailure(model: string, status: number): void {
  const norm = model.toLowerCase();
  if (status === 404) {
    // Model is retired or does not exist for this API key: exclude for 24 hours
    modelHealth.set(norm, { cooldownUntil: Date.now() + 24 * 60 * 60 * 1000, retired: true });
    console.warn(`[AI Discovery]: Model ${model} returned HTTP 404 and was removed from rotation.`);
  } else if (status === 401 || status === 402 || status === 403) {
    // Insufficient balance or unauthorized key: demote below healthy backends
    const cooldownMs = process.env.NODE_ENV === "test" ? 50 : 15 * 60 * 1000;
    modelHealth.set(norm, { cooldownUntil: Date.now() + cooldownMs });
    console.warn(
      `[AI Discovery]: Model ${model} demoted due to HTTP ${status} (cooldown: ${Math.round(cooldownMs / 1000)}s).`
    );
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

let cachedOllamaModels: string[] | null = null;
let lastOllamaDiscoveryTime = 0;
const OLLAMA_DISCOVERY_TTL_MS = 60 * 1000;

export function setCachedOllamaModels(models: string[] | null): void {
  cachedOllamaModels = models;
  lastOllamaDiscoveryTime = models ? Date.now() : 0;
}

export function setCachedOpenAiModels(
  provider: OpenAiCompatibleProviderName,
  models: string[] | null
): void {
  if (models) {
    cachedOpenAiModels.set(provider, models);
    lastOpenAiDiscoveryTime.set(provider, Date.now());
  } else {
    cachedOpenAiModels.delete(provider);
    lastOpenAiDiscoveryTime.delete(provider);
  }
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

export async function discoverOllamaModels(signal?: AbortSignal): Promise<string[]> {
  if (process.env.NODE_ENV === "test") {
    return cachedOllamaModels || [];
  }
  const now = Date.now();
  if (cachedOllamaModels && now - lastOllamaDiscoveryTime < OLLAMA_DISCOVERY_TTL_MS) {
    return cachedOllamaModels;
  }
  try {
    const apiKey = process.env.OLLAMA_API_KEY?.trim();
    const requestSignal = signal ? combineWithTimeout(2000, signal).signal : AbortSignal.timeout(2000);
    const res = await fetch(`${ollamaBaseUrl()}/api/tags`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: requestSignal,
    });
    if (!res.ok) {
      return cachedOllamaModels || [];
    }
    const data = (await res.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    const candidates = (data.models || [])
      .map((m) => (m.name || m.model || "").trim())
      .filter((name) => Boolean(name) && !/embed|nomic-embed|bge-|mxbai|rerank|whisper/i.test(name));

    const scored = candidates.map((name) => {
      let score = 0;
      if (/llama3\.2/i.test(name)) score += 90;
      else if (/qwen/i.test(name)) score += 85;
      else if (/llama3/i.test(name)) score += 80;
      else if (/gemma/i.test(name)) score += 70;
      else if (/mistral|deepseek|phi/i.test(name)) score += 60;
      return { name, score };
    });
    scored.sort((a, b) => b.score - a.score);

    cachedOllamaModels = scored.map((s) => s.name);
    lastOllamaDiscoveryTime = now;
    return cachedOllamaModels;
  } catch {
    return cachedOllamaModels || [];
  }
}

const EXCLUDED_OPENAI_MODEL_PATTERN =
  /embed|whisper|guard|tts|audio|orpheus|safeguard|pii|video-detector|rerank|clip|cosmos|ising|translate|vision|vl(?:-|$)/i;

function providerBaseUrl(spec: OpenAiProviderSpec): string {
  return (process.env[spec.baseUrlEnv]?.trim() || spec.defaultBaseUrl).replace(/\/+$/, "");
}

function providerApiKey(spec: OpenAiProviderSpec): string | undefined {
  const key = process.env[spec.apiKeyEnv]?.trim();
  return key || undefined;
}

export async function discoverOpenAiModels(
  providerName: OpenAiCompatibleProviderName,
  signal?: AbortSignal
): Promise<string[]> {
  const spec = OPENAI_SPEC_BY_NAME.get(providerName) as OpenAiProviderSpec | undefined;
  if (!spec) return [];

  const cached = cachedOpenAiModels.get(providerName) || [];
  const apiKey = providerApiKey(spec);
  if (!apiKey || process.env.NODE_ENV === "test") {
    return cached;
  }

  const now = Date.now();
  const lastAt = lastOpenAiDiscoveryTime.get(providerName) || 0;
  if (cached.length > 0 && now - lastAt < DISCOVERY_TTL_MS) {
    return cached;
  }

  try {
    const requestSignal = signal ? combineWithTimeout(4000, signal).signal : AbortSignal.timeout(4000);
    const res = await fetch(`${providerBaseUrl(spec)}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(spec.name === "openrouter"
          ? {
              "HTTP-Referer": process.env.APP_URL?.trim() || "http://localhost:5173",
              "X-Title": "Whiteboard.io",
            }
          : {}),
      },
      signal: requestSignal,
    });
    if (!res.ok) {
      return cached;
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const candidates = (data.data || [])
      .map((m) => (m.id || "").trim())
      .filter((id) => Boolean(id) && !EXCLUDED_OPENAI_MODEL_PATTERN.test(id));

    const filtered = spec.prioritizeFreeDiscovery
      ? candidates.filter((id) => id.endsWith(":free"))
      : candidates;

    const scored = (filtered.length > 0 ? filtered : candidates).map((id) => {
      let score = 0;
      if (id.endsWith(":free")) score += 60;
      if (/flash|lightning|mini|bolt/i.test(id)) score += 30;
      if (/qwen|deepseek|nemotron|gpt-oss|ernie|mistral|llama/i.test(id)) score += 20;
      return { id, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const limited = scored.slice(0, 12).map((s) => s.id);
    cachedOpenAiModels.set(providerName, limited);
    lastOpenAiDiscoveryTime.set(providerName, now);
    return limited;
  } catch {
    return cached;
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

function ollamaInfo(model?: string): AiProviderInfo {
  const chosen = (model || process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL).trim();
  return { name: "ollama", model: chosen, label: "Ollama" };
}

function geminiInfo(model: string): AiProviderInfo {
  return { name: "gemini", model, label: prettyGeminiModel(model) };
}

function openAiInfo(spec: OpenAiProviderSpec, model: string): AiProviderInfo {
  return { name: spec.name, model, label: spec.displayName };
}

function prettyGeminiModel(model: string): string {
  const cleaned = model.replace(/^gemini[-_]?/i, "");
  const words = cleaned
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return `Gemini ${words.join(" ")}`.trim();
}

function partitionHealthyModels(models: string[]): string[] {
  const unique: string[] = [];
  for (const m of models) {
    if (m && !unique.includes(m)) unique.push(m);
  }

  const active = unique.filter((m) => !modelHealth.get(m.toLowerCase())?.retired);
  const healthy: string[] = [];
  const coolingDown: string[] = [];
  for (const m of active) {
    if (isModelHealthy(m)) {
      healthy.push(m);
    } else {
      coolingDown.push(m);
    }
  }
  return [...healthy, ...coolingDown];
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

  const ordered = partitionHealthyModels([
    primary,
    ...fallbacks,
    ...dynamicModels,
    ...(cachedDiscoveredModels || []),
  ]);
  return ordered.map(geminiInfo);
}

/** Local Ollama model chain: prioritizes installed matching models, then configured fallbacks. */
export function ollamaProviderChain(dynamicOllamaModels: string[] = []): AiProviderInfo[] {
  const configuredPrimary = process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
  const configuredFallbacks = splitList(process.env.OLLAMA_FALLBACK_MODELS);
  const discovered = [...dynamicOllamaModels, ...(cachedOllamaModels || [])];

  const resolveMatchingTag = (candidate: string): string | undefined => {
    const norm = candidate.toLowerCase();
    return discovered.find(
      (installed) =>
        installed.toLowerCase() === norm ||
        installed.toLowerCase() === `${norm}:latest`
    );
  };

  let rawList: string[];
  if (discovered.length > 0) {
    const matchedPrimary = resolveMatchingTag(configuredPrimary);
    const matchedFallbacks = configuredFallbacks
      .map(resolveMatchingTag)
      .filter((entry): entry is string => Boolean(entry));
    rawList = [
      ...(matchedPrimary ? [matchedPrimary] : []),
      ...matchedFallbacks,
      ...discovered,
    ];
  } else {
    rawList = [configuredPrimary, ...configuredFallbacks];
  }

  const ordered = partitionHealthyModels(rawList);
  return ordered.map(ollamaInfo);
}

/** OpenAI-compatible provider model chain (Groq, NVIDIA NIM, OpenRouter, DeepSeek). */
export function openAiProviderChain(
  providerName: OpenAiCompatibleProviderName,
  dynamicModels: string[] = []
): AiProviderInfo[] {
  const spec = OPENAI_SPEC_BY_NAME.get(providerName) as OpenAiProviderSpec | undefined;
  if (!spec || !providerApiKey(spec)) return [];

  const primary = process.env[spec.modelEnv]?.trim() || spec.defaultModel;
  const configured = process.env[spec.fallbackModelsEnv]?.trim();
  const disabled = /^(none|off|-)$/i.test(configured || "");
  const fallbacks = disabled
    ? []
    : configured
      ? splitList(configured)
      : spec.defaultFallbacks;

  const discovered = [...dynamicModels, ...(cachedOpenAiModels.get(providerName) || [])];
  const baseCandidates =
    discovered.length > 0 && !configured
      ? [
          ...(discovered.includes(primary) ? [primary] : []),
          ...fallbacks.filter((m) => discovered.includes(m)),
          ...(discovered.length === 0 ? [primary, ...fallbacks] : []),
          ...discovered,
        ]
      : [primary, ...fallbacks, ...discovered];

  // Guarantee primary stays first unless retired when discovery returned empty/subset
  const withPrimary = [primary, ...fallbacks, ...baseCandidates];
  const ordered = partitionHealthyModels(withPrimary);
  return ordered.map((model) => openAiInfo(spec, model));
}

/**
 * Ollama as local failover whenever cloud models are unavailable or fail.
 * Enabled by default so outages degrade cleanly to a local LLM instead of the
 * procedural engine. Set AI_ALLOW_OLLAMA_FALLBACK=false to disable.
 */
export function ollamaFallbackEnabled(): boolean {
  return !/^(false|0|off|no)$/i.test((process.env.AI_ALLOW_OLLAMA_FALLBACK || "").trim());
}

export interface ResolveChainOptions {
  preferredProvider?: AiProviderSelection;
  preferredModel?: string;
  discoveredByProvider?: Partial<Record<OpenAiCompatibleProviderName, string[]>>;
}

function buildRemoteChainForProvider(
  name: Exclude<AiProviderName, "ollama">,
  dynamicGeminiModels: string[],
  discoveredByProvider: Partial<Record<OpenAiCompatibleProviderName, string[]>>
): AiProviderInfo[] {
  if (name === "gemini") {
    return process.env.GEMINI_API_KEY?.trim()
      ? geminiProviderChain(dynamicGeminiModels)
      : [];
  }
  return openAiProviderChain(name, discoveredByProvider[name] || []);
}

/**
 * Which model backend should handle AI diagram requests by default.
 */
export function resolveAiProvider(): AiProviderInfo | null {
  const chain = resolveProviderChain();
  return chain[0] ?? null;
}

/**
 * Ordered list of model backends to try for a single AI turn. The first entry is
 * the preferred engine; the rest are failover candidates. Empty when no model
 * backend is configured or offline fallback is explicitly selected.
 */
export function resolveProviderChain(
  dynamicModels: string[] = [],
  dynamicOllamaModels: string[] = [],
  options: ResolveChainOptions = {}
): AiProviderInfo[] {
  const envRequested = coerceProviderSelection(process.env.AI_PROVIDER);
  const requested = options.preferredProvider ?? envRequested ?? "auto";
  const preferredModel = sanitizeModelName(options.preferredModel);
  const discoveredByProvider = options.discoveredByProvider ?? {};

  if (requested === "fallback") {
    return [];
  }

  if (requested === "ollama") {
    const chain = ollamaProviderChain(dynamicOllamaModels);
    if (preferredModel) {
      return [
        ollamaInfo(preferredModel),
        ...chain.filter((p) => p.model !== preferredModel),
      ];
    }
    return chain;
  }

  const allCloudOrder: Array<Exclude<AiProviderName, "ollama">> = [
    "gemini",
    "groq",
    "nvidia",
    "openrouter",
    "deepseek",
  ];

  let orderedProviders: Array<Exclude<AiProviderName, "ollama">>;
  if (requested !== "auto") {
    orderedProviders = [requested, ...allCloudOrder.filter((p) => p !== requested)];
  } else {
    orderedProviders = allCloudOrder;
  }

  const chain: AiProviderInfo[] = [];
  for (const name of orderedProviders) {
    const providerChain = buildRemoteChainForProvider(name, dynamicModels, discoveredByProvider);
    if (name === requested && preferredModel) {
      const hasModel = providerChain.some((entry) => entry.model === preferredModel);
      const spec = OPENAI_SPEC_BY_NAME.get(name);
      const customEntry: AiProviderInfo | null =
        name === "gemini" && process.env.GEMINI_API_KEY?.trim()
          ? geminiInfo(preferredModel)
          : spec && providerApiKey(spec)
            ? openAiInfo(spec, preferredModel)
            : null;
      if (customEntry) {
        chain.push(
          customEntry,
          ...(hasModel
            ? providerChain.filter((entry) => entry.model !== preferredModel)
            : providerChain)
        );
        continue;
      }
    }
    chain.push(...providerChain);
  }

  if (
    ollamaFallbackEnabled() ||
    (requested === "auto" &&
      chain.length === 0 &&
      (Boolean(process.env.OLLAMA_MODEL?.trim()) || Boolean(process.env.OLLAMA_BASE_URL?.trim())))
  ) {
    chain.push(...ollamaProviderChain(dynamicOllamaModels));
  }

  return chain;
}

/** Asynchronously resolves the provider chain, discovering models on configured providers. */
export async function resolveProviderChainAsync(
  signal?: AbortSignal,
  options: ResolveChainOptions = {}
): Promise<AiProviderInfo[]> {
  const envRequested = coerceProviderSelection(process.env.AI_PROVIDER);
  const requested = options.preferredProvider ?? envRequested ?? "auto";
  if (requested === "fallback") {
    return [];
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const shouldDiscoverGemini = Boolean(geminiKey && requested !== "ollama");
  const shouldDiscoverOllama =
    requested === "ollama" || ollamaFallbackEnabled() || !geminiKey;

  const configuredOpenAi = OPENAI_PROVIDER_SPECS.filter((spec) => Boolean(providerApiKey(spec)));

  const [dynamicGeminiModels, dynamicOllamaModels, ...openAiLists] = await Promise.all([
    shouldDiscoverGemini && geminiKey ? discoverGeminiModels(geminiKey, signal) : Promise.resolve([]),
    shouldDiscoverOllama ? discoverOllamaModels(signal) : Promise.resolve([]),
    ...configuredOpenAi.map((spec) => discoverOpenAiModels(spec.name, signal)),
  ]);

  const discoveredByProvider: Partial<Record<OpenAiCompatibleProviderName, string[]>> = {};
  configuredOpenAi.forEach((spec, idx) => {
    discoveredByProvider[spec.name] = openAiLists[idx] || [];
  });

  return resolveProviderChain(dynamicGeminiModels, dynamicOllamaModels, {
    ...options,
    discoveredByProvider,
  });
}

export interface AiProviderSummary {
  provider: AiProviderName | "fallback";
  model: string;
  label: string;
}

/** Human-readable engine description for client badges and config route. */
export function providerDisplayName(provider: AiProviderInfo): string {
  if (provider.name === "gemini") {
    return prettyGeminiModel(provider.model);
  }
  const spec = OPENAI_SPEC_BY_NAME.get(provider.name);
  if (spec) {
    return `${spec.displayName} · ${provider.model}`;
  }
  return `Ollama · ${provider.model}`;
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

/** Non-secret inventory of supported AI backends and their available models for UI switching. */
export function getAvailableAiProviders(
  discoveredByProvider: Partial<Record<AiProviderName, string[]>> = {}
): AvailableAiProviderOption[] {
  const options: AvailableAiProviderOption[] = [];

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const geminiChain = geminiProviderChain(discoveredByProvider.gemini || []);
  const geminiModels = [...new Set(geminiChain.map((entry) => entry.model))].slice(0, 8);
  options.push({
    id: "gemini",
    label: "Google Gemini",
    model: geminiModels[0] || DEFAULT_GEMINI_MODEL,
    models: geminiModels,
    configured: geminiConfigured,
    local: false,
  });

  for (const spec of OPENAI_PROVIDER_SPECS) {
    const configured = Boolean(providerApiKey(spec));
    const discovered = (discoveredByProvider[spec.name] || []).slice(0, 8);
    const configuredChain = configured
      ? openAiProviderChain(spec.name, discovered)
      : [];
    const fallbackList = [
      process.env[spec.modelEnv]?.trim() || spec.defaultModel,
      ...spec.defaultFallbacks,
    ];
    const models = [
      ...new Set([
        ...configuredChain.map((entry) => entry.model),
        ...fallbackList,
        ...discovered,
      ]),
    ].slice(0, 8);

    options.push({
      id: spec.name,
      label: spec.displayName,
      model: models[0] || spec.defaultModel,
      models,
      configured,
      local: false,
    });
  }

  const ollamaChain = ollamaProviderChain(discoveredByProvider.ollama || []);
  const ollamaModels = [...new Set(ollamaChain.map((entry) => entry.model))].slice(0, 8);
  options.push({
    id: "ollama",
    label: "Ollama (Local)",
    model: ollamaModels[0] || DEFAULT_OLLAMA_MODEL,
    models: ollamaModels,
    configured: ollamaFallbackEnabled() || Boolean(process.env.OLLAMA_MODEL?.trim() || process.env.OLLAMA_BASE_URL?.trim()),
    local: true,
  });

  return options;
}

export async function getAvailableAiProvidersAsync(
  signal?: AbortSignal
): Promise<AvailableAiProviderOption[]> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const configuredOpenAi = OPENAI_PROVIDER_SPECS.filter((spec) => Boolean(providerApiKey(spec)));

  const [geminiModels, ollamaModels, ...openAiLists] = await Promise.all([
    geminiKey ? discoverGeminiModels(geminiKey, signal) : Promise.resolve([]),
    discoverOllamaModels(signal),
    ...configuredOpenAi.map((spec) => discoverOpenAiModels(spec.name, signal)),
  ]);

  const discovered: Partial<Record<AiProviderName, string[]>> = {
    gemini: geminiModels,
    ollama: ollamaModels,
  };
  configuredOpenAi.forEach((spec, idx) => {
    discovered[spec.name] = openAiLists[idx] || [];
  });

  return getAvailableAiProviders(discovered);
}

// ---------------------------------------------------------------------------
// Author metadata for generated elements
// ---------------------------------------------------------------------------

export function defaultDiagramAuthor(provider: AiProviderInfo | null): DiagramAuthor {
  if (!provider) {
    return { id: "ai_local", name: "Local diagram engine" };
  }
  if (provider.name === "gemini") {
    return { id: "ai_gemini", name: "Gemini AI" };
  }
  if (provider.name === "ollama") {
    return { id: "ai_ollama", name: `Ollama (${provider.model})` };
  }
  const spec = OPENAI_SPEC_BY_NAME.get(provider.name);
  const display = spec?.displayName || provider.label;
  return { id: `ai_${provider.name}`, name: `${display} (${provider.model})` };
}

// ---------------------------------------------------------------------------
// Shared JSON extraction
// ---------------------------------------------------------------------------

export function extractJson(text: string): unknown {
  // Reasoning models may wrap scratchpad thoughts inside <think>...</think> blocks.
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const trimmed = (withoutThinking || text).trim();
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
// Retry & HTTP helpers
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

function numberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Gemini caller
// ---------------------------------------------------------------------------

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
// OpenAI-compatible caller (Groq, NVIDIA NIM, OpenRouter, DeepSeek)
// ---------------------------------------------------------------------------

async function callOpenAiCompatible(
  spec: OpenAiProviderSpec,
  apiKey: string,
  model: string,
  userMessage: string,
  temperature: number,
  maxRetries = 3,
  timeoutMs = 45_000,
  signal?: AbortSignal
): Promise<unknown> {
  const endpoint = `${providerBaseUrl(spec)}/chat/completions`;
  let useJsonObjectMode = true;

  const makeRequestBody = () => ({
    model,
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      { role: "user", content: userMessage },
    ],
    temperature,
    max_tokens: 8192,
    ...(useJsonObjectMode ? { response_format: { type: "json_object" } } : {}),
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(spec.name === "openrouter"
      ? {
          "HTTP-Referer": process.env.APP_URL?.trim() || "http://localhost:5173",
          "X-Title": "Whiteboard.io",
        }
      : {}),
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal);
    const requestSignal = combineWithTimeout(timeoutMs, signal);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(makeRequestBody()),
        signal: requestSignal.signal,
      });
      throwIfAborted(signal);

      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        if (response.status === 429 || response.status === 503) {
          recordModelFailure(model, response.status);
        }
        if (attempt === maxRetries) {
          const detail = (await response.text().catch(() => "")).slice(0, 300);
          const reason = response.status === 429 ? "rate limit" : "server error";
          throw new Error(
            `${spec.displayName} ${reason} after ${attemptCountLabel(maxRetries)} (HTTP ${response.status}${detail ? `: ${detail}` : ""}).`
          );
        }
        const delayMs = getRetryDelayMs(response, attempt);
        console.warn(
          `[AI Retry]: ${spec.displayName} HTTP ${response.status}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
        );
        await response.body?.cancel().catch(() => {});
        await delay(delayMs, signal);
        continue;
      }

      if (!response.ok) {
        const rawText = (await response.text().catch(() => "")).slice(0, 400);
        if (
          response.status === 400 &&
          useJsonObjectMode &&
          /response_format|json_validate_failed|json mode|structured|schema|unsupported/i.test(rawText)
        ) {
          useJsonObjectMode = false;
          console.warn(
            `[AI Retry]: ${spec.displayName} "${model}" rejected json_object mode (HTTP 400); retrying with plain JSON prompt.`
          );
          continue;
        }
        recordModelFailure(model, response.status);
        let detailMessage = rawText || response.statusText || `${spec.displayName} request failed`;
        try {
          const parsedErr = JSON.parse(rawText) as { error?: { message?: string }; detail?: string; title?: string };
          detailMessage = parsedErr.error?.message || parsedErr.detail || parsedErr.title || detailMessage;
        } catch {
          // Keep plain text detail
        }
        const error = new Error(
          `${spec.displayName} API Error (HTTP ${response.status}): ${detailMessage}`
        ) as Error & { fatal?: boolean };
        if (response.status >= 400 && response.status < 500) {
          error.fatal = true;
        }
        throw error;
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            reasoning_content?: string | null;
          };
          finish_reason?: string;
        }>;
        error?: { message?: string };
      };

      if (data.error?.message) {
        throw new Error(`${spec.displayName} error: ${data.error.message}`);
      }

      const msg = data.choices?.[0]?.message;
      const content = (msg?.content || "").trim();
      const candidateText = content || (msg?.reasoning_content || "").trim();
      if (!candidateText) {
        throw new Error(`${spec.displayName} returned an empty response.`);
      }

      const parsed = extractJson(candidateText);
      recordModelSuccess(model);
      return parsed;
    } catch (err: unknown) {
      throwIfAborted(signal);
      const error = err as Error & { fatal?: boolean };
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        const timeoutError = new Error(
          `${spec.displayName} ${model} did not respond within ${Math.round(timeoutMs / 1000)}s.`
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
        : Math.min(1200 * attempt, 5000) + Math.floor(Math.random() * 400);
      console.warn(
        `[AI Retry]: ${error.message}. Retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})...`
      );
      await delay(delayMs, signal);
    } finally {
      requestSignal.dispose();
    }
  }

  throw new Error(`${spec.displayName} API call failed after multiple retry attempts`);
}

// ---------------------------------------------------------------------------
// Ollama caller (local, OpenAI-free JSON-schema constrained output)
// ---------------------------------------------------------------------------

function toStandardJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toStandardJsonSchema);
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
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

  let responseFormat: unknown = OLLAMA_RESPONSE_SCHEMA;
  const makeRequestBody = () => ({
    model,
    stream: false,
    format: responseFormat,
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
  });

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
        body: JSON.stringify(makeRequestBody()),
        signal: requestSignal.signal,
      });
      throwIfAborted(signal);

      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        if (response.status === 429 || response.status === 503) {
          recordModelFailure(model, response.status);
        }
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
        if (
          response.status === 400 &&
          responseFormat !== "json" &&
          /format|schema|grammar/i.test(detail)
        ) {
          responseFormat = "json";
          console.warn(
            `[AI Retry]: Ollama "${model}" rejected schema grammar (HTTP 400); retrying with JSON mode.`
          );
          continue;
        }
        if (response.status === 404) {
          recordModelFailure(model, response.status);
        }
        const error = new Error(
          `Ollama request failed (HTTP ${response.status}${detail ? `: ${detail}` : ""}).`
        ) as Error & { fatal?: boolean };
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
        const parsed = extractJson(text);
        recordModelSuccess(model);
        return parsed;
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

  const spec = OPENAI_SPEC_BY_NAME.get(provider.name);
  if (spec) {
    const apiKey = providerApiKey(spec);
    if (!apiKey) {
      throw new Error(`${spec.apiKeyEnv} is not configured.`);
    }
    return callOpenAiCompatible(
      spec,
      apiKey,
      provider.model,
      userMessage,
      temperature,
      Math.max(1, options.maxRetries ?? 3),
      options.timeoutMs ?? numberFromEnv(spec.timeoutEnv, 45_000, 10_000, 180_000),
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
