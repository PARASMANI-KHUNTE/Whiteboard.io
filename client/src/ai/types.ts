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
  notice?: string;
  fromCache?: boolean;
  isFallback?: boolean;
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
  suggestions?: string[];
  notice?: string;
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
