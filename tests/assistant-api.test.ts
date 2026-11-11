import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';

let mf: Miniflare, cookie = '', ownerId = '', output: any, lastContext: any, lastCapture: any, companionCalls = 0;
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
      assert.ok(['/command', '/recipe'].includes(new URL(request.url).pathname));
      companionCalls++;
      assert.equal(request.headers.get('Authorization'), 'Bearer ' + key);
      lastCapture = await request.json() as any;
      lastContext = lastCapture.context;
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

const capturePhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6QFEAAAAASUVORK5CYII=';
test('photo-only capture forwards ordered photos and saves exactly one recipe; retry does not call the model again', async () => {
  const id = crypto.randomUUID();
  output = packet([{ type: 'put', kind: 'recipes', id: 'captured-soup', data: { name: 'Tomato soup', ingredients: [{ name: 'Tomato', quantity: 250, unit: 'g' }], steps: ['Simmer.'] } }]);
  const before = await state();
  const r = await req('/api/ai/recipe', { id, images: [capturePhoto, capturePhoto] });
  assert.equal(r.status, 200, await r.clone().text());
  const result = await r.json() as any;
  assert.equal(result.recipe.collection, "ours");
  assert.equal(lastCapture.context.entities.recipes["legacy-dal"], undefined);
  assert.equal(result.completed, true); assert.equal(result.recipe.name, 'Tomato soup');
  assert.equal(lastCapture.text, ''); assert.deepEqual(lastCapture.images, [capturePhoto, capturePhoto]);
  const after = await state();
  assert.equal(Object.keys(after.entities.recipes).length, Object.keys(before.entities.recipes).length + 1);
  assert.deepEqual(after.entities.meals, before.entities.meals);
  assert.ok(!JSON.stringify(after).includes('data:image'));
  const calls = companionCalls;
  const replay = await req('/api/ai/recipe', { id, images: [capturePhoto, capturePhoto] });
  assert.equal(replay.status, 200); assert.equal(companionCalls, calls);
  assert.deepEqual(await state(), after);
});
test('capture follow-ups and unrelated model actions cannot write household records', async () => {
  const before = await state();
  output = { ...packet(), followUp: true, message: 'Which dish is this?' };
  let r = await req('/api/ai/recipe', { id: crypto.randomUUID(), text: 'An unreadable recipe' });
  assert.equal(r.status, 200); assert.equal((await r.json() as any).completed, false);
  output = packet([{ type: 'put', kind: 'recipes', id: 'blocked-capture', data: { name: 'Soup' } }, { type: 'put', kind: 'items', id: 'unwanted-grocery', data: { name: 'Tomato' } }]);
  r = await req('/api/ai/recipe', { id: crypto.randomUUID(), text: 'Tomato soup' });
  assert.equal(r.status, 502); assert.deepEqual(await state(), before);
});
test('empty or external-image capture fails before model access; photo payloads can exceed the ordinary text limit', async () => {
  const calls = companionCalls;
  for (const input of [{}, { images: ['https://example.com/recipe.png'] }]) {
    const r = await req('/api/ai/recipe', { id: crypto.randomUUID(), ...input }); assert.equal(r.status, 400);
  }
  assert.equal(companionCalls, calls);
  const large = 'data:image/png;base64,' + Buffer.concat([Buffer.from(capturePhoto.split(',')[1], 'base64'), Buffer.alloc(260000)]).toString('base64');
  output = packet([{ type: 'put', kind: 'recipes', id: 'large-capture', data: { name: 'Large photo recipe' } }]);
  const r = await req('/api/ai/recipe', { id: crypto.randomUUID(), images: [large] });
  assert.equal(r.status, 200, await r.clone().text());
  assert.ok(lastCapture.images[0].length > 250000);
});

test('saved library is isolated from suggestions across chat, capture and scheduled context', async () => {
  const created = await command(packet([{ type: 'put', kind: 'recipes', id: 'unsaved-test', data: { name: 'Unaccepted test recipe' } }]));
  assert.equal(created.status, 200);
  assert.equal((await state()).entities.recipes['unsaved-test'].collection, 'suggested');
  await command(packet());
  assert.equal(lastContext.entities.recipes['unsaved-test'], undefined);
  assert.ok(lastContext.recentActivity.every((a: any) => a.changes.every((c: any) => c.id !== 'unsaved-test')));
  assert.equal((await state()).entities.recipes['captured-soup'].collection, 'ours');
  const context = await req('/internal/jobs/context', {}, true);
  const scheduled = await context.json() as any;
  assert.equal(scheduled.state.entities.recipes['unsaved-test'], undefined);
  assert.equal(scheduled.state.entities.recipes['captured-soup'].collection, 'ours');
  const save = await req('/api/operations', { id: crypto.randomUUID(), actions: [{ type: 'save-recipe', kind: 'recipes', id: 'unsaved-test', expected: { version: 1 } }] });
  assert.equal(save.status, 200, await save.clone().text());
  await command(packet());
  assert.equal((lastContext as any).entities.recipes['unsaved-test'].collection, 'saved');
});
test('restaurant suggestions save and plan through the real API without creating recipes', async () => {
  const before = await state();
  const result = await command(packet([{ type: 'put', kind: 'suggestions', id: 'dinner-out', data: { name: 'Dinner out', kind: 'restaurant', recipeId: '', location: 'Amsterdam', participants: [ownerId], expiresOn: '2099-01-01' } }]));
  assert.equal(result.status, 200, await result.clone().text());
  assert.deepEqual((await state()).entities.recipes, before.entities.recipes);
  const plan = await req('/api/operations', { id: crypto.randomUUID(), actions: [{ type: 'accept', kind: 'suggestions', id: 'dinner-out', data: { date: '2099-01-01' } }] });
  assert.equal(plan.status, 200, await plan.clone().text());
  const after = await state();
  const meal: any = Object.values(after.entities.meals).find((m: any) => m.name === 'Dinner out');
  assert.equal(meal.kind, 'eating-out'); assert.deepEqual(meal.components, []);
  assert.deepEqual(after.entities.recipes, before.entities.recipes);
});
test('offer discovery also excludes ingredients from unaccepted recipes', async () => {
  const response = await command(packet([{ type: 'put', kind: 'recipes', id: 'offer-context-draft', data: { name: 'Unaccepted ingredient test', ingredients: [{ name: 'Unique draft ingredient' }] } }]));
  assert.equal(response.status, 200);
  const discover = async () => {
    const r = await req('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'discovery_context', arguments: { retailer: 'AH' } } });
    const result = await r.json() as any;
    return JSON.parse(result.result.content[0].text).ingredients;
  };
  assert.ok(!(await discover()).includes('Unique draft ingredient'));
  const saved = await req('/api/operations', { id: crypto.randomUUID(), actions: [{ type: 'save-recipe', kind: 'recipes', id: 'offer-context-draft' }] });
  assert.equal(saved.status, 200);
  assert.ok((await discover()).includes('Unique draft ingredient'));
});
