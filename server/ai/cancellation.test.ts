import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bindRequestAbort,
  combineWithTimeout,
  RequestAbortedError,
  throwIfAborted,
} from './abort';
import { generateDiagram, callModelChain, reviseDiagram } from './generate';
import { callAiModel, type AiProviderInfo } from './providers';
import { ThrottledQueue } from './requestQueue';
import type { DiagramGraph } from './types';

const OLLAMA: AiProviderInfo = {
  name: 'ollama',
  model: 'llama3.2',
  label: 'Ollama Test',
};
const GEMINI: AiProviderInfo = {
  name: 'gemini',
  model: 'gemini-test',
  label: 'Gemini Test',
};

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test('client disconnect aborts server work but a normal response does not (#83)', () => {
  const req = new EventEmitter();
  const res = new EventEmitter() as EventEmitter & { writableEnded?: boolean };
  const request = bindRequestAbort(req, res);

  assert.equal(request.signal.aborted, false);
  res.writableEnded = true;
  res.emit('close');
  assert.equal(request.signal.aborted, false);
  res.writableEnded = false;

  req.emit('aborted');
  assert.equal(request.signal.aborted, true);
  request.dispose();
});

test('aborting a queued AI request frees its slot without running the task (#83)', async () => {
  const queue = new ThrottledQueue(10_000, 2);
  let releaseFirst: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const first = queue.schedule(0, () => new Promise<void>((resolve) => {
    releaseFirst = resolve;
    markStarted?.();
  }));
  await started;

  const controller = new AbortController();
  let secondStarted = false;
  const second = queue.schedule(0, async () => {
    secondStarted = true;
    return 'second';
  }, controller.signal);

  assert.equal(queue.size, 2);
  controller.abort();

  await assert.rejects(second, RequestAbortedError);
  assert.equal(queue.size, 1);
  assert.equal(secondStarted, false);

  releaseFirst?.();
  await first;
  assert.equal(queue.size, 0);
});

test('an abort during one provider stops the failover chain (#83)', async () => {
  const controller = new AbortController();
  const attempted: string[] = [];

  await assert.rejects(
    callModelChain(
      [GEMINI, OLLAMA],
      'prompt',
      0.4,
      async (provider, _message, _temperature, _maxRetries, signal) => {
        attempted.push(provider.model);
        controller.abort();
        throwIfAborted(signal);
        return { nodes: [] };
      },
      controller.signal
    ),
    RequestAbortedError
  );

  assert.deepEqual(attempted, ['gemini-test']);
});

test('provider timeout is combined with the client abort signal (#83)', () => {
  const controller = new AbortController();
  const combined = combineWithTimeout(60_000, controller.signal);

  assert.equal(combined.signal.aborted, false);
  controller.abort();
  assert.equal(combined.signal.aborted, true);
  combined.dispose();
});

test('an already-cancelled AI call never reaches the provider fetch (#83)', async () => {
  process.env.NODE_ENV = 'test';
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('fetch should not be called');
  }) as typeof fetch;

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    callAiModel(OLLAMA, 'generate diagram', 0.2, { signal: controller.signal }),
    RequestAbortedError
  );
  assert.equal(fetchCalls, 0);
});

test('cancelled generation and revision reject instead of returning fallbacks (#83)', async () => {
  const controller = new AbortController();
  controller.abort();
  const common = {
    type: 'mindmap' as const,
    detail: 'standard' as const,
    direction: 'vertical' as const,
    signal: controller.signal,
  };

  await assert.rejects(
    generateDiagram({ prompt: 'draw a map', ...common }),
    RequestAbortedError
  );
  await assert.rejects(
    reviseDiagram({
      instruction: 'add a node',
      graph: { title: 'Map', summary: '', nodes: [], edges: [] } as unknown as DiagramGraph,
      ...common,
    }),
    RequestAbortedError
  );
});

test('cancelled results bypass caching and fallback assembly (#83)', () => {
  const source = readFileSync(new URL('./generate.ts', import.meta.url), 'utf8');

  assert.match(source, /throwIfAborted\(signal\);\s*graphCache\.set/);
  assert.match(source, /error instanceof RequestAbortedError \|\| error instanceof QueueFullError\)\s*throw error/);
});
