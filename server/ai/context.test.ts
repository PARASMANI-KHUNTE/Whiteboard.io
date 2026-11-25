import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearAllStoredBoardContexts,
  clearStoredBoardContext,
  contextCacheFingerprint,
  formatGlobalContextPrompt,
  getStoredBoardContext,
  sanitizeGlobalContext,
} from './context';
import { generateDiagram, reviseDiagram } from './generate';
import { clearModelHealth, setCachedDiscoveredModels, setCachedOllamaModels } from './providers';
import type { DiagramGraph } from './types';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  clearModelHealth();
  setCachedDiscoveredModels(null);
  setCachedOllamaModels(null);
  clearAllStoredBoardContexts();
});

function sampleGraph(title: string, summary: string): DiagramGraph {
  return {
    title,
    summary,
    nodes: [
      { id: 'n1', label: 'Start Request', kind: 'start' },
      { id: 'n2', label: 'Validate Payload', kind: 'process', detail: 'Schema & auth check' },
      { id: 'n3', label: 'Valid Input?', kind: 'decision' },
      { id: 'n4', label: 'Process Task', kind: 'process', detail: 'Write to store' },
      { id: 'n5', label: 'Audit Event', kind: 'process', detail: 'Publish domain event' },
      { id: 'n6', label: 'Retry Queue', kind: 'process', detail: 'Exponential backoff' },
      { id: 'n7', label: 'Completed', kind: 'end' },
      { id: 'n8', label: 'Rejected', kind: 'end' },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4', label: 'valid' },
      { from: 'n3', to: 'n8', label: 'invalid' },
      { from: 'n4', to: 'n5', label: 'ok' },
      { from: 'n4', to: 'n6', label: 'transient error' },
      { from: 'n6', to: 'n4', label: 'retry' },
      { from: 'n5', to: 'n7' },
    ],
    suggestions: ['Add dead-letter queue'],
  };
}

test('sanitizeGlobalContext bounds oversized inputs and strips empty entries (#192)', () => {
  const clean = sanitizeGlobalContext({
    boardKey: 'room/abc?123',
    roomName: '  Payments   Architecture  ',
    mode: 'room',
    participantCount: 4,
    theme: 'dark',
    boardSummary: {
      totalElements: 2,
      strokeCount: 1,
      nodes: [
        { id: 's1', kind: 'sticky', label: 'Note A' },
        { id: 'bad', kind: 'stroke', label: 'Should ignore stroke' },
      ],
      connections: [{ from: 's1', to: 's2', label: 'triggers' }],
    },
    recentTurns: [{ role: 'user', content: 'Build auth flow' }],
  });

  assert.equal(clean?.boardKey, 'roomabc123');
  assert.equal(clean?.roomName, 'Payments Architecture');
  assert.equal(clean?.boardSummary?.nodes.length, 1);
  assert.equal(clean?.boardSummary?.connections.length, 1);
  assert.equal(clean?.recentTurns?.length, 1);

  const formatted = formatGlobalContextPrompt(clean);
  assert.match(formatted, /\[GLOBAL SESSION CONTEXT\]/);
  assert.match(formatted, /Room "Payments Architecture"/);
  assert.match(formatted, /\[s1\] \(sticky\) Note A/);
  assert.match(formatted, /Build auth flow/);
});

test('fails over from Gemini to local Ollama with shared global session context (#192)', async () => {
  process.env.NODE_ENV = 'test';
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'fake-gemini-key';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  process.env.GEMINI_FALLBACK_MODELS = 'none';
  process.env.AI_ALLOW_OLLAMA_FALLBACK = 'true';
  process.env.OLLAMA_MODEL = 'llama3.2';
  process.env.OLLAMA_MIN_INTERVAL_MS = '0';

  const seenUrls: string[] = [];
  let ollamaPrompt = '';

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    seenUrls.push(url);

    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response('Service Unavailable', { status: 503 });
    }

    const parsed = JSON.parse(String(init?.body ?? '{}'));
    ollamaPrompt = parsed.messages?.[1]?.content ?? '';
    return new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify(
            sampleGraph('Payment Webhook Flow', 'Webhook pipeline adapted to board context.')
          ),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const payload = await generateDiagram({
    prompt: 'Add webhook handling for this flow',
    type: 'flowchart',
    detail: 'standard',
    direction: 'vertical',
    globalContext: {
      boardKey: 'room999',
      roomName: 'Checkout Platform',
      mode: 'room',
      participantCount: 2,
      boardSummary: {
        totalElements: 3,
        strokeCount: 1,
        nodes: [
          { id: 'sticky1', kind: 'sticky', label: 'Must verify Stripe signature' },
        ],
        connections: [],
      },
      lastProvider: 'gemini',
      lastModel: 'gemini-3.8-flash',
      recentTurns: [
        {
          role: 'assistant',
          content: 'Created base Stripe charge service.',
          provider: 'gemini',
          model: 'gemini-3.8-flash',
        },
      ],
    },
  });

  assert.equal(payload.provider, 'ollama');
  assert.equal(payload.model, 'llama3.2');
  assert.match(payload.notice ?? '', /Ollama · llama3\.2 produced this diagram/);
  assert.ok(seenUrls.some((u) => u.includes('generativelanguage.googleapis.com')));
  assert.ok(seenUrls.some((u) => u.includes('/api/chat')));
  assert.match(ollamaPrompt, /\[GLOBAL SESSION CONTEXT\]/);
  assert.match(ollamaPrompt, /Must verify Stripe signature/);
  assert.match(ollamaPrompt, /Created base Stripe charge service/);

  // Stored context now records that Ollama handled this board turn.
  const stored = getStoredBoardContext('room999');
  assert.equal(stored?.lastProvider, 'ollama');
  assert.equal(stored?.lastModel, 'llama3.2');
  assert.ok((stored?.recentTurns?.length ?? 0) >= 2);
});

test('cross-provider revision carries server-recorded turns when Gemini hands off to Ollama (#192)', async () => {
  process.env.NODE_ENV = 'test';
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'fake-gemini-key';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  process.env.GEMINI_FALLBACK_MODELS = 'none';
  process.env.AI_ALLOW_OLLAMA_FALLBACK = 'true';
  process.env.OLLAMA_MODEL = 'llama3.2';
  process.env.OLLAMA_MIN_INTERVAL_MS = '0';

  let turn = 0;
  let capturedRevisionPrompt = '';

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    if (turn === 0 && url.includes('generativelanguage.googleapis.com')) {
      turn += 1;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(
                      sampleGraph('Order Intake Architecture', 'Initial API and DB flow')
                    ),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.includes('generativelanguage.googleapis.com')) {
      return new Response('Rate limited', { status: 429 });
    }

    const parsed = JSON.parse(String(init?.body ?? '{}'));
    capturedRevisionPrompt = parsed.messages?.[1]?.content ?? '';
    return new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({
            ...sampleGraph('Order Intake Architecture', 'Added Redis cache layer'),
            changes: ['Added Redis cache between gateway and DB'],
          }),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const first = await generateDiagram({
    prompt: 'Order Intake API flow',
    type: 'flowchart',
    detail: 'standard',
    direction: 'vertical',
    globalContext: { boardKey: 'handoffboard', roomName: 'Order Sync' },
  });
  assert.equal(first.provider, 'gemini');

  const second = await reviseDiagram({
    instruction: 'Add Redis caching',
    graph: first.graph,
    type: 'flowchart',
    detail: 'standard',
    direction: 'vertical',
    sessionId: first.sessionId,
    globalContext: { boardKey: 'handoffboard' },
  });

  assert.equal(second.provider, 'ollama');
  assert.match(capturedRevisionPrompt, /Order Intake API flow/);
  assert.match(capturedRevisionPrompt, /Initial API and DB flow/);
  assert.match(capturedRevisionPrompt, /gemini\/gemini-3\.8-flash/);

  clearStoredBoardContext('handoffboard');
  assert.equal(getStoredBoardContext('handoffboard'), undefined);
});

test('contextCacheFingerprint differentiates changed whiteboard contexts (#192)', () => {
  const emptyDigest = contextCacheFingerprint({ boardKey: 'solo' });
  const withStickyDigest = contextCacheFingerprint({
    boardKey: 'solo',
    boardSummary: {
      totalElements: 1,
      strokeCount: 0,
      nodes: [{ id: 's1', kind: 'sticky', label: 'Add OAuth login' }],
      connections: [],
    },
  });
  assert.notEqual(emptyDigest, withStickyDigest);
});
