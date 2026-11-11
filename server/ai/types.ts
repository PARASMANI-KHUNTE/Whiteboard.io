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
  notice?: string;
  fromCache?: boolean;
  isFallback?: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
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
  return DETAIL_LEVELS.includes(value as DetailLevel) ? (value as DetailLevel) : "detailed";
}

export function coerceDirection(value: unknown): DiagramDirection {
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
