const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  nvidia: "NVIDIA NIM",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  ollama: "Ollama",
  fallback: "Local fallback engine",
};

/**
 * Formats a concise human-readable engine attribution badge for any backend.
 */
export function formatAiEngineDisplay(provider?: string, model?: string): string {
  const norm = (provider || "").trim().toLowerCase();
  if (norm === "fallback") {
    return "Local fallback engine";
  }
  const label = PROVIDER_LABELS[norm];
  if (!label) {
    return model ? `${provider || "AI"} · ${model}` : provider || "AI";
  }
  if (norm === "gemini") {
    return model ? model : label;
  }
  return `${label} · ${model || (norm === "ollama" ? "local" : "auto")}`;
}

export function providerBadgeClasses(provider?: string): string {
  switch ((provider || "").trim().toLowerCase()) {
    case "ollama":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";
    case "groq":
      return "bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300";
    case "nvidia":
      return "bg-lime-100 text-lime-800 dark:bg-lime-950/60 dark:text-lime-300";
    case "openrouter":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300";
    case "deepseek":
      return "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300";
    case "fallback":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";
    default:
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300";
  }
}
