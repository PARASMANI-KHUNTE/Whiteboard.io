import { BACKEND_URL } from "../config";
import type {
  AiChatTurn,
  AiDiagramPayload,
  AiEngineConfig,
  DetailLevel,
  DiagramDirection,
  DiagramGraph,
  DiagramType,
} from "./types";

interface BaseRequest {
  authToken?: string | null;
  signal?: AbortSignal;
}

async function readPayload(res: Response): Promise<AiDiagramPayload> {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new Error("The AI server returned an unreadable response.");
  }

  if (!res.ok || !data?.success || !Array.isArray(data.elements)) {
    throw new Error(data?.error || "The AI server could not generate a diagram.");
  }

  return data as AiDiagramPayload;
}

/**
 * Ask the server which engine would handle requests right now, so the UI can
 * label the badge accurately (Gemini in the cloud, or a local Ollama model).
 * Returns null when the server is unreachable; callers fall back to a generic
 * label rather than blocking diagram generation.
 */
export async function fetchAiEngine(signal?: AbortSignal): Promise<AiEngineConfig | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ai/config`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      provider?: AiEngineConfig["provider"];
      model?: string;
      label?: string;
    };
    if (!data?.success || !data.provider || !data.label) return null;
    return {
      provider: data.provider,
      model: data.model || "",
      label: data.label,
    };
  } catch {
    return null;
  }
}

export interface GenerateDiagramRequest extends BaseRequest {
  prompt: string;
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
  canvasCenter: { x: number; y: number };
}

export async function requestDiagram(request: GenerateDiagramRequest): Promise<AiDiagramPayload> {
  const res = await fetch(`${BACKEND_URL}/api/ai/generate-diagram`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.authToken ? { Authorization: `Bearer ${request.authToken}` } : {}),
    },
    body: JSON.stringify({
      prompt: request.prompt,
      type: request.type,
      detail: request.detail,
      direction: request.direction,
      canvasCenter: request.canvasCenter,
    }),
    signal: request.signal,
  });

  return readPayload(res);
}

export interface ReviseDiagramRequest extends BaseRequest {
  instruction: string;
  graph: DiagramGraph;
  history: AiChatTurn[];
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
  canvasCenter: { x: number; y: number };
  sessionId: string;
}

export async function requestRevision(request: ReviseDiagramRequest): Promise<AiDiagramPayload> {
  const res = await fetch(`${BACKEND_URL}/api/ai/revise-diagram`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.authToken ? { Authorization: `Bearer ${request.authToken}` } : {}),
    },
    body: JSON.stringify({
      instruction: request.instruction,
      graph: request.graph,
      history: request.history,
      type: request.type,
      detail: request.detail,
      direction: request.direction,
      canvasCenter: request.canvasCenter,
      sessionId: request.sessionId,
    }),
    signal: request.signal,
  });

  return readPayload(res);
}
