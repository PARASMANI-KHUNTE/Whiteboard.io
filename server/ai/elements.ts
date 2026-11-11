import type {
  CanvasCenter,
  CanvasElementLike,
  DiagramAuthor,
  DiagramGraph,
  DiagramType,
  GraphNode,
} from "./types";
import type { LayoutNode, LayoutResult, Side } from "./layout";

interface NodeStyle {
  stroke: string;
  fill: string;
  shapeType: "rectangle" | "circle" | "diamond";
  fontSize: number;
  strokeStyle: "solid" | "dashed" | "dotted";
}

/** Muted, theme-safe palette. Translucent fills keep text readable in dark mode. */
const PALETTE = [
  { stroke: "#4f46e5", fill: "rgba(79, 70, 229, 0.11)" },
  { stroke: "#0284c7", fill: "rgba(2, 132, 199, 0.11)" },
  { stroke: "#059669", fill: "rgba(5, 150, 105, 0.11)" },
  { stroke: "#d97706", fill: "rgba(217, 119, 6, 0.11)" },
  { stroke: "#db2777", fill: "rgba(219, 39, 119, 0.11)" },
  { stroke: "#7c3aed", fill: "rgba(124, 58, 237, 0.11)" },
  { stroke: "#0f766e", fill: "rgba(15, 118, 110, 0.11)" },
];

const STICKY_COLORS = ["#fef9c3", "#eff6ff", "#ecfdf5", "#fff1f2"];

const BRANCH_WIRE_COLORS = [
  "#4f46e5",
  "#0284c7",
  "#059669",
  "#d97706",
  "#db2777",
  "#7c3aed",
];

const EDGE_COLORS: Record<string, string> = {
  default: "#64748b",
  success: "#059669",
  error: "#dc2626",
  async: "#7c3aed",
};

function styleFor(node: GraphNode, type: DiagramType, colorIndex: number): NodeStyle {
  switch (node.kind) {
    case "start":
      return {
        stroke: "#059669",
        fill: "rgba(5, 150, 105, 0.16)",
        shapeType: "rectangle",
        fontSize: 15,
        strokeStyle: "solid",
      };
    case "end":
      return {
        stroke: "#475569",
        fill: "rgba(71, 85, 105, 0.14)",
        shapeType: "rectangle",
        fontSize: 15,
        strokeStyle: "solid",
      };
    case "decision":
      return {
        stroke: "#d97706",
        fill: "rgba(217, 119, 6, 0.15)",
        shapeType: "diamond",
        fontSize: 14,
        strokeStyle: "solid",
      };
    case "data":
      return {
        stroke: "#7c3aed",
        fill: "rgba(124, 58, 237, 0.10)",
        shapeType: "rectangle",
        fontSize: 14,
        strokeStyle: "dashed",
      };
    case "actor":
      return {
        stroke: "#0284c7",
        fill: "rgba(2, 132, 199, 0.12)",
        shapeType: "rectangle",
        fontSize: 14,
        strokeStyle: "solid",
      };
    case "topic":
      return {
        stroke: "#4338ca",
        fill: "rgba(67, 56, 202, 0.17)",
        shapeType: type === "mindmap" ? "circle" : "rectangle",
        fontSize: 16,
        strokeStyle: "solid",
      };
    case "note":
      return {
        stroke: "#b45309",
        fill: "rgba(180, 83, 9, 0.10)",
        shapeType: "rectangle",
        fontSize: 14,
        strokeStyle: "dotted",
      };
    case "idea":
      return {
        stroke: "#d97706",
        fill: "rgba(217, 119, 6, 0.12)",
        shapeType: "rectangle",
        fontSize: 14,
        strokeStyle: "solid",
      };
    default: {
      const palette = PALETTE[Math.abs(colorIndex) % PALETTE.length];
      return {
        stroke: palette.stroke,
        fill: palette.fill,
        shapeType: "rectangle",
        fontSize: 14,
        strokeStyle: "solid",
      };
    }
  }
}

function displayText(node: GraphNode): string {
  if (node.kind === "decision" || node.kind === "start" || node.kind === "end") {
    return node.label;
  }
  if (!node.detail) return node.label;
  return `${node.label}\n${node.detail}`;
}

function isSticky(node: GraphNode, type: DiagramType): boolean {
  return node.kind === "idea" || node.kind === "note" || type === "brainstorm";
}

function makeShape(
  id: string,
  layoutNode: LayoutNode,
  style: NodeStyle,
  author: DiagramAuthor,
  offsetX: number,
  offsetY: number,
  now: number
): CanvasElementLike {
  return {
    id,
    type: "shape",
    shapeType: style.shapeType,
    x: Math.round(layoutNode.x + offsetX),
    y: Math.round(layoutNode.y + offsetY),
    width: Math.round(layoutNode.width),
    height: Math.round(layoutNode.height),
    color: style.stroke,
    fillColor: style.fill,
    strokeWidth: 2,
    strokeStyle: style.strokeStyle,
    text: displayText(layoutNode.node),
    fontSize: style.fontSize,
    userId: author.id,
    userName: author.name,
    updatedAt: now,
  };
}

function makeSticky(
  id: string,
  layoutNode: LayoutNode,
  author: DiagramAuthor,
  offsetX: number,
  offsetY: number,
  now: number
): CanvasElementLike {
  return {
    id,
    type: "sticky",
    x: Math.round(layoutNode.x + offsetX),
    y: Math.round(layoutNode.y + offsetY),
    width: Math.round(layoutNode.width),
    height: Math.round(layoutNode.height),
    text: displayText(layoutNode.node),
    color:
      STICKY_COLORS[
        Math.abs(layoutNode.colorIndex) % STICKY_COLORS.length
      ],
    userId: author.id,
    userName: author.name,
    updatedAt: now,
  };
}

function anchorValue(side?: Side): Side | undefined {
  return side;
}

export interface BuildElementsParams {
  sessionId: string;
  type: DiagramType;
  graph: DiagramGraph;
  layout: LayoutResult;
  author: DiagramAuthor;
  canvasCenter: CanvasCenter;
}

/**
 * Convert a laid-out graph into real canvas elements:
 * shapes/stickies for nodes, text for headers, WireElements for edges.
 */
export function buildElements(params: BuildElementsParams): CanvasElementLike[] {
  const { sessionId, type, graph, layout, author, canvasCenter } = params;
  const now = Date.now();
  const offsetX = Math.round(canvasCenter.x - layout.width / 2);
  const offsetY = Math.round(canvasCenter.y - layout.height / 2);

  const elements: CanvasElementLike[] = [];
  const elementIdByNode = new Map<string, string>();
  const layoutNodeById = new Map<string, LayoutNode>();

  graph.nodes.forEach((node) => {
    const layoutNode = layout.nodes.find((candidate) => candidate.node.id === node.id);
    if (!layoutNode) return;
    layoutNodeById.set(node.id, layoutNode);

    const id = `ai_${sessionId}_n_${node.id}`;
    elementIdByNode.set(node.id, id);

    if (isSticky(node, type)) {
      elements.push(makeSticky(id, layoutNode, author, offsetX, offsetY, now));
      return;
    }

    const style = styleFor(node, type, layoutNode.colorIndex);
    elements.push(makeShape(id, layoutNode, style, author, offsetX, offsetY, now));
  });

  layout.headers.forEach((header, index) => {
    elements.push({
      id: `ai_${sessionId}_h_${index}`,
      type: "text",
      x: Math.round(header.x + offsetX),
      y: Math.round(header.y + offsetY),
      text: header.text,
      color: "#0f172a",
      fontSize: header.kind === "group" ? 16 : 20,
      fontWeight: "bold",
      textAlign: "left",
      userId: author.id,
      userName: author.name,
      updatedAt: now,
    });
  });

  const edgeCounts = new Map<string, number>();

  layout.edges.forEach((layoutEdge) => {
    const { edge } = layoutEdge;
    const fromId = elementIdByNode.get(edge.from);
    const toId = elementIdByNode.get(edge.to);
    if (!fromId || !toId) return;

    const base = `${edge.from}_${edge.to}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    const seen = (edgeCounts.get(base) ?? 0) + 1;
    edgeCounts.set(base, seen);
    const edgeId = `ai_${sessionId}_e_${base}${seen > 1 ? `_${seen}` : ""}`;

    const sourceLayout = layoutNodeById.get(edge.from);
    const color =
      type === "mindmap"
        ? BRANCH_WIRE_COLORS[Math.abs(sourceLayout?.colorIndex ?? 0) % BRANCH_WIRE_COLORS.length]
        : EDGE_COLORS[edge.kind ?? "default"] ?? EDGE_COLORS.default;

    elements.push({
      id: edgeId,
      type: "wire",
      fromId,
      toId,
      ...(anchorValue(layoutEdge.fromAnchor)
        ? { fromAnchor: anchorValue(layoutEdge.fromAnchor) }
        : {}),
      ...(anchorValue(layoutEdge.toAnchor)
        ? { toAnchor: anchorValue(layoutEdge.toAnchor) }
        : {}),
      wireType: "curve",
      color,
      strokeWidth: 2,
      strokeStyle:
        edge.style ?? (edge.kind === "async" ? "dashed" : "solid"),
      arrowStart: false,
      arrowEnd: type !== "mindmap",
      ...(edge.label ? { label: edge.label } : {}),
      userId: author.id,
      userName: author.name,
      updatedAt: now,
    });
  });

  return elements;
}
