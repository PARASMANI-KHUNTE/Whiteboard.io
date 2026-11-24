import assert from 'node:assert/strict';
import test from 'node:test';
import { callAiModel } from './providers';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

test('callGemini sends apiKey via x-goog-api-key header and never in URL query string (#101)', async () => {
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = 'secret-gemini-test-key-12345';

  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = input.toString();
    if (init?.headers) {
      capturedHeaders = init.headers as Record<string, string>;
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ nodes: [], edges: [] }) }],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const result = await callAiModel(
    { name: 'gemini', model: 'gemini-3.8-flash', label: 'Gemini' },
    'generate a simple flowchart',
    0.3
  );

  assert.deepEqual(result, { nodes: [], edges: [] });
  // Gemini key must NOT appear in URL
  assert.ok(!capturedUrl.includes('key='));
  assert.ok(!capturedUrl.includes('secret-gemini-test-key-12345'));
  assert.equal(
    capturedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'
  );
  // Gemini key MUST appear in x-goog-api-key header
  assert.equal(capturedHeaders['x-goog-api-key'], 'secret-gemini-test-key-12345');
});

test('callOllama honors maxRetries and succeeds after transient failures (#101)', async () => {
  process.env.NODE_ENV = 'test';
  let attempts = 0;

  globalThis.fetch = (async () => {
    attempts++;
    if (attempts < 3) {
      // Simulate transient 503 Service Unavailable
      return new Response('Overloaded', { status: 503 });
    }
    return new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({ nodes: [{ id: 'n1', label: 'Node' }], edges: [] }),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const result = await callAiModel(
    { name: 'ollama', model: 'llama3.2', label: 'Ollama' },
    'generate diagram',
    0.2,
    { maxRetries: 3 }
  );

  assert.equal(attempts, 3);
  assert.deepEqual(result, { nodes: [{ id: 'n1', label: 'Node' }], edges: [] });
});

test('callOllama throws after exhausting maxRetries on persistent transient failures (#101)', async () => {
  process.env.NODE_ENV = 'test';
  let attempts = 0;

  globalThis.fetch = (async () => {
    attempts++;
    return new Response('Service Unavailable', { status: 503 });
  }) as typeof fetch;

  await assert.rejects(
    async () => {
      await callAiModel(
        { name: 'ollama', model: 'llama3.2', label: 'Ollama' },
        'generate diagram',
        0.2,
        { maxRetries: 2 }
      );
    },
    (err: Error) => {
      assert.equal(attempts, 2);
      assert.ok(err.message.includes('after 2 attempts'));
      assert.ok(err.message.includes('HTTP 503'));
      return true;
    }
  );
});

test('callOllama does not retry fatal 404 errors (#101)', async () => {
  process.env.NODE_ENV = 'test';
  let attempts = 0;

  globalThis.fetch = (async () => {
    attempts++;
    return new Response('Model not found', { status: 404 });
  }) as typeof fetch;

  await assert.rejects(
    async () => {
      await callAiModel(
        { name: 'ollama', model: 'nonexistent-model', label: 'Ollama' },
        'generate diagram',
        0.2,
        { maxRetries: 3 }
      );
    },
    (err: Error) => {
      assert.equal(attempts, 1);
      assert.ok(err.message.includes('HTTP 404'));
      return true;
    }
  );
});
