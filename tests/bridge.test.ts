import test from 'node:test';
import assert from 'node:assert/strict';
import { aiRoute, bridge, requestBridge } from '../src/server/ai';
import type { Env, Actor } from '../src/server/service';

const env = { BRIDGE_URL: 'https://assistant.example.test', BRIDGE_SECRET: 'test-secret' } as Env;
const actor = { role: 'owner' } as Actor;

test('edge-compatible requests reach the service with manual redirects', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      if (init?.redirect === 'error') throw new TypeError('Invalid redirect value at the edge');
      assert.equal(init?.redirect, 'manual');
      assert.equal(String(url), 'https://assistant.example.test/status');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-secret');
      return Response.json({ available: true, connected: false });
    };
    assert.deepEqual(await bridge(env, '/status'), { available: true, connected: false });
  } finally { globalThis.fetch = original; }
});

test('redirects are rejected without following or forwarding the credential', async () => {
  const original = globalThis.fetch; let requests = 0;
  try {
    globalThis.fetch = async (_url, init) => {
      requests++;
      assert.equal(init?.redirect, 'manual');
      return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example.test' } });
    };
    await assert.rejects(requestBridge(env, '/connect'), (error: any) => error.status === 502 && /redirect/.test(error.message));
    assert.equal(requests, 1);
  } finally { globalThis.fetch = original; }
});

test('owner device sign-in forwards its first code before the stream completes', async () => {
  const original = globalThis.fetch;
  let streamController: ReadableStreamDefaultController<Uint8Array>;
  try {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init?.redirect, 'manual');
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        streamController = controller;
        controller.enqueue(new TextEncoder().encode('{"auth_url":"https://auth.openai.com/codex/device","user_code":"TEST"}\n'));
      } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
    };
    const response = await aiRoute(new Request('https://kitchen.test/api/ai/connect', { method: 'POST' }), env, actor, '/api/ai/connect');
    assert.equal(response.headers.get('Content-Type'), 'application/x-ndjson');
    const reader = response.body!.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /user_code/);
    streamController!.enqueue(new TextEncoder().encode('{"connected":true}\n'));
    streamController!.close();
    assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
    assert.equal((await reader.read()).done, true);
  } finally { globalThis.fetch = original; }
});
