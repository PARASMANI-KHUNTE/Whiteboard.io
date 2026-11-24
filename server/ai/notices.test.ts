import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AiFailoverError,
  AllProvidersFailedError,
  EmptyDiagramError,
  composeGenerationNotice,
  generateDiagram,
} from './generate';
import type { AiProviderInfo } from './providers';

const GEMINI: AiProviderInfo = {
  name: 'gemini',
  model: 'gemini-2.5-flash',
  label: 'Gemini 2.5 Flash',
};
const OLLAMA: AiProviderInfo = {
  name: 'ollama',
  model: 'llama3.2',
  label: 'Ollama',
};

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

function useOllamaFetch(body: () => unknown): void {
  process.env.NODE_ENV = 'test';
  process.env.AI_PROVIDER = 'ollama';
  process.env.OLLAMA_MODEL = OLLAMA.model;
  process.env.OLLAMA_MIN_INTERVAL_MS = '0';
  globalThis.fetch = (async () => new Response(JSON.stringify({
    message: { content: JSON.stringify(body()) },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof fetch;
}

test('failover and quality notices are both present (#84)', () => {
  const notice = composeGenerationNotice(
    ['Only 10 nodes were produced; at least 12 are required.'],
    [GEMINI],
    OLLAMA
  );

  assert.equal(
    notice,
    'Gemini 2.5 Flash unavailable — Ollama · llama3.2 produced this diagram. ' +
      'Quality checks reported: Only 10 nodes were produced; at least 12 are required.'
  );
  assert.equal(
    composeGenerationNotice([], [GEMINI], OLLAMA),
    'Gemini 2.5 Flash unavailable — Ollama · llama3.2 produced this diagram.'
  );
  assert.equal(composeGenerationNotice([], [], OLLAMA), undefined);
});

test('empty responses and exhausted chains use distinct typed errors (#84)', () => {
  assert.equal(AllProvidersFailedError, AiFailoverError);

  const empty = new EmptyDiagramError(OLLAMA, [GEMINI]);
  assert.equal(empty.name, 'EmptyDiagramError');
  assert.match(empty.message, /empty diagram/);
  assert.deepEqual(empty.failed, [GEMINI]);

  const exhausted = new AllProvidersFailedError(['Gemini: HTTP 503']);
  assert.ok(exhausted instanceof AiFailoverError);
  assert.equal(exhausted.name, 'AiFailoverError');
});

test('an empty model graph does not report that no model responded (#84)', async () => {
  useOllamaFetch(() => ({ nodes: [], edges: [] }));

  const payload = await generateDiagram({
    prompt: 'empty graph regression #84',
    type: 'mindmap',
    detail: 'standard',
    direction: 'vertical',
  });

  assert.equal(payload.isFallback, true);
  assert.equal(payload.provider, 'fallback');
  assert.match(payload.notice ?? '', /Ollama · llama3\.2 answered but returned an empty diagram/);
  assert.doesNotMatch(payload.notice ?? '', /No AI model responded/);
});

test('an exhausted provider chain still reports that no model responded (#84)', async () => {
  process.env.NODE_ENV = 'test';
  process.env.AI_PROVIDER = 'ollama';
  process.env.OLLAMA_MODEL = OLLAMA.model;
  process.env.OLLAMA_MIN_INTERVAL_MS = '0';
  globalThis.fetch = (async () => new Response('Service Unavailable', { status: 503 })) as typeof fetch;

  const payload = await generateDiagram({
    prompt: 'total outage regression #84',
    type: 'mindmap',
    detail: 'standard',
    direction: 'vertical',
  });

  assert.equal(payload.isFallback, true);
  assert.match(payload.notice ?? '', /^No AI model responded \(Ollama · llama3\.2\)/);
  assert.doesNotMatch(payload.notice ?? '', /empty diagram/);
});
