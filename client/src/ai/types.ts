import type { CanvasElement } from "../types";

export type DiagramType = "mindmap" | "flowchart" | "brainstorm" | "architecture";

export type DetailLevel = "standard" | "detailed";

export type DiagramDirection = "vertical" | "horizontal";

export type NodeKind =
  | "start"
  | "end"
  | "process"
  | "decision"
  | "data"
  | "actor"
  | "note"
  | "topic"
  | "idea";

export type EdgeKind = "default" | "success" | "error" | "async";

export type EdgeStyle = "solid" | "dashed" | "dotted";

export interface GraphNode {
  id: string;
  label: string;
  detail?: string;
  kind: NodeKind;
  group?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  kind?: EdgeKind;
  style?: EdgeStyle;
}

export interface DiagramGraph {
  title: string;
  summary: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  suggestions: string[];
}

export interface AiDiagramPayload {
  sessionId: string;
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
  graph: DiagramGraph;
  elements: CanvasElement[];
  title: string;
  summary: string;
  suggestions: string[];
  changes: string[];
  /** Which engine produced this payload (gemini, ollama, fallback). */
  provider?: string;
  /** Concrete model identifier used, for display/diagnostics. */
  model?: string;
  notice?: string;
  fromCache?: boolean;
  isFallback?: boolean;
}

export type AiProviderId =
  | "auto"
  | "gemini"
  | "groq"
  | "nvidia"
  | "openrouter"
  | "deepseek"
  | "ollama"
  | "fallback";

export interface AvailableAiProviderOption {
  id: Exclude<AiProviderId, "auto">;
  label: string;
  model: string;
  models: string[];
  configured: boolean;
  local: boolean;
}

/** Engine description returned by GET /api/ai/config. */
export interface AiEngineConfig {
  provider: string;
  model: string;
  label: string;
  ollamaFallback?: boolean;
  defaultSelection?: string;
  availableProviders?: AvailableAiProviderOption[];
}

export interface BoardNodeContext {
  id: string;
  kind: "sticky" | "shape" | "text" | "icon";
  label: string;
  shapeType?: string;
  author?: string;
}

export interface BoardEdgeContext {
  from: string;
  to: string;
  label?: string;
}

export interface BoardSummaryContext {
  totalElements: number;
  strokeCount: number;
  nodes: BoardNodeContext[];
  connections: BoardEdgeContext[];
}

export interface SessionDiagramSummary {
  sessionId: string;
  title: string;
  type: DiagramType;
  summary: string;
  provider?: string;
  model?: string;
  nodeCount: number;
  updatedAt: number;
}

export interface GlobalSessionTurn {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  diagramTitle?: string;
  at?: number;
}

export interface GlobalAiContext {
  boardKey: string;
  roomName?: string;
  mode?: "solo" | "room";
  participantCount?: number;
  theme?: "light" | "dark";
  boardSummary?: BoardSummaryContext;
  sessionSummary?: string;
  priorDiagrams?: SessionDiagramSummary[];
  recentTurns?: GlobalSessionTurn[];
  lastProvider?: string;
  lastModel?: string;
}

export interface AiChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  changes?: string[];
  /** Canvas element IDs created or updated in this AI turn. */
  changedElementIds?: string[];
  suggestions?: string[];
  notice?: string;
  provider?: string;
  model?: string;
  at: number;
}

export interface AiSessionState {
  sessionId: string;
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
  graph: DiagramGraph;
  title: string;
  summary: string;
  /** World-space anchor kept stable across follow-up turns. */
  origin: { x: number; y: number };
  suggestions: string[];
  messages: AiChatMessage[];
}

export const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  mindmap: "Mind map",
  flowchart: "Flowchart",
  brainstorm: "Sticky board",
  architecture: "Architecture",
};
