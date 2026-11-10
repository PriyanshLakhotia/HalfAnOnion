import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexRuntime } from '../codex.mjs';

for (const options of [{}, { command: '/custom/codex' }]) {
  test(`public text command completes a structured turn (${options.command ?? 'default executable'})`, async () => {
    const runtime = new CodexRuntime({ home: '/data/test-codex', ...options });
    const calls = [];
    runtime.rpc = async (method, params) => {
      calls.push({ method, params });
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'model/list') return { data: [{ model: 'test-model', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }] };
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') {
        assert.equal(JSON.parse(params.input[0].text).instruction, 'Add rice to my shopping list.');
        assert.equal(params.outputSchema.additionalProperties, false);
        runtime.active.resolve({ status: 'completed', text: JSON.stringify({
          message: 'Rice is ready to add.', followUp: false,
          actions: [{ type: 'put', kind: 'items', id: 'item-1', data: '{"name":"Rice"}', expected: '{}' }],
        }) });
        return { turn: { id: 'turn-1' } };
      }
      if (method === 'thread/archive') return {};
      throw new Error('Unexpected RPC: ' + method);
    };
    const result = await runtime.command({ text: 'Add rice to my shopping list.', context: {}, model: 'test-model', reasoning: 'high' });
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.result.actions[0].data, { name: 'Rice' });
    assert.deepEqual(result.result.actions[0].expected, {});
    assert.equal(calls.at(-1).method, 'thread/archive');
    assert.equal(runtime.active, null);
  });
}

test('a signed-out command fails clearly and the next command can still run', async () => {
  const runtime = new CodexRuntime({ home: '/data/test-codex' });
  runtime.status = async () => ({ connected: false });
  await assert.rejects(runtime.command({ text: 'Hello' }), /Connect ChatGPT/);
  await assert.rejects(runtime.command({ text: 'Try again' }), /Connect ChatGPT/);
});
