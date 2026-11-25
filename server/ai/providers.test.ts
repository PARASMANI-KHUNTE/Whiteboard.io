import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callAiModel,
  clearModelHealth,
  extractJson,
  geminiProviderChain,
  getAvailableAiProviders,
  isModelHealthy,
  ollamaProviderChain,
  recordModelFailure,
  recordModelSuccess,
  resolveAiProvider,
  resolveProviderChain,
  setCachedDiscoveredModels,
  setCachedOllamaModels,
  setCachedOpenAiModels,
} from './providers';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  clearModelHealth();
  setCachedDiscoveredModels(null);
  setCachedOllamaModels(null);
  setCachedOpenAiModels('groq', null);
  setCachedOpenAiModels('nvidia', null);
  setCachedOpenAiModels('openrouter', null);
  setCachedOpenAiModels('deepseek', null);
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

test('circuit breaker permanently excludes HTTP 404 retired models from rotation (#179)', () => {
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_MODEL = 'gemini-retired-model';
  process.env.GEMINI_FALLBACK_MODELS = 'gemini-healthy-model';

  assert.equal(isModelHealthy('gemini-retired-model'), true);
  recordModelFailure('gemini-retired-model', 404);
  assert.equal(isModelHealthy('gemini-retired-model'), false);

  const chain = geminiProviderChain();
  const models = chain.map((p) => p.model);
  assert.ok(!models.includes('gemini-retired-model'));
  assert.ok(models.includes('gemini-healthy-model'));
});

test('circuit breaker temporarily demotes HTTP 503 models below healthy models (#179)', () => {
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_MODEL = 'gemini-primary';
  process.env.GEMINI_FALLBACK_MODELS = 'gemini-secondary';

  // Initially, primary is first
  let chain = geminiProviderChain();
  assert.equal(chain[0].model, 'gemini-primary');

  // After 503, primary is placed on cooldown and demoted
  recordModelFailure('gemini-primary', 503);
  assert.equal(isModelHealthy('gemini-primary'), false);

  chain = geminiProviderChain();
  assert.equal(chain[0].model, 'gemini-secondary');
  assert.equal(chain[1].model, 'gemini-primary');

  // After success, primary is restored
  recordModelSuccess('gemini-primary');
  assert.equal(isModelHealthy('gemini-primary'), true);
  chain = geminiProviderChain();
  assert.equal(chain[0].model, 'gemini-primary');
});

test('resolveProviderChain includes local Ollama when AI_PROVIDER=gemini unless explicitly disabled (#192)', () => {
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'fake-gemini-key';
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  process.env.GEMINI_FALLBACK_MODELS = 'none';
  process.env.OLLAMA_MODEL = 'llama3.2';
  delete process.env.AI_ALLOW_OLLAMA_FALLBACK;

  let chain = resolveProviderChain();
  assert.deepEqual(
    chain.map((p) => `${p.name}:${p.model}`),
    ['gemini:gemini-3.8-flash', 'ollama:llama3.2']
  );

  // Even without a Gemini key, AI_PROVIDER=gemini falls back to Ollama when enabled
  delete process.env.GEMINI_API_KEY;
  assert.equal(resolveAiProvider()?.name, 'ollama');
  chain = resolveProviderChain();
  assert.deepEqual(
    chain.map((p) => `${p.name}:${p.model}`),
    ['ollama:llama3.2']
  );

  // Explicit opt-out disables Ollama fallback
  process.env.GEMINI_API_KEY = 'fake-gemini-key';
  process.env.AI_ALLOW_OLLAMA_FALLBACK = 'false';
  chain = resolveProviderChain();
  assert.deepEqual(
    chain.map((p) => `${p.name}:${p.model}`),
    ['gemini:gemini-3.8-flash']
  );
});

test('ollamaProviderChain prioritizes installed local models from discovery (#192)', () => {
  process.env.OLLAMA_MODEL = 'llama3.2';
  setCachedOllamaModels(['qwen2.5:7b-instruct', 'llama3.2:latest']);

  let chain = ollamaProviderChain();
  assert.equal(chain[0].model, 'llama3.2:latest');
  assert.ok(chain.some((p) => p.model === 'qwen2.5:7b-instruct'));

  // When configured default is not pulled locally, use discovered local model instead of failing
  process.env.OLLAMA_MODEL = 'missing-model';
  chain = ollamaProviderChain();
  assert.equal(chain[0].model, 'qwen2.5:7b-instruct');
});

test('callOllama falls back to json format when model rejects strict schema with HTTP 400 (#192)', async () => {
  process.env.NODE_ENV = 'test';
  const sentFormats: unknown[] = [];

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body ?? '{}'));
    sentFormats.push(parsed.format);
    if (sentFormats.length === 1) {
      return new Response('invalid format schema grammar', { status: 400 });
    }
    return new Response(
      JSON.stringify({
        message: { content: JSON.stringify({ nodes: [{ id: 'n1', label: 'Node' }], edges: [] }) },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const result = await callAiModel(
    { name: 'ollama', model: 'qwen2.5:7b', label: 'Ollama' },
    'generate diagram',
    0.2,
    { maxRetries: 2 }
  );

  assert.equal(sentFormats.length, 2);
  assert.equal(typeof sentFormats[0], 'object');
  assert.equal(sentFormats[1], 'json');
  assert.deepEqual(result, { nodes: [{ id: 'n1', label: 'Node' }], edges: [] });
});

test('extractJson strips <think> blocks from reasoning models (#202)', () => {
  const parsed = extractJson(
    '<think>Let me sketch {invalid json} first.</think>\n```json\n{"title":"System","nodes":[]}\n```'
  );
  assert.deepEqual(parsed, { title: 'System', nodes: [] });
});

test('callAiModel dispatches OpenAI-compatible providers and falls back from json_object on HTTP 400 (#202)', async () => {
  process.env.NODE_ENV = 'test';
  process.env.GROQ_API_KEY = 'groq-test-key-placeholder';
  process.env.GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

  const seenBodies: Array<Record<string, unknown>> = [];
  let seenAuth = '';

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    seenAuth = headers?.Authorization || '';
    const parsed = JSON.parse(String(init?.body ?? '{}'));
    seenBodies.push(parsed);
    if (seenBodies.length === 1) {
      return new Response(
        JSON.stringify({ error: { message: 'Failed to validate JSON', code: 'json_validate_failed' } }),
        { status: 400 }
      );
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ nodes: [{ id: 'g1', label: 'Groq' }], edges: [] }) } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  const result = await callAiModel(
    { name: 'groq', model: 'qwen/qwen3.8-27b', label: 'Groq' },
    'generate diagram',
    0.3,
    { maxRetries: 2 }
  );

  assert.equal(seenAuth, 'Bearer groq-test-key-placeholder');
  assert.equal(seenBodies.length, 2);
  assert.deepEqual(seenBodies[0].response_format, { type: 'json_object' });
  assert.equal('response_format' in seenBodies[1], false);
  assert.deepEqual(result, { nodes: [{ id: 'g1', label: 'Groq' }], edges: [] });
});

test('resolveProviderChain honors user provider and model switch plus getAvailableAiProviders (#202)', () => {
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'fake-gemini';
  process.env.GEMINI_FALLBACK_MODELS = 'none';
  process.env.GROQ_API_KEY = 'fake-groq';
  process.env.GROQ_FALLBACK_MODELS = 'none';
  process.env.NVIDIA_API_KEY = 'fake-nvidia';
  process.env.NVIDIA_FALLBACK_MODELS = 'none';
  process.env.AI_ALLOW_OLLAMA_FALLBACK = 'false';

  const groqSelected = resolveProviderChain([], [], {
    preferredProvider: 'groq',
    preferredModel: 'openai/gpt-oss-120b',
  });
  assert.equal(groqSelected[0].name, 'groq');
  assert.equal(groqSelected[0].model, 'openai/gpt-oss-120b');
  assert.ok(groqSelected.some((p) => p.name === 'gemini'));
  assert.ok(groqSelected.some((p) => p.name === 'nvidia'));

  assert.deepEqual(resolveProviderChain([], [], { preferredProvider: 'fallback' }), []);

  const inventory = getAvailableAiProviders();
  const groqEntry = inventory.find((p) => p.id === 'groq');
  const openrouterEntry = inventory.find((p) => p.id === 'openrouter');
  assert.equal(groqEntry?.configured, true);
  assert.equal(openrouterEntry?.configured, false);
});
