import assert from 'node:assert/strict';
import test from 'node:test';
import { AiFailoverError } from './generate';
import { attemptCountLabel } from './providers';

test('formats retry attempt counts with correct pluralization', () => {
  assert.equal(attemptCountLabel(1), '1 attempt');
  assert.equal(attemptCountLabel(3), '3 attempts');
});

test('summarizes exhausted failover without repeating provider reasons', () => {
  const reasons = [
    'Gemini 3.6 Flash (gemini-3.6-flash): Gemini service unavailable (HTTP 503).',
    'Ollama (llama3.2): Could not reach Ollama at http://127.0.0.1:11434.',
  ];

  const error = new AiFailoverError(reasons);

  assert.equal(error.message, 'All 2 configured AI providers failed.');
  assert.deepEqual(error.reasons, reasons);
  assert.ok(!error.message.includes('HTTP 503'));
});
