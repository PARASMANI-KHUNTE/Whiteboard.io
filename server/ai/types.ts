/**
 * Shared types for the AI diagram pipeline.
 *
 * The model only produces a semantic graph (nodes + edges). Geometry is
 * computed on the server so connectors always attach to real elements.
 */

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

export interface CanvasCenter {
  x: number;
  y: number;
}

export interface DiagramAuthor {
  id: string;
  name: string;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  detailRatio: number;
  labelledEdges: number;
  decisions: number;
}

export interface NormalizedGraph {
  graph: DiagramGraph;
  issues: string[];
  stats: GraphStats;
}

export type CanvasElementLike = Record<string, unknown>;

export interface DiagramPayload {
  sessionId: string;
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
  graph: DiagramGraph;
  elements: CanvasElementLike[];
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

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
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

export const DIAGRAM_TYPES: DiagramType[] = [
  "mindmap",
  "flowchart",
  "brainstorm",
  "architecture",
];

export const DETAIL_LEVELS: DetailLevel[] = ["standard", "detailed"];

export const DIAGRAM_DIRECTIONS: DiagramDirection[] = ["vertical", "horizontal"];

export function coerceDiagramType(value: unknown): DiagramType {
  return DIAGRAM_TYPES.includes(value as DiagramType) ? (value as DiagramType) : "mindmap";
}

export function coerceDetailLevel(value: unknown): DetailLevel {
  if (value === "standard" || value === "balanced" || value === "concise") return "standard";
  if (value === "detailed") return "detailed";
  return DETAIL_LEVELS.includes(value as DetailLevel) ? (value as DetailLevel) : "detailed";
}

export function coerceDirection(value: unknown): DiagramDirection {
  if (value === "horizontal") return "horizontal";
  if (value === "vertical" || value === "radial" || value === "free") return "vertical";
  return DIAGRAM_DIRECTIONS.includes(value as DiagramDirection)
    ? (value as DiagramDirection)
    : "vertical";
}

/**
 * Element ids must be safe to use as socket keys and React keys. The client
 * relies on the "ai_<sessionId>_" prefix to diff its own generated group.
 */
export function sanitizeSessionId(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  if (cleaned.length >= 6) return cleaned;
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
