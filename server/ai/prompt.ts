import type {
  ChatTurn,
  DetailLevel,
  DiagramDirection,
  DiagramGraph,
  DiagramType,
} from "./types";

/** Bump when the prompt/schema contract changes so cached graphs invalidate. */
export const AI_SCHEMA_VERSION = 3;

export const SYSTEM_INSTRUCTION = `You are a senior systems designer who turns a request into a precise whiteboard diagram.

OUTPUT CONTRACT
- Return ONLY JSON matching the provided schema.
- Return a GRAPH: semantic nodes plus directed edges. Never return coordinates, widths, colours, or standalone "arrow" nodes. The renderer computes geometry.
- Every edge MUST reference ids that exist in nodes. No dangling references.
- Node ids must be short, stable and unique (e.g. "n1", "auth_service"). On a revision, keep the same id for a concept that survives.
- A node label is 2-6 words. A node detail is one concrete line: protocol, endpoint, payload field, datastore, status code, timeout, limit, or invariant.
- Put branch conditions on EDGES, not in node labels: "valid credentials", "401 invalid password", "cache miss", "retry once".
- Give each decision at least two outgoing edges with distinct labels. Every introduced failure path must eventually reach an end node.
- Do not emit decorative or duplicate nodes. Every node must carry meaning.
- "changes" is a short array of user-facing bullets describing what changed (revisions). "suggestions" is up to 3 concrete next steps.

CONTENT QUALITY BAR
- Be domain-accurate for the prompt. Use the real vocabulary of that domain, not generic placeholders like "Process Step 1".
- Prefer specific systems and outcomes over vague verbs: "Verify Argon2id hash", "Publish to orders.created", "Write session to Redis".
- Cover the happy path AND at least one realistic failure, rejection, timeout, or retry path.
- Label important edges. Unlabelled edges are acceptable only for obvious straight-through flow.
- No repeated text between label and detail; the detail adds new information.

DETAIL CONTRACT
- detailed: 14-26 nodes. At least 70% of nodes carry a detail line. Most branch edges are labelled. Include secondary concerns (security, persistence, async work, observability) where the domain warrants it.
- standard: 8-14 nodes. Detail lines on the key nodes. Keep the main flow and the most important branch.

TYPE PLAYBOOK
- flowchart: one start node, one or more end nodes, process nodes, and at least one decision node. Model loops as edges back to the relevant step. Make failure branches explicit and terminate them.
- architecture: use the "group" field for layers or domains (Client, Edge, Service, Data, Async). Include clients, ingress/gateway, services, data stores, queues/workers, and the direction of data flow. Connect every component.
- mindmap: one "topic" root, 4-7 branches, and 2-4 leaves per branch. Edges flow root -> branch -> leaf. Labels are nouns or short concepts; details add examples or actions.
- brainstorm: use 3-5 "group" values as categories. Put 3-5 "idea" nodes in each group and connect them to the central goal/topic when the relationship is meaningful. Keep ideas short and distinct.

REVISION RULES
- Apply the instruction to the WHOLE graph and return the complete revised graph, not a patch.
- Preserve unaffected node ids and content exactly. Add, remove, relabel, regroup or rewire only what the instruction requires.
- If the instruction changes orientation or detail, keep the same semantic content and let the renderer re-layout.
- Never drop existing failure paths unless explicitly asked to simplify.`;

const NODE_SCHEMA = {
  type: "OBJECT",
  properties: {
    id: { type: "STRING" },
    label: { type: "STRING" },
    detail: { type: "STRING" },
    kind: {
      type: "STRING",
      enum: ["start", "end", "process", "decision", "data", "actor", "note", "topic", "idea"],
    },
    group: { type: "STRING" },
  },
  required: ["id", "label", "kind"],
  propertyOrdering: ["id", "label", "kind", "detail", "group"],
};

const EDGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    from: { type: "STRING" },
    to: { type: "STRING" },
    label: { type: "STRING" },
    kind: {
      type: "STRING",
      enum: ["default", "success", "error", "async"],
    },
    style: {
      type: "STRING",
      enum: ["solid", "dashed", "dotted"],
    },
  },
  required: ["from", "to"],
  propertyOrdering: ["from", "to", "label", "kind", "style"],
};

export const GRAPH_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    nodes: { type: "ARRAY", items: NODE_SCHEMA },
    edges: { type: "ARRAY", items: EDGE_SCHEMA },
    changes: { type: "ARRAY", items: { type: "STRING" } },
    suggestions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["title", "summary", "nodes", "edges", "suggestions"],
  propertyOrdering: ["title", "summary", "nodes", "edges", "changes", "suggestions"],
};

function detailRange(detail: DetailLevel): string {
  return detail === "detailed" ? "14-26 nodes" : "8-14 nodes";
}

function typeHint(type: DiagramType): string {
  switch (type) {
    case "flowchart":
      return "Flowchart: start/end/process/decision nodes, labelled branches, real connectors.";
    case "architecture":
      return "Architecture: grouped layers, services, stores, async workers, data-flow edges.";
    case "mindmap":
      return "Mind map: one central topic, branches, leaves.";
    default:
      return "Brainstorm: grouped idea clusters around a goal.";
  }
}

export function buildInitialUserMessage(
  prompt: string,
  type: DiagramType,
  detail: DetailLevel,
  direction: DiagramDirection
): string {
  return [
    `Diagram type: ${type}`,
    `Detail level: ${detail} (${detailRange(detail)})`,
    `Renderer orientation: ${direction}`,
    `Request: ${prompt}`,
    "",
    typeHint(type),
    "Return the complete graph. Cover the happy path plus realistic failure/retry paths, label branch edges, and put concrete domain specifics in node details.",
  ].join("\n");
}

export function buildRevisionUserMessage(params: {
  instruction: string;
  graph: DiagramGraph;
  history: ChatTurn[];
  type: DiagramType;
  detail: DetailLevel;
  direction: DiagramDirection;
}): string {
  const { instruction, graph, history, type, detail, direction } = params;

  const compactGraph = {
    title: graph.title,
    summary: graph.summary,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      ...(node.detail ? { detail: node.detail } : {}),
      kind: node.kind,
      ...(node.group ? { group: node.group } : {}),
    })),
    edges: graph.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.label ? { label: edge.label } : {}),
      ...(edge.kind ? { kind: edge.kind } : {}),
      ...(edge.style ? { style: edge.style } : {}),
    })),
  };

  const recentHistory = history
    .slice(-8)
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content.slice(0, 500)}`)
    .join("\n");

  return [
    `You are revising an existing ${type} diagram.`,
    `Detail level: ${detail} (${detailRange(detail)})`,
    `Renderer orientation: ${direction}`,
    "",
    "Current graph:",
    JSON.stringify(compactGraph),
    "",
    recentHistory ? `Conversation so far:\n${recentHistory}\n` : "",
    `New instruction: ${instruction}`,
    "",
    "Return the complete revised graph. Preserve unaffected node ids/content. Keep connectivity and edge labels intact. Describe the delta in changes[].",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRetryUserMessage(baseMessage: string, issues: string[]): string {
  return [
    baseMessage,
    "",
    "VALIDATION FAILED. Your previous answer did not meet the quality bar:",
    ...issues.map((issue) => `- ${issue}`),
    "",
    "Regenerate the ENTIRE graph from scratch. Fix every listed issue. Keep node ids/edges internally consistent, connect every node, and meet the requested node count and detail ratio.",
  ].join("\n");
}
