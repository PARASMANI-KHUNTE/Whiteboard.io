import assert from 'node:assert/strict';
import test from 'node:test';
import { AiQueueFullError, callModelChain } from './generate';
import { QueueFullError } from './requestQueue';
import type { AiProviderInfo } from './providers';

const GEMINI: AiProviderInfo = {
  name: 'gemini',
  model: 'gemini-test',
  label: 'Gemini Test',
};
const OLLAMA: AiProviderInfo = {
  name: 'ollama',
  model: 'ollama-test',
  label: 'Ollama Test',
};

test('a queue-full rejection aborts the whole chain with a 429 error (#65)', async () => {
  let calls = 0;

  await assert.rejects(
    callModelChain([GEMINI, OLLAMA], 'prompt', 0.4, async () => {
      calls += 1;
      throw new QueueFullError();
    }),
    (error: unknown) => {
      assert.ok(error instanceof QueueFullError);
      assert.ok(error instanceof AiQueueFullError);
      assert.equal((error as { status?: number }).status, 429);
      return true;
    }
  );

  assert.equal(calls, 1, 'the next provider shares the same queue and must not be tried');
});

test('ordinary provider failures still fail over to the next provider', async () => {
  const attempted: string[] = [];
  const result = await callModelChain([GEMINI, OLLAMA], 'prompt', 0.4, async (provider) => {
    attempted.push(provider.model);
    if (provider.name === 'gemini') throw new Error('HTTP 503');
    return { nodes: [] };
  });

  assert.deepEqual(attempted, ['gemini-test', 'ollama-test']);
  assert.equal(result.provider, OLLAMA);
  assert.deepEqual(result.failed, [GEMINI]);
});
