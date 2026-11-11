import type { DetailLevel, DiagramGraph, DiagramType, GraphEdge, GraphNode } from "./types";

function shortTopic(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "the request";
  return cleaned.length > 34 ? `${cleaned.slice(0, 33).trimEnd()}…` : cleaned;
}

function flowchartGraph(topic: string, detail: DetailLevel): DiagramGraph {
  const nodes: GraphNode[] = [
    {
      id: "n1",
      label: "Request received",
      detail: "User action from the web or mobile client",
      kind: "start",
    },
    {
      id: "n2",
      label: "Validate request",
      detail: "Check schema, required fields and payload size",
      kind: "process",
    },
    {
      id: "n13",
      label: "Check rate limit",
      detail: "Redis sliding window, 60 requests/min per user",
      kind: "data",
    },
    {
      id: "n3",
      label: "Input valid?",
      kind: "decision",
    },
    {
      id: "n4",
      label: "Authenticate caller",
      detail: "Verify session cookie or bearer token signature",
      kind: "process",
    },
    {
      id: "n5",
      label: "Authorized?",
      kind: "decision",
    },
    {
      id: "n6",
      label: `Load ${topic}`,
      detail: "Read the record and related state from the primary database",
      kind: "process",
    },
    {
      id: "n7",
      label: "Business rules pass?",
      kind: "decision",
    },
    {
      id: "n8",
      label: `Apply ${topic}`,
      detail: "Transactional update with an optimistic-lock check",
      kind: "process",
    },
    {
      id: "n9",
      label: "Persist result",
      detail: "Commit to Postgres and publish a domain event",
      kind: "process",
    },
    {
      id: "n15",
      label: "Audit log",
      detail: "Append actor, action and trace id to the audit stream",
      kind: "process",
    },
    {
      id: "n14",
      label: "Retry with backoff",
      detail: "Retry transient failures up to 3 times, then dead-letter",
      kind: "process",
    },
    {
      id: "n10",
      label: "Send confirmation",
      detail: "Notify the user over WebSocket and email",
      kind: "process",
    },
    {
      id: "n11",
      label: "Completed",
      detail: "Return 200 with the updated resource",
      kind: "end",
    },
    {
      id: "n12",
      label: "Rejected",
      detail: "Return a typed error and log the reason",
      kind: "end",
    },
  ];

  let edges: GraphEdge[] = [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n13", label: "check quota" },
    { from: "n13", to: "n3", label: "allowed" },
    { from: "n3", to: "n4", label: "yes", kind: "success" },
    { from: "n3", to: "n12", label: "missing fields (400)", kind: "error" },
    { from: "n13", to: "n12", label: "429 rate limited", kind: "error" },
    { from: "n4", to: "n5" },
    { from: "n5", to: "n6", label: "yes", kind: "success" },
    { from: "n5", to: "n12", label: "invalid token (401)", kind: "error" },
    { from: "n6", to: "n7" },
    { from: "n7", to: "n8", label: "yes", kind: "success" },
    { from: "n7", to: "n12", label: "rule violation (422)", kind: "error" },
    { from: "n8", to: "n9" },
    { from: "n8", to: "n15", label: "emit audit", kind: "async", style: "dashed" },
    { from: "n9", to: "n10" },
    { from: "n9", to: "n14", label: "commit conflict", kind: "error", style: "dashed" },
    { from: "n14", to: "n8", label: "retry up to 3x", style: "dashed" },
    { from: "n10", to: "n11" },
  ];

  if (detail === "standard") {
    const keep = new Set([
      "n1",
      "n2",
      "n13",
      "n3",
      "n4",
      "n5",
      "n6",
      "n7",
      "n8",
      "n11",
      "n12",
    ]);
    edges = edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
    edges.push({ from: "n8", to: "n11", label: "yes", kind: "success" });
    return {
      title: `Flow: ${topic}`,
      summary: `End-to-end flow for ${topic}, with validation, authorization, business rules and failure handling.`,
      nodes: nodes.filter((node) => keep.has(node.id)),
      edges,
      suggestions: ["Add an error-code table", "Split the happy path from async work"],
    };
  }

  return {
    title: `Flow: ${topic}`,
    summary: `End-to-end flow for ${topic}, including rate limiting, authorization, business rules, retries and audit logging.`,
    nodes,
    edges,
    suggestions: [
      "Add a timeout and circuit-breaker path",
      "Annotate external service calls",
      "Split synchronous and asynchronous stages",
    ],
  };
}

function mindmapGraph(topic: string, detail: DetailLevel): DiagramGraph {
  const branchData = [
    {
      id: "b1",
      label: "Goals",
      detail: `What success looks like for ${topic}`,
      leaves: [
        { id: "g1", label: "Primary outcome", detail: "The measurable result the user wants" },
        { id: "g2", label: "Success metric", detail: "Activation, conversion or time saved" },
      ],
    },
    {
      id: "b2",
      label: "Users",
      detail: "Who is involved and what they need",
      leaves: [
        { id: "u1", label: "Core users", detail: "Daily operators with repeated tasks" },
        { id: "u2", label: "Edge users", detail: "Admins, auditors and support staff" },
      ],
    },
    {
      id: "b3",
      label: "Capabilities",
      detail: "What the solution must be able to do",
      leaves: [
        { id: "c1", label: "Core workflow", detail: "The main path from input to result" },
        { id: "c2", label: "Safety nets", detail: "Validation, retries and recovery" },
      ],
    },
    {
      id: "b4",
      label: "Risks",
      detail: "What could block or degrade the outcome",
      leaves: [
        { id: "r1", label: "Technical risk", detail: "Scaling, latency or data consistency" },
        { id: "r2", label: "Adoption risk", detail: "Habit change and training effort" },
      ],
    },
    {
      id: "b5",
      label: "Next steps",
      detail: "The smallest useful actions to start",
      leaves: [
        { id: "s1", label: "Prototype", detail: "Validate the riskiest assumption first" },
        { id: "s2", label: "Measure", detail: "Instrument the core funnel before launch" },
      ],
    },
  ];

  const branches = detail === "detailed" ? branchData : branchData.slice(0, 4);
  const nodes: GraphNode[] = [
    { id: "root", label: topic, detail: "Central topic", kind: "topic" },
  ];
  const edges: GraphEdge[] = [];

  branches.forEach((branch) => {
    nodes.push({
      id: branch.id,
      label: branch.label,
      detail: branch.detail,
      kind: "process",
    });
    edges.push({ from: "root", to: branch.id });

    const leaves = detail === "detailed" ? branch.leaves : branch.leaves.slice(0, 1);
    leaves.forEach((leaf) => {
      nodes.push({
        id: leaf.id,
        label: leaf.label,
        detail: leaf.detail,
        kind: "idea",
      });
      edges.push({ from: branch.id, to: leaf.id });
    });
  });

  return {
    title: `Mind map: ${topic}`,
    summary: `Branches for ${topic} covering goals, users, capabilities, risks and next steps.`,
    nodes,
    edges,
    suggestions: ["Add owners to next steps", "Turn risks into experiments"],
  };
}

function brainstormGraph(topic: string, detail: DetailLevel): DiagramGraph {
  const categories = [
    {
      label: "Objectives",
      ideas: [
        { id: "o1", label: "Clear success metric", detail: "Define the number that proves it worked" },
        { id: "o2", label: "Fast first win", detail: "Ship a narrow slice in the first week" },
        { id: "o3", label: "User delight", detail: "Remove one recurring frustration" },
      ],
    },
    {
      label: "Ideas",
      ideas: [
        { id: "i1", label: "Automate the boring part", detail: "Replace the manual hand-off" },
        { id: "i2", label: "Single source of truth", detail: "One shared record instead of copies" },
        { id: "i3", label: "Progressive disclosure", detail: "Show the next step, not the whole system" },
      ],
    },
    {
      label: "Risks",
      ideas: [
        { id: "r1", label: "Scope creep", detail: "Lock the first milestone explicitly" },
        { id: "r2", label: "Low adoption", detail: "Pair with an existing habit" },
        { id: "r3", label: "Hidden dependency", detail: "Map external systems before building" },
      ],
    },
    {
      label: "Next steps",
      ideas: [
        { id: "n1", label: "Interview 5 users", detail: "Validate the pain before designing" },
        { id: "n2", label: "Build a spike", detail: "Prove the riskiest technical piece" },
        { id: "n3", label: "Set a review date", detail: "Decide go/no-go with evidence" },
      ],
    },
  ];

  const active = detail === "detailed" ? categories : categories.slice(0, 3);
  const nodes: GraphNode[] = [
    { id: "goal", label: `Goal: ${topic}`, detail: "Shared objective for the session", kind: "topic" },
  ];
  const edges: GraphEdge[] = [];

  active.forEach((category) => {
    const ideas = detail === "detailed" ? category.ideas : category.ideas.slice(0, 2);
    ideas.forEach((idea, index) => {
      nodes.push({
        id: idea.id,
        label: idea.label,
        detail: idea.detail,
        kind: "idea",
        group: category.label,
      });
      if (index === 0) {
        edges.push({
          from: "goal",
          to: idea.id,
          label: category.label,
          kind: "default",
        });
      }
    });
  });

  return {
    title: `Brainstorm: ${topic}`,
    summary: `Grouped ideas for ${topic} across objectives, ideas, risks and next steps.`,
    nodes,
    edges,
    suggestions: ["Dot-vote the top three ideas", "Assign an owner to each next step"],
  };
}

function architectureGraph(topic: string, detail: DetailLevel): DiagramGraph {
  const nodes: GraphNode[] = [
    {
      id: "web",
      label: "Web client",
      detail: "React SPA, cache-first data fetching",
      kind: "actor",
      group: "Clients",
    },
    {
      id: "mobile",
      label: "Mobile client",
      detail: "iOS/Android, offline queue",
      kind: "actor",
      group: "Clients",
    },
    {
      id: "cdn",
      label: "CDN + WAF",
      detail: "Static assets, TLS, bot and DDoS filtering",
      kind: "process",
      group: "Edge",
    },
    {
      id: "gateway",
      label: "API gateway",
      detail: "Auth, rate limiting, request routing",
      kind: "process",
      group: "Edge",
    },
    {
      id: "auth",
      label: "Auth service",
      detail: "Sessions, OAuth, token rotation",
      kind: "process",
      group: "Services",
    },
    {
      id: "core",
      label: "Core API",
      detail: `${topic} domain logic and validation`,
      kind: "process",
      group: "Services",
    },
    {
      id: "worker",
      label: "Background worker",
      detail: "Idempotent jobs with retries",
      kind: "process",
      group: "Async",
    },
    {
      id: "scheduler",
      label: "Scheduler",
      detail: "Cron jobs and delayed retries",
      kind: "process",
      group: "Async",
    },
    {
      id: "bus",
      label: "Event bus",
      detail: "Durable topics with at-least-once delivery",
      kind: "data",
      group: "Async",
    },
    {
      id: "postgres",
      label: "Primary Postgres",
      detail: "Transactional source of truth",
      kind: "data",
      group: "Data",
    },
    {
      id: "redis",
      label: "Redis cache",
      detail: "Sessions, rate limits, hot reads",
      kind: "data",
      group: "Data",
    },
    {
      id: "objects",
      label: "Object storage",
      detail: "Uploads and exports with signed URLs",
      kind: "data",
      group: "Data",
    },
    {
      id: "notify",
      label: "Notification service",
      detail: "Email and push fan-out",
      kind: "process",
      group: "Services",
    },
  ];

  const edges: GraphEdge[] = [
    { from: "web", to: "cdn", label: "HTTPS" },
    { from: "mobile", to: "cdn", label: "HTTPS" },
    { from: "cdn", to: "gateway", label: "dynamic requests" },
    { from: "gateway", to: "auth", label: "verify session" },
    { from: "gateway", to: "core", label: "routed calls" },
    { from: "core", to: "postgres", label: "read/write" },
    { from: "core", to: "redis", label: "cache + limits" },
    { from: "core", to: "objects", label: "signed uploads" },
    { from: "core", to: "bus", label: "publish events", kind: "async", style: "dashed" },
    { from: "bus", to: "worker", label: "consume", kind: "async", style: "dashed" },
    { from: "worker", to: "postgres", label: "job state" },
    { from: "worker", to: "notify", label: "send" },
    { from: "scheduler", to: "worker", label: "enqueue" },
    { from: "auth", to: "postgres", label: "users" },
    { from: "auth", to: "redis", label: "sessions" },
  ];

  if (detail === "standard") {
    const keep = new Set([
      "web",
      "mobile",
      "cdn",
      "gateway",
      "auth",
      "core",
      "bus",
      "worker",
      "postgres",
      "redis",
    ]);
    return {
      title: `Architecture: ${topic}`,
      summary: `Layered architecture for ${topic}: clients, edge, services, async workers and data stores.`,
      nodes: nodes.filter((node) => keep.has(node.id)),
      edges: edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to)),
      suggestions: ["Add failure modes per hop", "Mark trust boundaries"],
    };
  }

  return {
    title: `Architecture: ${topic}`,
    summary: `Layered architecture for ${topic} with clients, edge protection, services, async processing and data stores.`,
    nodes,
    edges,
    suggestions: ["Add observability per service", "Mark trust boundaries", "Annotate retry and timeout budgets"],
  };
}

export function buildFallbackGraph(
  prompt: string,
  type: DiagramType,
  detail: DetailLevel
): DiagramGraph {
  const topic = shortTopic(prompt);
  switch (type) {
    case "flowchart":
      return flowchartGraph(topic, detail);
    case "mindmap":
      return mindmapGraph(topic, detail);
    case "brainstorm":
      return brainstormGraph(topic, detail);
    default:
      return architectureGraph(topic, detail);
  }
}
