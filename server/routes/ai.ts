import express from "express";
import { getUserByToken } from "../auth";
import { extractAuthToken } from "../oauthState";
import { AiQueueFullError, generateDiagram, reviseDiagram } from "../ai/generate";
import { bindRequestAbort } from "../ai/abort";
import { sanitizeGlobalContext } from "../ai/context";
import {
  coerceProviderSelection,
  getAvailableAiProvidersAsync,
  getProviderSummary,
  ollamaFallbackEnabled,
  sanitizeModelName,
} from "../ai/providers";
import {
  coerceDiagramType,
  coerceDetailLevel,
  coerceDirection,
} from "../ai/types";
import type { ChatTurn, DiagramGraph } from "../ai/types";

export interface AiRoutesOptions {
  authRateLimiter: (limit: number, windowMs: number, keyPrefix: string) => express.RequestHandler;
}

export function setupAiRoutes(app: express.Express, options: AiRoutesOptions): void {
  const { authRateLimiter } = options;

  // Which AI engine is active plus available configured providers for client switching.
  app.get("/api/ai/config", async (req, res) => {
    const requestAbort = bindRequestAbort(req, res);
    try {
      const summary = getProviderSummary();
      const availableProviders = await getAvailableAiProvidersAsync(requestAbort.signal);
      if (requestAbort.signal.aborted) return;
      res.json({
        success: true,
        provider: summary.provider,
        model: summary.model,
        label: summary.label,
        ollamaFallback: ollamaFallbackEnabled(),
        defaultSelection: coerceProviderSelection(process.env.AI_PROVIDER) || "auto",
        availableProviders,
      });
    } catch {
      if (requestAbort.signal.aborted) return;
      const summary = getProviderSummary();
      res.json({
        success: true,
        provider: summary.provider,
        model: summary.model,
        label: summary.label,
        ollamaFallback: ollamaFallbackEnabled(),
        defaultSelection: coerceProviderSelection(process.env.AI_PROVIDER) || "auto",
        availableProviders: [],
      });
    } finally {
      requestAbort.dispose();
    }
  });

  // AI Diagram Generation Route (Rate limited to 10 requests / min per IP)
  app.post("/api/ai/generate-diagram", authRateLimiter(10, 60000, "ai-generate"), async (req, res) => {
    const requestAbort = bindRequestAbort(req, res);
    try {
      const body = req.body ?? {};
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) {
        res.status(400).json({ success: false, error: "Prompt is required" });
        return;
      }

      const token = extractAuthToken(req.headers.authorization, req.headers.cookie);
      const user = token ? await getUserByToken(token) : null;
      // Unauthenticated diagrams are credited to whichever engine actually
      // answered, so the author is resolved after the failover chain runs.
      const author = user ? { id: user.id, name: user.name } : undefined;

      const canvasCenter =
        body.canvasCenter &&
        Number.isFinite(Number(body.canvasCenter.x)) &&
        Number.isFinite(Number(body.canvasCenter.y))
          ? { x: Number(body.canvasCenter.x), y: Number(body.canvasCenter.y) }
          : { x: 0, y: 0 };

      const globalContext = sanitizeGlobalContext(
        body.globalContext,
        typeof body.boardKey === "string" ? body.boardKey : undefined
      );

      const result = await generateDiagram({
        prompt: prompt.slice(0, 1200),
        type: coerceDiagramType(body.type),
        detail: coerceDetailLevel(body.detail),
        direction: coerceDirection(body.direction),
        canvasCenter,
        author,
        sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
        globalContext,
        preferredProvider: coerceProviderSelection(body.provider),
        preferredModel: sanitizeModelName(body.model),
        signal: requestAbort.signal,
      });

      if (requestAbort.signal.aborted) return;
      res.json({ success: true, ...result });
    } catch (err: any) {
      if (requestAbort.signal.aborted) return;
      const status = err instanceof AiQueueFullError ? 429 : 500;
      console.error("[AI Generate Error]:", err.message);
      res.status(status).json({ success: false, error: err.message || "Failed to generate diagram" });
    } finally {
      requestAbort.dispose();
    }
  });

  // AI Follow-up Revision Route (stateless: client sends the current graph)
  app.post("/api/ai/revise-diagram", authRateLimiter(20, 60000, "ai-revise"), async (req, res) => {
    const requestAbort = bindRequestAbort(req, res);
    try {
      const body = req.body ?? {};
      const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
      if (!instruction) {
        res.status(400).json({ success: false, error: "Instruction is required" });
        return;
      }

      const graph = body.graph as DiagramGraph | undefined;
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        res.status(400).json({ success: false, error: "A valid diagram graph is required" });
        return;
      }

      const token = extractAuthToken(req.headers.authorization, req.headers.cookie);
      const user = token ? await getUserByToken(token) : null;
      // Unauthenticated diagrams are credited to whichever engine actually
      // answered, so the author is resolved after the failover chain runs.
      const author = user ? { id: user.id, name: user.name } : undefined;

      const history: ChatTurn[] = Array.isArray(body.history)
        ? body.history
            .filter(
              (turn: any) =>
                turn &&
                (turn.role === "user" || turn.role === "assistant") &&
                typeof turn.content === "string"
            )
            .slice(-10)
            .map((turn: any) => ({
              role: turn.role,
              content: turn.content.slice(0, 600),
            }))
        : [];

      const canvasCenter =
        body.canvasCenter &&
        Number.isFinite(Number(body.canvasCenter.x)) &&
        Number.isFinite(Number(body.canvasCenter.y))
          ? { x: Number(body.canvasCenter.x), y: Number(body.canvasCenter.y) }
          : { x: 0, y: 0 };

      const globalContext = sanitizeGlobalContext(
        body.globalContext,
        typeof body.boardKey === "string" ? body.boardKey : undefined
      );

      const result = await reviseDiagram({
        instruction: instruction.slice(0, 1200),
        graph,
        history,
        type: coerceDiagramType(body.type),
        detail: coerceDetailLevel(body.detail),
        direction: coerceDirection(body.direction),
        canvasCenter,
        author,
        sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
        globalContext,
        preferredProvider: coerceProviderSelection(body.provider),
        preferredModel: sanitizeModelName(body.model),
        signal: requestAbort.signal,
      });

      if (requestAbort.signal.aborted) return;
      res.json({ success: true, ...result });
    } catch (err: any) {
      if (requestAbort.signal.aborted) return;
      const status = err instanceof AiQueueFullError ? 429 : 500;
      console.error("[AI Revision Error]:", err.message);
      res.status(status).json({ success: false, error: err.message || "Failed to revise diagram" });
    } finally {
      requestAbort.dispose();
    }
  });
}
