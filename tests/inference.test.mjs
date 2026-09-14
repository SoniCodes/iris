import assert from 'node:assert/strict';
import test from 'node:test';
import inference from '../dist/providers/inference.js';

const { listModels } = inference;

test('caches the Ollama model list', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return {
      ok: true,
      json: async () => ({ models: [{ name: 'local-model' }] }),
    };
  };

  try {
    const settings = {
      endpoint: 'http://cache-test.invalid',
      model: 'local-model',
      context: 4096,
      keepAlive: '5m',
    };
    assert.deepEqual(await listModels(settings), ['local-model']);
    assert.deepEqual(await listModels(settings), ['local-model']);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
