import type {
  DetailLevel,
  DiagramGraph,
  DiagramType,
  EdgeKind,
  EdgeStyle,
  GraphEdge,
  GraphNode,
  GraphStats,
  NodeKind,
  NormalizedGraph,
} from "./types";

const MAX_NODES = 34;
const MAX_EDGES = 96;
const NODE_KINDS: NodeKind[] = [
  "start",
  "end",
  "process",
  "decision",
  "data",
  "actor",
  "note",
  "topic",
  "idea",
];

const KIND_ALIASES: Record<string, NodeKind> = {
  start: "start",
  entry: "start",
  trigger: "start",
  begin: "start",
  input: "start",
  end: "end",
  stop: "end",
  finish: "end",
  terminator: "end",
  outcome: "end",
  done: "end",
  process: "process",
  step: "process",
  action: "process",
  task: "process",
  service: "process",
  operation: "process",
  decision: "decision",
  condition: "decision",
  branch: "decision",
  gateway: "decision",
  check: "decision",
  data: "data",
  database: "data",
  db: "data",
  store: "data",
  queue: "data",
  cache: "data",
  bucket: "data",
  actor: "actor",
  user: "actor",
  client: "actor",
  person: "actor",
  browser: "actor",
  note: "note",
  annotation: "note",
  comment: "note",
  info: "note",
  topic: "topic",
  root: "topic",
  theme: "topic",
  center: "topic",
  goal: "topic",
  idea: "idea",
  sticky: "idea",
  thought: "idea",
};

const EDGE_KINDS: EdgeKind[] = ["default", "success", "error", "async"];
const EDGE_STYLES: EdgeStyle[] = ["solid", "dashed", "dotted"];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function clamp(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function pickString(source: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value) return value;
  }
  return "";
}

export function sanitizeNodeId(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  return cleaned || fallback;
}

function normalizeKind(raw: string, type: DiagramType): NodeKind {
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (KIND_ALIASES[key]) return KIND_ALIASES[key];
  if (NODE_KINDS.includes(key as NodeKind)) return key as NodeKind;
  if (type === "brainstorm") return "idea";
  return "process";
}

function normalizeEdgeKind(raw: string): EdgeKind {
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "failure" || key === "reject" || key === "rejection") return "error";
  if (key === "ok" || key === "yes" || key === "happy") return "success";
  if (key === "background" || key === "event" || key === "queue") return "async";
  return EDGE_KINDS.includes(key as EdgeKind) ? (key as EdgeKind) : "default";
}

function normalizeEdgeStyle(raw: string): EdgeStyle | undefined {
  const key = raw.toLowerCase().replace(/[\s_-]+/g, "");
  return EDGE_STYLES.includes(key as EdgeStyle) ? (key as EdgeStyle) : undefined;
}

function addEdge(edges: GraphEdge[], edge: GraphEdge): void {
  if (edges.length >= MAX_EDGES) return;
  if (!edge.from || !edge.to || edge.from === edge.to) return;
  const duplicate = edges.some(
    (existing) =>
      existing.from === edge.from && existing.to === edge.to && (existing.label || "") === (edge.label || "")
  );
  if (duplicate) return;
  edges.push(edge);
}

interface ParsedGraph {
  title: string;
  summary: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  suggestions: string[];
}

function parseRawGraph(raw: unknown, type: DiagramType): ParsedGraph {
  const source = isRecord(raw) ? raw : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];

  const nodes: GraphNode[] = [];
  const usedIds = new Set<string>();
  const exactRef = new Map<string, string>();
  const lowerRef = new Map<string, string>();
  const indexRef = new Map<string, string>();

  rawNodes.slice(0, MAX_NODES * 2).forEach((entry, index) => {
    if (nodes.length >= MAX_NODES || !isRecord(entry)) return;

    const rawId = pickString(entry, ["id", "key", "name", "slug"]);
    let label = clamp(pickString(entry, ["label", "text", "title", "name"]), 160);
    const detail = clamp(
      pickString(entry, ["detail", "description", "subtitle", "note", "value"]),
      260
    );
    if (!label && detail) label = clamp(detail, 80);
    if (!label) return;

    let id = sanitizeNodeId(rawId || `n${index + 1}`, `n${index + 1}`);
    const base = id;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}_${suffix++}`.slice(0, 28);
    }
    usedIds.add(id);

    const kind = normalizeKind(
      pickString(entry, ["kind", "type", "role", "nodeType"]),
      type
    );
    const group = clamp(pickString(entry, ["group", "category", "lane", "layer", "cluster"]), 48);

    nodes.push({
      id,
      label,
      ...(detail ? { detail } : {}),
      kind,
      ...(group ? { group } : {}),
    });

    if (rawId) {
      exactRef.set(rawId, id);
      lowerRef.set(rawId.toLowerCase(), id);
    }
    indexRef.set(String(index + 1), id);
    lowerRef.set(`n${index + 1}`, id);
  });

  const edges: GraphEdge[] = [];

  const resolveRef = (value: unknown): string | undefined => {
    const key = asString(value);
    if (!key) return undefined;
    return (
      exactRef.get(key) ??
      lowerRef.get(key.toLowerCase()) ??
      indexRef.get(key) ??
      (key.startsWith("#") ? exactRef.get(key.slice(1)) : undefined)
    );
  };

  for (const entry of rawEdges.slice(0, MAX_EDGES * 2)) {
    if (!isRecord(entry) || edges.length >= MAX_EDGES) continue;
    const from =
      resolveRef(entry.from) ??
      resolveRef(entry.source) ??
      resolveRef(entry.start) ??
      resolveRef(entry.sourceId);
    const to =
      resolveRef(entry.to) ??
      resolveRef(entry.target) ??
      resolveRef(entry.end) ??
      resolveRef(entry.targetId);
    if (!from || !to) continue;

    const label = clamp(
      pickString(entry, ["label", "condition", "name", "text", "when"]),
      80
    );
    const kind = normalizeEdgeKind(pickString(entry, ["kind", "type", "role"]));
    const style = normalizeEdgeStyle(pickString(entry, ["style", "strokeStyle", "lineStyle"]));

    addEdge(edges, {
      from,
      to,
      ...(label ? { label } : {}),
      ...(kind !== "default" ? { kind } : {}),
      ...(style ? { style } : {}),
    });
  }

  const suggestions = Array.isArray(source.suggestions)
    ? source.suggestions
        .map((item) => clamp(asString(item), 120))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    title: clamp(asString(source.title), 90),
    summary: clamp(asString(source.summary), 300),
    nodes,
    edges,
    suggestions,
  };
}

/** Union-find over node ids, used to detect disconnected sub-graphs. */
function buildComponents(nodes: GraphNode[], edges: GraphEdge[]): Map<string, string[]> {
  const parent = new Map<string, string>();
  nodes.forEach((node) => parent.set(node.id, node.id));

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }
    let cursor = id;
    while (parent.get(cursor) !== cursor) {
      const next = parent.get(cursor) ?? cursor;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  edges.forEach((edge) => {
    if (parent.has(edge.from) && parent.has(edge.to)) union(edge.from, edge.to);
  });

  const components = new Map<string, string[]>();
  nodes.forEach((node) => {
    const root = find(node.id);
    const bucket = components.get(root);
    if (bucket) bucket.push(node.id);
    else components.set(root, [node.id]);
  });
  return components;
}

function outgoing(edges: GraphEdge[], id: string): GraphEdge[] {
  return edges.filter((edge) => edge.from === id);
}

function incoming(edges: GraphEdge[], id: string): GraphEdge[] {
  return edges.filter((edge) => edge.to === id);
}

function makeUniqueNodeId(nodes: GraphNode[], base: string): string {
  const used = new Set(nodes.map((node) => node.id));
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}_${suffix++}`;
  return candidate;
}

/**
 * Wire every disconnected island into the main graph so no element floats
 * without a relationship. This is a structural safety net, not a content fix.
 */
function ensureConnectivity(
  nodes: GraphNode[],
  edges: GraphEdge[],
  type: DiagramType,
  anchorId?: string
): void {
  if (nodes.length < 2) return;

  let components = buildComponents(nodes, edges);
  if (components.size <= 1) return;

  const degree = new Map<string, number>();
  edges.forEach((edge) => {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  });

  const anchor =
    (anchorId && nodes.find((node) => node.id === anchorId)) ||
    nodes.find((node) => node.kind === "start") ||
    nodes.find((node) => node.kind === "topic") ||
    [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))[0];

  if (!anchor) return;

  const connectorLabel =
    type === "mindmap" ? "branch" : type === "architecture" ? "uses" : "then";

  for (const ids of components.values()) {
    if (ids.includes(anchor.id)) continue;

    // Prefer the component's own entry point so the connection reads naturally.
    const target =
      ids.find((id) => incoming(edges, id).length === 0) ??
      ids.find((id) => id !== anchor.id) ??
      ids[0];
    if (!target || target === anchor.id) continue;

    addEdge(edges, { from: anchor.id, to: target, label: connectorLabel });
  }

  // The new edges merged islands; recompute in case of leftovers.
  components = buildComponents(nodes, edges);
  if (components.size > 1) {
    const main = components.get(anchor.id) ?? [];
    for (const ids of components.values()) {
      if (ids.some((id) => main.includes(id))) continue;
      const target = ids[0];
      if (target) addEdge(edges, { from: anchor.id, to: target, label: connectorLabel });
    }
  }
}

function ensureEndNode(nodes: GraphNode[], edges: GraphEdge[], startId: string): GraphNode {
  const existing = nodes.find((node) => node.kind === "end" && node.id !== startId);
  if (existing) return existing;

  const sinks = nodes.filter(
    (node) => node.id !== startId && outgoing(edges, node.id).length === 0
  );
  const sink = sinks[0];
  if (sink) {
    sink.kind = "end";
    return sink;
  }

  const endNode: GraphNode = {
    id: makeUniqueNodeId(nodes, "end_auto"),
    label: "End",
    kind: "end",
  };
  nodes.push(endNode);
  return endNode;
}

function prepareFlowchart(nodes: GraphNode[], edges: GraphEdge[]): void {
  // An "end" node with outgoing edges is really a process node.
  nodes.forEach((node) => {
    if (node.kind === "end" && outgoing(edges, node.id).length > 0) {
      node.kind = "process";
    }
  });

  const start =
    nodes.find((node) => node.kind === "start") ??
    nodes.find((node) => incoming(edges, node.id).length === 0) ??
    nodes[0];
  if (!start) return;
  start.kind = "start";

  const end = ensureEndNode(nodes, edges, start.id);
  const endNodes = nodes.filter(
    (node) => node.kind === "end" && node.id !== start.id && outgoing(edges, node.id).length === 0
  );
  if (endNodes.length === 0) endNodes.push(end);
  const failureEnd =
    endNodes.find((node) => node.id !== end.id) ?? end;

  // Promote a real branching node if the model forgot the decision kind.
  if (!nodes.some((node) => node.kind === "decision")) {
    const candidate = nodes.find(
      (node) =>
        node.id !== start.id &&
        node.kind !== "end" &&
        outgoing(edges, node.id).length >= 2
    );
    if (candidate) candidate.kind = "decision";
  }

  // Every decision needs two labelled outcomes.
  for (const node of nodes) {
    if (node.kind !== "decision") continue;
    let outs = outgoing(edges, node.id);
    const labels = ["yes", "no", "otherwise"];

    if (outs.length === 0) {
      addEdge(edges, { from: node.id, to: end.id, label: "yes", kind: "success" });
      addEdge(edges, {
        from: node.id,
        to: failureEnd.id,
        label: "no",
        kind: "error",
      });
      outs = outgoing(edges, node.id);
    } else if (outs.length === 1) {
      const target = outs[0].to === failureEnd.id ? end.id : failureEnd.id;
      addEdge(edges, {
        from: node.id,
        to: target,
        label: outs[0].label ? "alternate" : "no",
        kind: "error",
      });
      outs = outgoing(edges, node.id);
    }

    outs.forEach((edge, index) => {
      if (!edge.label) {
        edge.label = labels[Math.min(index, labels.length - 1)];
      }
    });
  }

  ensureConnectivity(nodes, edges, "flowchart", start.id);
}

function prepareMindmap(nodes: GraphNode[], edges: GraphEdge[]): void {
  if (nodes.length === 0) return;

  const root =
    nodes.find((node) => node.kind === "topic") ??
    nodes.find((node) => incoming(edges, node.id).length === 0 && outgoing(edges, node.id).length > 0) ??
    nodes[0];
  root.kind = "topic";

  ensureConnectivity(nodes, edges, "mindmap", root.id);
}

function prepareArchitecture(nodes: GraphNode[], edges: GraphEdge[]): void {
  const anchor =
    nodes.find((node) => node.kind === "actor") ??
    nodes.find((node) => (node.group || "").toLowerCase().includes("client")) ??
    nodes.find((node) => incoming(edges, node.id).length === 0) ??
    nodes[0];
  ensureConnectivity(nodes, edges, "architecture", anchor?.id);
}

function applyTypeStructure(graph: DiagramGraph, type: DiagramType): void {
  if (type === "flowchart") {
    prepareFlowchart(graph.nodes, graph.edges);
  } else if (type === "mindmap") {
    prepareMindmap(graph.nodes, graph.edges);
  } else if (type === "architecture") {
    prepareArchitecture(graph.nodes, graph.edges);
  }
  // Brainstorm clusters intentionally do not need every sticky wired.
}

export function computeStats(graph: DiagramGraph): GraphStats {
  const nodes = graph.nodes.length;
  const withDetail = graph.nodes.filter((node) => (node.detail || "").trim().length >= 5).length;
  return {
    nodes,
    edges: graph.edges.length,
    detailRatio: nodes > 0 ? withDetail / nodes : 0,
    labelledEdges: graph.edges.filter((edge) => (edge.label || "").trim().length > 0).length,
    decisions: graph.nodes.filter((node) => node.kind === "decision").length,
  };
}

export interface NormalizeOptions {
  type: DiagramType;
  detail: DetailLevel;
  mode: "initial" | "followup";
  fallbackTitle?: string;
  fallbackSummary?: string;
}

export function normalizeGraph(raw: unknown, options: NormalizeOptions): NormalizedGraph {
  const parsed = parseRawGraph(raw, options.type);

  const graph: DiagramGraph = {
    title: parsed.title || clamp(options.fallbackTitle || "Generated Diagram", 90),
    summary:
      parsed.summary ||
      options.fallbackSummary ||
      `A ${options.type} diagram generated for ${options.fallbackTitle || "your request"}.`,
    nodes: parsed.nodes,
    edges: parsed.edges,
    suggestions: parsed.suggestions,
  };

  applyTypeStructure(graph, options.type);

  const issues = evaluateQuality(graph, options);
  return { graph, issues, stats: computeStats(graph) };
}

export function evaluateQuality(graph: DiagramGraph, options: NormalizeOptions): string[] {
  const issues: string[] = [];
  const stats = computeStats(graph);
  const { type, detail, mode } = options;

  if (stats.nodes === 0) {
    return ["The response contained no usable nodes."];
  }

  if (mode === "initial") {
    const minNodes =
      type === "brainstorm"
        ? detail === "detailed"
          ? 10
          : 7
        : detail === "detailed"
        ? 12
        : 8;

    if (stats.nodes < minNodes) {
      issues.push(`Only ${stats.nodes} nodes were produced; at least ${minNodes} are required.`);
    }

    if (type !== "brainstorm" && stats.edges < stats.nodes - 1) {
      issues.push(
        `${stats.edges} edges cannot connect ${stats.nodes} nodes; every node must be part of the flow.`
      );
    }

    if (detail === "detailed" && stats.detailRatio < 0.5) {
      issues.push(
        `Only ${Math.round(stats.detailRatio * 100)}% of nodes have a detail line; detailed diagrams need at least 50%.`
      );
    }
  }

  if (type === "flowchart") {
    const decisions = graph.nodes.filter((node) => node.kind === "decision");
    if (mode === "initial" && decisions.length === 0) {
      issues.push("A flowchart needs at least one decision node with branching outcomes.");
    }

    const labelledBranch = decisions.some((decision) => {
      const outs = graph.edges.filter((edge) => edge.from === decision.id);
      return (
        outs.length >= 2 &&
        outs.filter((edge) => (edge.label || "").trim().length > 0).length >= 2
      );
    });

    if (decisions.length > 0 && !labelledBranch) {
      issues.push(
        "At least one decision must have two outgoing edges with distinct labels (e.g. yes/no, valid/401)."
      );
    }

    const ends = graph.nodes.filter((node) => node.kind === "end");
    if (ends.length === 0) {
      issues.push("A flowchart needs at least one end node.");
    }
  }

  if (type === "mindmap") {
    const root = graph.nodes.find((node) => node.kind === "topic");
    if (!root) {
      issues.push("A mind map needs one central topic node.");
    } else {
      const branches = graph.edges.filter((edge) => edge.from === root.id).length;
      if (mode === "initial" && branches < 3) {
        issues.push(`The central topic has only ${branches} branches; at least 3 are required.`);
      }
    }
  }

  if (type === "architecture" && mode === "initial") {
    const groups = new Set(
      graph.nodes.map((node) => (node.group || "").trim()).filter(Boolean)
    );
    if (groups.size < 2 && stats.nodes >= 8) {
      issues.push(
        "An architecture diagram needs at least two named groups/layers (e.g. Client, Edge, Service, Data)."
      );
    }
  }

  if (type === "brainstorm" && mode === "initial") {
    const groups = new Set(
      graph.nodes.map((node) => (node.group || "").trim()).filter(Boolean)
    );
    if (groups.size < 3) {
      issues.push(
        `A brainstorm board needs at least 3 named categories; found ${groups.size}.`
      );
    }
  }

  return issues;
}
