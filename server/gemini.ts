import crypto from "crypto";

export type DiagramType = "mindmap" | "flowchart" | "brainstorm" | "architecture";

export interface CanvasCenter {
  x: number;
  y: number;
}

export interface RawAiNode {
  type: "sticky" | "shape" | "text";
  shapeType?: "rectangle" | "circle" | "diamond" | "arrow" | "triangle" | "star";
  label: string;
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
  color?: string;
  fillColor?: string;
}

export interface AiDiagramResult {
  elements: any[];
  title: string;
  summary: string;
  fromCache?: boolean;
  isFallback?: boolean;
}

// ---------------------------------------------------------------------------
// 1. IN-MEMORY RESPONSE CACHE (Reduces Gemini API calls to 0 for repeated prompts)
// ---------------------------------------------------------------------------
interface CachedDiagram {
  title: string;
  summary: string;
  nodes: RawAiNode[];
  timestamp: number;
}

const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const diagramCache = new Map<string, CachedDiagram>();

// Clean up stale cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of diagramCache.entries()) {
    if (now - item.timestamp > CACHE_TTL_MS) {
      diagramCache.delete(key);
    }
  }
}, 10 * 60 * 1000);

function getCacheKey(prompt: string, type: DiagramType): string {
  return `${type}:${prompt.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// 2. REQUEST THROTTLING QUEUE (Guarantees we never exceed Gemini RPM limits)
// ---------------------------------------------------------------------------
// Gemini free tier permits ~15 requests per minute.
// We enforce a minimum spacing of 3,000ms between outbound calls.
const MIN_REQUEST_INTERVAL_MS = 3000;
let lastOutboundTime = 0;
let queuePromise: Promise<void> = Promise.resolve();

function scheduleThrottledTask<T>(task: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const now = Date.now();
    const elapsed = now - lastOutboundTime;
    const waitTime = Math.max(0, MIN_REQUEST_INTERVAL_MS - elapsed);
    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    lastOutboundTime = Date.now();
    return task();
  };

  const nextPromise = queuePromise.then(run, run);
  queuePromise = nextPromise.then(() => {}, () => {});
  return nextPromise;
}

// ---------------------------------------------------------------------------
// 3. GEMINI SYSTEM INSTRUCTION & JSON SCHEMA
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are an expert visual diagram architect for a collaborative whiteboard application.
Given a user prompt and diagram type, generate a structured layout of visual elements with spatial coordinates.

Coordinate Rules:
- The central or starting point is at offset (0, 0).
- All xOffset and yOffset values must be relative to (0, 0).
- 'mindmap': Place main topic at center (0, 0), and distribute subtopics radially or horizontally around it (offsets between -500 and +500). Connect branches with arrow shapes.
- 'flowchart': Arrange steps sequentially (top-to-bottom or left-to-right) with clean spacing (e.g. 150px gap). Use 'circle' for Start/End, 'rectangle' for Process steps, 'diamond' for Decision points, and 'arrow' for transitions.
- 'brainstorm': Arrange sticky notes into neat columns or clusters (e.g. SWOT: Strengths, Weaknesses, Opportunities, Threats or Kanban: To Do, In Progress, Done) with headers.
- 'architecture': Arrange layers (Clients, API Gateway, Microservices, Databases, Cache) horizontally or vertically with boxes and connecting arrows.

Colors must be aesthetically curated modern HEX values:
- Sticky notes: soft pastels like '#fef08a', '#fed7aa', '#bbf7d0', '#bae6fd', '#fbcfe8', '#e9d5ff'.
- Shapes: border colors like '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#0f172a' with translucent fill colors or transparent fills.
`;

const JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    nodes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["sticky", "shape", "text"] },
          shapeType: { type: "STRING", enum: ["rectangle", "circle", "diamond", "arrow", "triangle", "star"] },
          label: { type: "STRING" },
          xOffset: { type: "NUMBER" },
          yOffset: { type: "NUMBER" },
          width: { type: "NUMBER" },
          height: { type: "NUMBER" },
          color: { type: "STRING" },
          fillColor: { type: "STRING" },
        },
        required: ["type", "label", "xOffset", "yOffset", "width", "height"],
      },
    },
  },
  required: ["title", "summary", "nodes"],
};

// ---------------------------------------------------------------------------
// 4. EXPONENTIAL BACKOFF CALLER WITH RETRIES
// ---------------------------------------------------------------------------
async function callGeminiWithRetry(apiKey: string, prompt: string, diagramType: DiagramType, maxRetries = 3): Promise<any> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Generate a detailed ${diagramType} diagram for the following prompt: "${prompt}". Provide 6 to 16 well-structured nodes with optimal visual spacing.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: JSON_SCHEMA,
      temperature: 0.3,
    },
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      // Handle Rate Limiting (429) or temporary server unavailability (503)
      if (response.status === 429 || response.status === 503) {
        if (attempt === maxRetries) {
          throw new Error(`Gemini rate limit exceeded after ${maxRetries} retry attempts (HTTP ${response.status}).`);
        }
        // Exponential backoff: 2s, 4s, 8s + random jitter
        const delayMs = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
        console.warn(`[Gemini Rate Limit]: Hit ${response.status}. Backing off for ${delayMs}ms before attempt ${attempt + 1}...`);
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }

      const data = await response.json();
      if (!response.ok || !data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const errorMsg = data.error?.message || response.statusText || "Failed to generate diagram from Gemini";
        throw new Error(`Gemini API Error: ${errorMsg}`);
      }

      const rawJson = data.candidates[0].content.parts[0].text;
      return JSON.parse(rawJson);
    } catch (err: any) {
      if (attempt === maxRetries || err.message?.includes("not configured")) {
        throw err;
      }
      const delayMs = 1500 * attempt;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  throw new Error("Gemini API call failed after multiple retry attempts");
}

// ---------------------------------------------------------------------------
// 5. PROCEDURAL FALLBACK GENERATOR (Guarantees zero downtime if quota is exhausted)
// ---------------------------------------------------------------------------
function generateProceduralFallback(prompt: string, type: DiagramType): { title: string; summary: string; nodes: RawAiNode[] } {
  const title = prompt.length > 40 ? prompt.substring(0, 40) + "..." : prompt;
  const nodes: RawAiNode[] = [];

  if (type === "mindmap") {
    nodes.push({ type: "shape", shapeType: "circle", label: title, xOffset: 0, yOffset: 0, width: 180, height: 80, color: "#4f46e5", fillColor: "rgba(79, 70, 229, 0.1)" });
    const subtopics = ["Key Objectives", "Architecture & Tech", "Implementation Steps", "Risks & Mitigations"];
    const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    subtopics.forEach((sub, i) => {
      const radius = 260;
      const x = Math.round(Math.cos(angles[i]) * radius);
      const y = Math.round(Math.sin(angles[i]) * radius);
      nodes.push({ type: "sticky", label: sub, xOffset: x, yOffset: y, width: 160, height: 100, color: ["#bbf7d0", "#bae6fd", "#fed7aa", "#fbcfe8"][i] });
    });
  } else if (type === "flowchart") {
    nodes.push({ type: "shape", shapeType: "circle", label: "Start: " + title, xOffset: 0, yOffset: -200, width: 160, height: 60, color: "#10b981", fillColor: "rgba(16, 185, 129, 0.1)" });
    nodes.push({ type: "shape", shapeType: "arrow", label: "", xOffset: 0, yOffset: -120, width: 30, height: 40, color: "#64748b" });
    nodes.push({ type: "shape", shapeType: "rectangle", label: "Process Step 1", xOffset: 0, yOffset: -60, width: 180, height: 70, color: "#3b82f6", fillColor: "rgba(59, 130, 246, 0.08)" });
    nodes.push({ type: "shape", shapeType: "arrow", label: "", xOffset: 0, yOffset: 30, width: 30, height: 40, color: "#64748b" });
    nodes.push({ type: "shape", shapeType: "diamond", label: "Valid?", xOffset: 0, yOffset: 90, width: 140, height: 80, color: "#f59e0b", fillColor: "rgba(245, 158, 11, 0.1)" });
    nodes.push({ type: "shape", shapeType: "arrow", label: "", xOffset: 0, yOffset: 190, width: 30, height: 40, color: "#64748b" });
    nodes.push({ type: "shape", shapeType: "circle", label: "Complete", xOffset: 0, yOffset: 250, width: 140, height: 60, color: "#10b981", fillColor: "rgba(16, 185, 129, 0.1)" });
  } else if (type === "brainstorm") {
    const columns = [
      { title: "Strengths / Ideas", color: "#bbf7d0", x: -250 },
      { title: "Challenges / Risks", color: "#fed7aa", x: 0 },
      { title: "Action Items", color: "#bae6fd", x: 250 },
    ];
    columns.forEach((col) => {
      nodes.push({ type: "text", label: col.title, xOffset: col.x, yOffset: -160, width: 180, height: 40, color: "#0f172a" });
      nodes.push({ type: "sticky", label: "Core priority item", xOffset: col.x, yOffset: -100, width: 180, height: 110, color: col.color });
      nodes.push({ type: "sticky", label: "Secondary task & detail", xOffset: col.x, yOffset: 30, width: 180, height: 110, color: col.color });
    });
  } else {
    // Architecture
    const tiers = [
      { name: "Client Apps (Web/Mobile)", y: -180, color: "#3b82f6" },
      { name: "API Gateway & Load Balancer", y: -60, color: "#8b5cf6" },
      { name: "Core Application Services", y: 60, color: "#10b981" },
      { name: "Database & Cache Tier (Mongo/Redis)", y: 180, color: "#f59e0b" },
    ];
    tiers.forEach((tier) => {
      nodes.push({ type: "shape", shapeType: "rectangle", label: tier.name, xOffset: 0, yOffset: tier.y, width: 280, height: 70, color: tier.color, fillColor: "rgba(15, 23, 42, 0.04)" });
    });
  }

  return {
    title,
    summary: "Generated layout tailored for " + prompt,
    nodes,
  };
}

// ---------------------------------------------------------------------------
// 6. MAIN PUBLIC FUNCTION
// ---------------------------------------------------------------------------
export async function generateDiagramWithGemini(
  prompt: string,
  diagramType: DiagramType,
  canvasCenter: CanvasCenter = { x: 0, y: 0 },
  user: { id: string; name: string } = { id: "ai_gemini", name: "Gemini AI" }
): Promise<AiDiagramResult> {
  const cacheKey = getCacheKey(prompt, diagramType);

  // Check in-memory cache first
  const cached = diagramCache.get(cacheKey);
  let parsedResult: { title: string; summary: string; nodes: RawAiNode[] };
  let fromCache = false;
  let isFallback = false;

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    parsedResult = cached;
    fromCache = true;
  } else {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured on the server. Please add your Gemini API key to server/.env."
      );
    }

    try {
      // Execute through throttled queue with automatic backoff
      parsedResult = await scheduleThrottledTask(() =>
        callGeminiWithRetry(apiKey, prompt, diagramType, 3)
      );

      // Store in cache
      diagramCache.set(cacheKey, {
        title: parsedResult.title,
        summary: parsedResult.summary,
        nodes: parsedResult.nodes,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.warn(`[Gemini Graceful Fallback]: ${err.message}. Engaging visual generator fallback.`);
      parsedResult = generateProceduralFallback(prompt, diagramType);
      isFallback = true;
    }
  }

  // Convert nodes into formatted CanvasElement objects
  const elements: any[] = [];
  const now = Date.now();

  for (const node of parsedResult.nodes || []) {
    const id = "el_" + crypto.randomBytes(6).toString("hex");
    const posX = Math.round(canvasCenter.x + (node.xOffset || 0));
    const posY = Math.round(canvasCenter.y + (node.yOffset || 0));
    const width = Math.max(40, Math.round(node.width || 180));
    const height = Math.max(30, Math.round(node.height || 100));

    if (node.type === "sticky") {
      elements.push({
        id,
        type: "sticky",
        x: posX,
        y: posY,
        width,
        height,
        text: node.label || "",
        color: node.color || "#fef08a",
        userId: user.id,
        userName: user.name,
        updatedAt: now,
      });
    } else if (node.type === "shape") {
      elements.push({
        id,
        type: "shape",
        shapeType: node.shapeType || "rectangle",
        x: posX,
        y: posY,
        width,
        height,
        color: node.color || "#3b82f6",
        fillColor: node.fillColor || "rgba(59, 130, 246, 0.08)",
        strokeWidth: 2,
        strokeStyle: "solid",
        text: node.label || "",
        textColor: "#0f172a",
        fontSize: 14,
        userId: user.id,
        userName: user.name,
        updatedAt: now,
      });
    } else {
      elements.push({
        id,
        type: "text",
        x: posX,
        y: posY,
        text: node.label || "",
        color: node.color || "#0f172a",
        fontSize: 18,
        fontWeight: "bold",
        textAlign: "center",
        userId: user.id,
        userName: user.name,
        updatedAt: now,
      });
    }
  }

  return {
    elements,
    title: parsedResult.title || "Generated Diagram",
    summary: parsedResult.summary || "",
    fromCache,
    isFallback,
  };
}
