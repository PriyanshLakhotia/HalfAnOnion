import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';

let mf: Miniflare, cookie = '', ownerId = '', output: any, lastContext: any;
const origin = 'https://assistant-kitchen.test';
const key = 'test-assistant-bridge-secret';
async function req(path: string, data?: unknown, scheduled = false) {
  return mf.dispatchFetch(origin + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie,
      ...(scheduled ? { Authorization: 'Bearer ' + key } : {}),
      'oai-authenticated-user-email': 'owner@test.invalid' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
const packet = (actions: any[] = []) => ({ message: 'Ready.', followUp: false, actions });
const state = async () => (await (await req('/api/state')).json() as any).state;
async function command(result: any, id = crypto.randomUUID()) {
  output = result;
  return req('/api/ai/command', { id, text: 'Please update my kitchen.' });
}
before(async () => {
  mf = new Miniflare({ modules: true, scriptPath: 'dist/server/index.js', compatibilityDate: '2026-05-15', cf: false,
    d1Databases: ['DB'], bindings: { BOOTSTRAP_OWNER_EMAIL: 'owner@test.invalid', BRIDGE_SECRET: key, BRIDGE_URL: 'https://companion.test' },
    outboundService: async (request) => {
      assert.equal(new URL(request.url).pathname, '/command');
      assert.equal(request.headers.get('Authorization'), 'Bearer ' + key);
      lastContext = (await request.json() as any).context;
      return new Response(JSON.stringify({ status: 'completed', result: output }), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  const db = await mf.getD1Database('DB');
  for (const file of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort())
    for (const sql of (await readFile('drizzle/' + file, 'utf8')).split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  const response = await req('/api/auth/register', { username: 'owner', password: 'strong-password-123', name: 'Owner' });
  assert.equal(response.status, 200, await response.clone().text());
  cookie = response.headers.get('set-cookie')!.split(';')[0];
  ownerId = (await (await req('/api/state')).json() as any).user.id;
});
after(async () => mf.dispose());

test('real API accepts an ordinary reply with zero actions', async () => {
  const before = await state();
  const response = await command(packet());
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json() as any).completed, false);
  assert.deepEqual(await state(), before);
});
test('the reported recipe response saves successfully through the real API', async () => {
  const response = await command(packet([{ type: 'put', kind: 'recipes', id: 'legacy-dal', data: { name: 'Dal', origin: 'inference', prerequisites: ['Soak lentils', 'Rinse'] } }]));
  assert.equal(response.status, 200, await response.clone().text());
  const recipe = (await state()).entities.recipes['legacy-dal'];
  assert.equal(recipe.origin, 'generated');
  assert.equal(recipe.prerequisites, 'Soak lentils\nRinse');
});
test('recipe, meal and shopping actions save atomically and replay without duplicate writes', async () => {
  const id = crypto.randomUUID();
  const result = packet([
    { type: 'put', kind: 'recipes', id: 'rice-recipe', data: { name: 'Rice', origin: 'generated', ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }], tags: ['vegan'] } },
    { type: 'put', kind: 'meals', id: 'rice-meal', data: { name: 'Rice dinner', date: '2099-01-01', participants: [ownerId], components: [{ name: 'Rice', recipeId: 'rice-recipe', servings: 1, participants: [ownerId] }] } },
    { type: 'put', kind: 'items', id: 'rice-shop', data: { name: 'Rice', origin: 'instruction' } },
  ]);
  const first = await command(result, id);
  assert.equal(first.status, 200, await first.clone().text());
  const before = await state();
  assert.equal(before.entities.items['rice-shop'].status, 'confirmed');
  const replay = await command(result, id);
  assert.equal(replay.status, 200, await replay.clone().text());
  assert.deepEqual(await state(), before);
  assert.ok(lastContext.recentActivity.some((a: any) => a.id === id));
});
test('a malformed batch returns a useful error and writes none of its valid records', async () => {
  const before = await state();
  const response = await command(packet([
    { type: 'put', kind: 'recipes', id: 'must-not-save', data: { name: 'Valid recipe' } },
    { type: 'put', kind: 'items', id: 'bad-item', data: { name: 'Rice', unit: 'grams' } },
  ]));
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /Nothing was changed/);
  assert.doesNotMatch(body, /Invalid enum|Expected|received/);
  assert.deepEqual(await state(), before);
});
test('valid shapes with invalid references also leave the entire batch unchanged', async () => {
  const before = await state();
  const response = await command(packet([
    { type: 'put', kind: 'recipes', id: 'also-must-not-save', data: { name: 'Valid recipe' } },
    { type: 'put', kind: 'meals', id: 'bad-meal', data: { name: 'Dinner', date: '2099-01-01', participants: ['outsider'] } },
  ]));
  assert.equal(response.status, 400);
  assert.deepEqual(await state(), before);
});
test('stale assistant patches cannot overwrite newer edits', async () => {
  const before = await state();
  const response = await command(packet([{ type: 'patch', kind: 'recipes', id: 'legacy-dal', data: { name: 'New name' }, expected: { name: 'Stale name' } }]));
  assert.equal(response.status, 409);
  assert.deepEqual(await state(), before);
});
test('scheduled follow-ups can contain no actions; legacy recipes normalize on the scheduled path', async () => {
  const skipped = await req('/internal/jobs/recipes', { id: crypto.randomUUID(), ...packet(), followUp: true }, true);
  assert.equal(skipped.status, 200, await skipped.clone().text());
  assert.equal((await skipped.json() as any).skipped, true);
  const result = packet([{ type: 'put', kind: 'recipes', id: 'scheduled-dal', data: { name: 'Dal', origin: 'inference', prerequisites: ['Soak lentils'] } }]);
  const response = await req('/internal/jobs/recipes', { id: crypto.randomUUID(), ...result }, true);
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await state()).entities.recipes['scheduled-dal'].prerequisites, 'Soak lentils');
});
