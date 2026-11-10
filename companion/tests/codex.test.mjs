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
          actions: [{ type: 'put', kind: 'items', id: 'item-1', data: { name: 'Rice', origin: 'instruction' } }],
        }) });
        return { turn: { id: 'turn-1' } };
      }
      if (method === 'thread/archive') return {};
      throw new Error('Unexpected RPC: ' + method);
    };
    const result = await runtime.command({ text: 'Add rice to my shopping list.', context: {}, model: 'test-model', reasoning: 'high' });
    assert.equal(result.status, 'completed');
    assert.equal(result.result.actions[0].data.name, 'Rice');
    assert.equal(result.result.actions[0].data.origin, 'instruction');
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

function replies(outputs) {
  const runtime = new CodexRuntime({ home: '/data/test-codex' }), inputs = [];
  runtime.status = async () => ({ connected: true, models: [{ model: 'test-model', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }] });
  runtime.rpc = async (method, params) => {
    if (method === 'thread/start') return { thread: { id: 'test-thread' } };
    if (method === 'thread/archive') return {};
    if (method !== 'turn/start') throw new Error('Unexpected RPC');
    inputs.push(JSON.parse(params.input[0].text));
    const output = outputs[inputs.length - 1];
    assert.ok(output, 'Only the expected number of attempts may run');
    runtime.active.resolve({ status: 'completed', text: JSON.stringify(output) });
    return { turn: { id: 'turn-' + inputs.length } };
  };
  return { runtime, inputs };
}
const commandInput = { text: 'Create a dal recipe', model: 'test-model', reasoning: 'high', context: {} };
const badRecipe = { message: 'Dal', followUp: false, actions: [{ type: 'put', kind: 'recipes', id: 'dal', data: { name: 'Dal', origin: 'inference', prerequisites: ['Soak lentils'] } }] };
const goodRecipe = { message: 'Dal', followUp: false, actions: [{ type: 'put', kind: 'recipes', id: 'dal', data: { name: 'Dal', origin: 'generated', prerequisites: 'Soak lentils' } }] };
test('invalid model fields are corrected once before a result can leave the companion', async () => {
  const { runtime, inputs } = replies([badRecipe, goodRecipe]);
  const result = await runtime.command(commandInput);
  assert.equal(inputs.length, 2);
  assert.ok(inputs[1].validationErrors.length);
  assert.equal(result.result.actions[0].data.origin, 'generated');
  assert.equal(result.result.actions[0].data.prerequisites, 'Soak lentils');
});
test('repeated invalid output stops after one correction with a useful error', async () => {
  const { runtime, inputs } = replies([badRecipe, badRecipe]);
  await assert.rejects(runtime.command(commandInput), /Nothing was changed/);
  assert.equal(inputs.length, 2);
  assert.equal(runtime.active, null);
});
test('a conversational reply completes with no unnecessary correction or writes', async () => {
  const { runtime, inputs } = replies([{ message: 'Hello', followUp: false, actions: [] }]);
  const result = await runtime.command(commandInput);
  assert.deepEqual(result.result.actions, []);
  assert.equal(inputs.length, 1);
});
