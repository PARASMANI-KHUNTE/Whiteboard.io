import type { DiagramDirection, DiagramGraph, DiagramType, GraphEdge, GraphNode } from "./types";

export type Side = "top" | "right" | "bottom" | "left";

export interface LayoutNode {
  node: GraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
  colorIndex: number;
}

export interface LayoutHeader {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "group" | "title";
}

export interface LayoutEdge {
  edge: GraphEdge;
  fromAnchor?: Side;
  toAnchor?: Side;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  headers: LayoutHeader[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

interface NodeSize {
  width: number;
  height: number;
}

interface InternalLayout {
  nodes: LayoutNode[];
  headers: LayoutHeader[];
  edges: LayoutEdge[];
}

interface Point {
  x: number;
  y: number;
}

const FONT_CHAR_WIDTH = 7.3;
const MIN_NODE_WIDTH = 188;
const MAX_NODE_WIDTH = 306;
const DEFAULT_STICKY_WIDTH = 224;
const DEFAULT_STICKY_HEIGHT = 178;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function measureNode(node: GraphNode, type: DiagramType): NodeSize {
  if (node.kind === "note" || node.kind === "idea" || type === "brainstorm") {
    return { width: DEFAULT_STICKY_WIDTH, height: DEFAULT_STICKY_HEIGHT };
  }

  const detail = node.kind === "decision" || node.kind === "start" || node.kind === "end"
    ? ""
    : node.detail || "";

  const labelLength = node.label.length;
  const detailLength = detail.length;
  const longest = Math.max(labelLength, Math.min(detailLength, 64));
  let width = clampNumber(
    longest * FONT_CHAR_WIDTH + 52,
    MIN_NODE_WIDTH,
    MAX_NODE_WIDTH
  );

  if (node.kind === "start" || node.kind === "end") width = Math.max(width, 196);
  if (node.kind === "decision") width = Math.max(width, 212);
  if (node.kind === "topic") width = Math.max(width, 236);

  const charsPerLine = Math.max(12, Math.floor((width - 44) / FONT_CHAR_WIDTH));
  const labelLines = Math.max(1, Math.ceil(labelLength / charsPerLine));
  const detailLines = detailLength > 0 ? Math.ceil(detailLength / charsPerLine) : 0;
  let height = 34 + (labelLines + detailLines) * 20 + (detailLines > 0 ? 10 : 0) + 18;

  if (node.kind === "start" || node.kind === "end") height = Math.max(66, Math.min(96, height));
  if (node.kind === "decision") height = Math.max(112, Math.min(150, height + 18));
  if (node.kind === "topic") height = Math.max(104, Math.min(150, height));
  if (node.kind === "actor" || node.kind === "data") height = Math.max(84, height);
  height = clampNumber(height, 70, 196);

  return { width: Math.round(width), height: Math.round(height) };
}

function groupOrderOf(nodes: GraphNode[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  nodes.forEach((node) => {
    const group = (node.group || "").trim();
    if (!group || seen.has(group)) return;
    seen.add(group);
    order.push(group);
  });
  return order;
}

function colorIndexFor(group: string | undefined, groups: string[]): number {
  if (!group) return 0;
  const index = groups.indexOf(group.trim());
  return index >= 0 ? index : 0;
}

// ---------------------------------------------------------------------------
// Layered DAG layout (flowchart + ungrouped architecture)
// ---------------------------------------------------------------------------

function layoutLayered(
  graph: DiagramGraph,
  direction: DiagramDirection,
  sizes: Map<string, NodeSize>,
  groups: string[]
): InternalLayout {
  const nodes = graph.nodes;
  const edges = graph.edges;
  const nodeIds = new Set(nodes.map((node) => node.id));

  const adjacency = new Map<string, string[]>();
  nodes.forEach((node) => adjacency.set(node.id, []));
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.push(edge.to);
  });

  // DFS back-edge detection. Back edges are drawn as loops and excluded from
  // rank computation so cycles cannot make the layered layout collapse.
  const state = new Map<string, 0 | 1 | 2>();
  const backEdges = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const target of adjacency.get(id) ?? []) {
      if (!nodeIds.has(target)) continue;
      if (state.get(target) === 1) {
        backEdges.add(`${id}|${target}`);
      } else if (!state.get(target)) {
        visit(target);
      }
    }
    state.set(id, 2);
  };
  nodes.forEach((node) => {
    if (!state.get(node.id)) visit(node.id);
  });

  const forwardEdges = edges.filter(
    (edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to) && !backEdges.has(`${edge.from}|${edge.to}`)
  );

  const forwardAdjacency = new Map<string, string[]>();
  const predecessorMap = new Map<string, string[]>();
  const successorMap = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  nodes.forEach((node) => {
    forwardAdjacency.set(node.id, []);
    predecessorMap.set(node.id, []);
    successorMap.set(node.id, []);
    inDegree.set(node.id, 0);
  });
  forwardEdges.forEach((edge) => {
    forwardAdjacency.get(edge.from)?.push(edge.to);
    predecessorMap.get(edge.to)?.push(edge.from);
    successorMap.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  });

  const rank = new Map<string, number>();
  const queue = nodes.filter((node) => (inDegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  queue.forEach((id) => rank.set(id, 0));
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const currentRank = rank.get(id) ?? 0;
    for (const target of forwardAdjacency.get(id) ?? []) {
      rank.set(target, Math.max(rank.get(target) ?? 0, currentRank + 1));
      const nextDegree = (inDegree.get(target) ?? 1) - 1;
      inDegree.set(target, nextDegree);
      if (nextDegree === 0) queue.push(target);
    }
  }
  nodes.forEach((node) => {
    if (!rank.has(node.id)) rank.set(node.id, 0);
  });

  const inputOrder = new Map<string, number>();
  nodes.forEach((node, index) => inputOrder.set(node.id, index));

  const buckets = new Map<number, string[]>();
  nodes.forEach((node) => {
    const value = rank.get(node.id) ?? 0;
    const bucket = buckets.get(value);
    if (bucket) bucket.push(node.id);
    else buckets.set(value, [node.id]);
  });
  const rankKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  rankKeys.forEach((key) => {
    buckets.get(key)?.sort((a, b) => (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0));
  });

  // A few barycenter sweeps materially reduce edge crossings.
  const positionsOf = (key: number): Map<string, number> => {
    const map = new Map<string, number>();
    (buckets.get(key) ?? []).forEach((id, index) => map.set(id, index));
    return map;
  };

  const averagePosition = (id: string, neighbors: string[], positions: Map<string, number>): number => {
    const values = neighbors
      .map((neighbor) => positions.get(neighbor))
      .filter((value): value is number => value !== undefined);
    if (values.length === 0) return positions.get(id) ?? 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  for (let pass = 0; pass < 4; pass++) {
    for (let index = 1; index < rankKeys.length; index++) {
      const key = rankKeys[index];
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const previousPositions = positionsOf(rankKeys[index - 1]);
      const baseline = new Map(bucket.map((id, position) => [id, position]));
      bucket.sort((a, b) => {
        const scoreA = averagePosition(a, predecessorMap.get(a) ?? [], previousPositions);
        const scoreB = averagePosition(b, predecessorMap.get(b) ?? [], previousPositions);
        return scoreA - scoreB || (baseline.get(a) ?? 0) - (baseline.get(b) ?? 0);
      });
    }

    for (let index = rankKeys.length - 2; index >= 0; index--) {
      const key = rankKeys[index];
      const bucket = buckets.get(key);
      if (!bucket) continue;
      const nextPositions = positionsOf(rankKeys[index + 1]);
      const baseline = new Map(bucket.map((id, position) => [id, position]));
      bucket.sort((a, b) => {
        const scoreA = averagePosition(a, successorMap.get(a) ?? [], nextPositions);
        const scoreB = averagePosition(b, successorMap.get(b) ?? [], nextPositions);
        return scoreA - scoreB || (baseline.get(a) ?? 0) - (baseline.get(b) ?? 0);
      });
    }
  }

  const horizontalGap = 88;
  const verticalGap = 108;
  const positions = new Map<string, Point>();

  const sizeOf = (id: string): NodeSize => sizes.get(id) ?? { width: 200, height: 96 };

  if (direction === "vertical") {
    let y = 0;
    const rowY = new Map<number, number>();
    const rowHeights = new Map<number, number>();

    rankKeys.forEach((key) => {
      const ids = buckets.get(key) ?? [];
      const rowHeight = Math.max(...ids.map((id) => sizeOf(id).height), 70);
      rowHeights.set(key, rowHeight);
      rowY.set(key, y);
      y += rowHeight + verticalGap;
    });

    rankKeys.forEach((key) => {
      const ids = buckets.get(key) ?? [];
      const rowHeight = rowHeights.get(key) ?? 70;
      const totalWidth =
        ids.reduce((sum, id) => sum + sizeOf(id).width, 0) +
        Math.max(0, ids.length - 1) * horizontalGap;
      let x = -totalWidth / 2;
      ids.forEach((id) => {
        const size = sizeOf(id);
        positions.set(id, {
          x,
          y: (rowY.get(key) ?? 0) + (rowHeight - size.height) / 2,
        });
        x += size.width + horizontalGap;
      });
    });
  } else {
    let x = 0;
    const columnX = new Map<number, number>();
    const columnWidths = new Map<number, number>();

    rankKeys.forEach((key) => {
      const ids = buckets.get(key) ?? [];
      const columnWidth = Math.max(...ids.map((id) => sizeOf(id).width), 80);
      columnWidths.set(key, columnWidth);
      columnX.set(key, x);
      x += columnWidth + horizontalGap;
    });

    rankKeys.forEach((key) => {
      const ids = buckets.get(key) ?? [];
      const columnWidth = columnWidths.get(key) ?? 80;
      const totalHeight =
        ids.reduce((sum, id) => sum + sizeOf(id).height, 0) +
        Math.max(0, ids.length - 1) * verticalGap;
      let y = -totalHeight / 2;
      ids.forEach((id) => {
        const size = sizeOf(id);
        positions.set(id, {
          x: (columnX.get(key) ?? 0) + (columnWidth - size.width) / 2,
          y,
        });
        y += size.height + verticalGap;
      });
    });
  }

  const layoutNodes: LayoutNode[] = nodes.map((node) => {
    const size = sizeOf(node.id);
    const point = positions.get(node.id) ?? { x: 0, y: 0 };
    return {
      node,
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height,
      colorIndex: colorIndexFor(node.group, groups),
    };
  });

  const layoutEdges: LayoutEdge[] = edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .map((edge) => {
      const fromRank = rank.get(edge.from) ?? 0;
      const toRank = rank.get(edge.to) ?? 0;
      const fromPoint = positions.get(edge.from) ?? { x: 0, y: 0 };
      const toPoint = positions.get(edge.to) ?? { x: 0, y: 0 };
      const isBackEdge = backEdges.has(`${edge.from}|${edge.to}`);

      if (direction === "vertical") {
        if (isBackEdge || toRank < fromRank) {
          const dx = toPoint.x - fromPoint.x;
          return dx >= 0
            ? { edge, fromAnchor: "right" as Side, toAnchor: "right" as Side }
            : { edge, fromAnchor: "left" as Side, toAnchor: "left" as Side };
        }
        if (toRank === fromRank) {
          return toPoint.x >= fromPoint.x
            ? { edge, fromAnchor: "right" as Side, toAnchor: "left" as Side }
            : { edge, fromAnchor: "left" as Side, toAnchor: "right" as Side };
        }
        return { edge, fromAnchor: "bottom" as Side, toAnchor: "top" as Side };
      }

      if (isBackEdge || toRank < fromRank) {
        return { edge, fromAnchor: "bottom" as Side, toAnchor: "bottom" as Side };
      }
      if (toRank === fromRank) {
        return toPoint.y >= fromPoint.y
          ? { edge, fromAnchor: "bottom" as Side, toAnchor: "top" as Side }
          : { edge, fromAnchor: "top" as Side, toAnchor: "bottom" as Side };
      }
      return { edge, fromAnchor: "right" as Side, toAnchor: "left" as Side };
    });

  return { nodes: layoutNodes, headers: [], edges: layoutEdges };
}

// ---------------------------------------------------------------------------
// Lane layout for architecture: one band per named layer/group
// ---------------------------------------------------------------------------

function layoutLanes(
  graph: DiagramGraph,
  direction: DiagramDirection,
  sizes: Map<string, NodeSize>,
  groups: string[]
): InternalLayout | null {
  if (groups.length < 2) return null;

  const grouped = new Map<string, string[]>();
  groups.forEach((group) => grouped.set(group, []));
  const ungrouped: string[] = [];

  graph.nodes.forEach((node) => {
    const group = (node.group || "").trim();
    if (group && grouped.has(group)) grouped.get(group)?.push(node.id);
    else ungrouped.push(node.id);
  });

  const laneOrder = groups.filter((group) => (grouped.get(group) ?? []).length > 0);
  if (ungrouped.length > 0) {
    grouped.set("Shared", ungrouped);
    laneOrder.push("Shared");
  }
  if (laneOrder.length < 2) return null;

  const sizeOf = (id: string): NodeSize => sizes.get(id) ?? { width: 200, height: 96 };
  const positions = new Map<string, Point>();
  const headers: LayoutHeader[] = [];

  const headerWidth = (text: string) =>
    Math.round(clampNumber(text.length * 8.4 + 18, 96, 240));

  if (direction === "vertical") {
    const nodeGap = 66;
    const laneGap = 92;
    let y = 0;

    laneOrder.forEach((group) => {
      const ids = grouped.get(group) ?? [];
      if (ids.length === 0) return;
      const rowHeight = Math.max(...ids.map((id) => sizeOf(id).height), 70);
      const rowWidth =
        ids.reduce((sum, id) => sum + sizeOf(id).width, 0) +
        Math.max(0, ids.length - 1) * nodeGap;
      let x = -rowWidth / 2;
      ids.forEach((id) => {
        const size = sizeOf(id);
        positions.set(id, { x, y: y + (rowHeight - size.height) / 2 });
        x += size.width + nodeGap;
      });

      const width = headerWidth(group);
      headers.push({
        text: group,
        x: -rowWidth / 2 - width - 30,
        y: y + (rowHeight - 24) / 2,
        width,
        height: 24,
        kind: "group",
      });

      y += rowHeight + laneGap;
    });
  } else {
    const nodeGap = 42;
    const laneGap = 88;
    let x = 0;

    laneOrder.forEach((group) => {
      const ids = grouped.get(group) ?? [];
      if (ids.length === 0) return;
      const columnWidth = Math.max(...ids.map((id) => sizeOf(id).width), 80);
      const columnHeight =
        ids.reduce((sum, id) => sum + sizeOf(id).height, 0) +
        Math.max(0, ids.length - 1) * nodeGap;
      let y = -columnHeight / 2;
      ids.forEach((id) => {
        const size = sizeOf(id);
        positions.set(id, { x: x + (columnWidth - size.width) / 2, y });
        y += size.height + nodeGap;
      });

      headers.push({
        text: group,
        x,
        y: -columnHeight / 2 - 38,
        width: columnWidth,
        height: 24,
        kind: "group",
      });

      x += columnWidth + laneGap;
    });
  }

  const layoutNodes: LayoutNode[] = graph.nodes.map((node) => {
    const size = sizeOf(node.id);
    const point = positions.get(node.id) ?? { x: 0, y: 0 };
    return {
      node,
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height,
      colorIndex: colorIndexFor(node.group, groups),
    };
  });

  const positionById = new Map(layoutNodes.map((node) => [node.node.id, node]));
  const layoutEdges: LayoutEdge[] = graph.edges
    .filter((edge) => positionById.has(edge.from) && positionById.has(edge.to))
    .map((edge) => {
      const from = positionById.get(edge.from);
      const to = positionById.get(edge.to);
      if (!from || !to) return { edge };
      const dx = to.x + to.width / 2 - (from.x + from.width / 2);
      const dy = to.y + to.height / 2 - (from.y + from.height / 2);

      if (Math.abs(dy) >= Math.abs(dx)) {
        return dy >= 0
          ? { edge, fromAnchor: "bottom" as Side, toAnchor: "top" as Side }
          : { edge, fromAnchor: "top" as Side, toAnchor: "bottom" as Side };
      }
      return dx >= 0
        ? { edge, fromAnchor: "right" as Side, toAnchor: "left" as Side }
        : { edge, fromAnchor: "left" as Side, toAnchor: "right" as Side };
    });

  return { nodes: layoutNodes, headers, edges: layoutEdges };
}

// ---------------------------------------------------------------------------
// Radial tree layout for mind maps
// ---------------------------------------------------------------------------

function layoutRadial(
  graph: DiagramGraph,
  sizes: Map<string, NodeSize>,
  groups: string[]
): InternalLayout {
  const nodes = graph.nodes;
  if (nodes.length === 0) return { nodes: [], headers: [], edges: [] };

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const undirected = new Map<string, string[]>();
  nodes.forEach((node) => undirected.set(node.id, []));
  graph.edges.forEach((edge) => {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) return;
    undirected.get(edge.from)?.push(edge.to);
    undirected.get(edge.to)?.push(edge.from);
  });

  const inputOrder = new Map<string, number>();
  nodes.forEach((node, index) => inputOrder.set(node.id, index));

  const root =
    nodes.find((node) => node.kind === "topic") ??
    nodes.find((node) => (undirected.get(node.id) ?? []).length > 0) ??
    nodes[0];

  const depth = new Map<string, number>([[root.id, 0]]);
  const children = new Map<string, string[]>();
  nodes.forEach((node) => children.set(node.id, []));
  const queue: string[] = [root.id];

  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const neighbors = [...(undirected.get(id) ?? [])].sort(
      (a, b) => (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0)
    );
    for (const neighbor of neighbors) {
      if (depth.has(neighbor)) continue;
      depth.set(neighbor, (depth.get(id) ?? 0) + 1);
      children.get(id)?.push(neighbor);
      queue.push(neighbor);
    }
  }

  // Disconnected leftovers are attached to the root and then positioned on an
  // outer ring so they remain readable instead of collapsing onto the centre.
  const unvisited = nodes.filter((node) => !depth.has(node.id));
  unvisited.forEach((node) => {
    depth.set(node.id, 1);
    children.get(root.id)?.push(node.id);
  });

  const leafCountMemo = new Map<string, number>();
  const leafCount = (id: string): number => {
    const cached = leafCountMemo.get(id);
    if (cached !== undefined) return cached;
    const kids = children.get(id) ?? [];
    const count = kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + leafCount(kid), 0);
    leafCountMemo.set(id, count);
    return count;
  };

  const angle = new Map<string, number>([[root.id, 0]]);
  const assignAngles = (id: string, start: number, end: number) => {
    const kids = children.get(id) ?? [];
    const total = kids.reduce((sum, kid) => sum + leafCount(kid), 0);
    if (total === 0) return;
    let cursor = start;
    kids.forEach((kid) => {
      const span = ((end - start) * leafCount(kid)) / total;
      angle.set(kid, cursor + span / 2);
      assignAngles(kid, cursor, cursor + span);
      cursor += span;
    });
  };
  assignAngles(root.id, 0, Math.PI * 2);

  const maxDepth = Math.max(...Array.from(depth.values()), 0);
  const maxDimension = new Map<number, number>();
  nodes.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    const size = sizes.get(node.id) ?? { width: 200, height: 96 };
    maxDimension.set(level, Math.max(maxDimension.get(level) ?? 0, Math.max(size.width, size.height)));
  });

  const radius: number[] = [0];
  for (let level = 1; level <= maxDepth; level++) {
    const previous = radius[level - 1] ?? 0;
    radius[level] =
      previous +
      (maxDimension.get(level - 1) ?? 120) / 2 +
      (maxDimension.get(level) ?? 120) / 2 +
      122;
  }

  // Branch colours: every direct child of the root starts a colour family.
  const branchColor = new Map<string, number>();
  branchColor.set(root.id, 0);
  (children.get(root.id) ?? []).forEach((childId, index) => {
    const stack = [childId];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      branchColor.set(id, (index % 6) + 1);
      for (const kid of children.get(id) ?? []) stack.push(kid);
    }
  });

  const positions = new Map<string, Point>();
  const ringAngles = new Map<string, number>();
  if (unvisited.length > 0) {
    unvisited.forEach((node, index) => {
      ringAngles.set(node.id, (index / Math.max(1, unvisited.length)) * Math.PI * 2);
    });
  }

  nodes.forEach((node) => {
    const level = depth.get(node.id) ?? 0;
    if (level === 0) {
      positions.set(node.id, { x: 0, y: 0 });
      return;
    }
    if (ringAngles.has(node.id)) return;
    const value = angle.get(node.id) ?? 0;
    const distance = radius[level] ?? 300;
    positions.set(node.id, {
      x: Math.cos(value) * distance * 1.06,
      y: Math.sin(value) * distance,
    });
  });

  const outerRadius = (radius[radius.length - 1] ?? 320) + 260;
  unvisited.forEach((node) => {
    const value = ringAngles.get(node.id) ?? 0;
    positions.set(node.id, {
      x: Math.cos(value) * outerRadius,
      y: Math.sin(value) * outerRadius,
    });
  });

  const layoutNodes: LayoutNode[] = nodes.map((node) => {
    const size = sizes.get(node.id) ?? { width: 200, height: 96 };
    const center = positions.get(node.id) ?? { x: 0, y: 0 };
    const groupIndex = colorIndexFor(node.group, groups);
    return {
      node,
      x: center.x - size.width / 2,
      y: center.y - size.height / 2,
      width: size.width,
      height: size.height,
      colorIndex: colorIndexFor(node.group, groups) || branchColor.get(node.id) || groupIndex,
    };
  });

  const layoutEdges: LayoutEdge[] = graph.edges
    .filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to))
    .map((edge) => ({ edge }));

  return { nodes: layoutNodes, headers: [], edges: layoutEdges };
}

// ---------------------------------------------------------------------------
// Column / row layout for brainstorm boards
// ---------------------------------------------------------------------------

function layoutBrainstorm(
  graph: DiagramGraph,
  direction: DiagramDirection,
  sizes: Map<string, NodeSize>,
  groups: string[]
): InternalLayout {
  const goal =
    graph.nodes.find((node) => node.kind === "topic") ??
    graph.nodes.find((node) => node.kind === "start") ??
    null;
  const ideaNodes = graph.nodes.filter((node) => node !== goal);

  const grouped = new Map<string, string[]>();
  const order: string[] = [];
  const ungrouped: string[] = [];

  ideaNodes.forEach((node) => {
    const group = (node.group || "").trim();
    if (!group) {
      ungrouped.push(node.id);
      return;
    }
    if (!grouped.has(group)) {
      grouped.set(group, []);
      order.push(group);
    }
    grouped.get(group)?.push(node.id);
  });

  if (order.length === 0 && ungrouped.length > 0) {
    const fallback = ["Ideas", "Considerations", "Next steps"];
    const columnCount = Math.min(fallback.length, Math.max(1, Math.ceil(ungrouped.length / 3)));
    for (let index = 0; index < columnCount; index++) {
      order.push(fallback[index]);
      grouped.set(fallback[index], []);
    }
    ungrouped.forEach((id, index) => {
      const group = order[index % order.length];
      grouped.get(group)?.push(id);
    });
  } else if (ungrouped.length > 0) {
    grouped.set("More ideas", ungrouped);
    order.push("More ideas");
  }

  const laneOrder = order.filter((group) => (grouped.get(group) ?? []).length > 0);
  const sizeOf = (id: string): NodeSize => sizes.get(id) ?? { width: 200, height: 96 };
  const positions = new Map<string, Point>();
  const headers: LayoutHeader[] = [];

  const headerWidth = (text: string) =>
    Math.round(clampNumber(text.length * 8.6 + 20, 110, 260));

  if (direction === "vertical") {
    const columnGap = 62;
    const nodeGap = 26;
    const headerHeight = 26;
    const contentTop = 58;

    const columnWidths = laneOrder.map((group) =>
      Math.max(
        headerWidth(group),
        ...(grouped.get(group) ?? []).map((id) => sizeOf(id).width)
      )
    );
    const totalWidth =
      columnWidths.reduce((sum, width) => sum + width, 0) +
      Math.max(0, laneOrder.length - 1) * columnGap;
    let x = -totalWidth / 2;

    laneOrder.forEach((group, columnIndex) => {
      const ids = grouped.get(group) ?? [];
      const columnWidth = columnWidths[columnIndex];
      const width = headerWidth(group);

      headers.push({
        text: group,
        x: x + (columnWidth - width) / 2,
        y: 0,
        width,
        height: headerHeight,
        kind: "group",
      });

      let y = contentTop;
      ids.forEach((id) => {
        const size = sizeOf(id);
        positions.set(id, { x: x + (columnWidth - size.width) / 2, y });
        y += size.height + nodeGap;
      });

      x += columnWidth + columnGap;
    });
  } else {
    const rowGap = 34;
    const nodeGap = 24;
    const headerWidthMax = Math.max(...laneOrder.map((group) => headerWidth(group)), 110);

    let y = 0;
    laneOrder.forEach((group) => {
      const ids = grouped.get(group) ?? [];
      const rowHeight = Math.max(...ids.map((id) => sizeOf(id).height), 70);
      const width = headerWidth(group);

      headers.push({
        text: group,
        x: 0,
        y: y + (rowHeight - 24) / 2,
        width,
        height: 24,
        kind: "group",
      });

      let x = headerWidthMax + 28;
      ids.forEach((id) => {
        const size = sizeOf(id);
        positions.set(id, { x, y: y + (rowHeight - size.height) / 2 });
        x += size.width + nodeGap;
      });

      y += rowHeight + rowGap;
    });
  }

  const layoutNodes: LayoutNode[] = graph.nodes.map((node) => {
    const size = sizeOf(node.id);
    const point = positions.get(node.id) ?? { x: 0, y: 0 };
    return {
      node,
      x: point.x,
      y: point.y,
      width: size.width,
      height: size.height,
      colorIndex: node === goal ? 0 : colorIndexFor(node.group, groups) + 1,
    };
  });

  if (goal) {
    const goalLayout = layoutNodes.find((node) => node.node.id === goal.id);
    if (goalLayout) {
      if (direction === "vertical") {
        const laneWidth = Math.max(
          ...layoutNodes
            .filter((node) => node.node.id !== goal.id)
            .map((node) => node.x + node.width),
          0
        );
        const laneMin = Math.min(
          ...layoutNodes
            .filter((node) => node.node.id !== goal.id)
            .map((node) => node.x),
          0
        );
        goalLayout.x = (laneMin + laneWidth) / 2 - goalLayout.width / 2;
        goalLayout.y = -goalLayout.height - 42;
      } else {
        goalLayout.x = 0;
        goalLayout.y = -goalLayout.height - 42;
      }
    }
  }

  const positionById = new Map(layoutNodes.map((node) => [node.node.id, node]));
  const layoutEdges: LayoutEdge[] = graph.edges
    .filter((edge) => positionById.has(edge.from) && positionById.has(edge.to))
    .map((edge) => ({ edge }));

  return { nodes: layoutNodes, headers, edges: layoutEdges };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

function finalize(layout: InternalLayout): LayoutResult {
  const all = [...layout.nodes, ...layout.headers];
  if (all.length === 0) {
    return { ...layout, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  all.forEach((item) => {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.width);
    maxY = Math.max(maxY, item.y + item.height);
  });

  const shiftX = -minX;
  const shiftY = -minY;

  layout.nodes.forEach((node) => {
    node.x += shiftX;
    node.y += shiftY;
  });
  layout.headers.forEach((header) => {
    header.x += shiftX;
    header.y += shiftY;
  });

  return {
    ...layout,
    width: Math.max(1, Math.round(maxX - minX)),
    height: Math.max(1, Math.round(maxY - minY)),
  };
}

export function layoutGraph(
  graph: DiagramGraph,
  type: DiagramType,
  direction: DiagramDirection
): LayoutResult {
  const sizes = new Map<string, NodeSize>();
  graph.nodes.forEach((node) => sizes.set(node.id, measureNode(node, type)));
  const groups = groupOrderOf(graph.nodes);

  let internal: InternalLayout;

  if (type === "mindmap") {
    internal = layoutRadial(graph, sizes, groups);
  } else if (type === "brainstorm") {
    internal = layoutBrainstorm(graph, direction, sizes, groups);
  } else if (type === "architecture") {
    internal = layoutLanes(graph, direction, sizes, groups) ?? layoutLayered(graph, direction, sizes, groups);
  } else {
    internal = layoutLayered(graph, direction, sizes, groups);
  }

  return finalize(internal);
}
