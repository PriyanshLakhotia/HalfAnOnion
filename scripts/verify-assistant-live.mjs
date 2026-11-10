// Opt-in integration check: real companion/model, isolated local Worker/D1.
// Credentials are supplied in memory via environment variables. No production
// household records are read or written; model turns count toward plan limits.
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
const service = new URL(process.env.ONION_TEST_URL);
const creationOnly = process.env.ONION_VERIFY_CREATION_ONLY === '1';
if (service.protocol !== 'https:' || !service.hostname.endsWith('.a.run.app') || !process.env.BRIDGE_SECRET)
  throw new Error('Provide the verified Cloud Run URL and bridge credential.');
const mf = new Miniflare({ modules: true, scriptPath: 'dist/server/index.js', compatibilityDate: '2026-05-15', cf: false,
  d1Databases: ['DB'], bindings: { BOOTSTRAP_OWNER_EMAIL: 'smoke@test.invalid', BRIDGE_URL: service.origin, BRIDGE_SECRET: process.env.BRIDGE_SECRET },
  outboundService: async request => {
    const url = new URL(request.url);
    assert.equal(url.origin, service.origin);
    assert.equal(url.pathname, '/command');
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: request.headers.get('Authorization') }, body: await request.text(), redirect: 'error', signal: AbortSignal.timeout(185000) });
  },
});
let cookie = '';
async function request(path, body) {
  const r = await mf.dispatchFetch('https://smoke.test' + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: 'https://smoke.test', Cookie: cookie, 'Content-Type': 'application/json', 'oai-authenticated-user-email': 'smoke@test.invalid' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
async function command(text) {
  const start = Date.now();
  const result = await request('/api/ai/command', { id: crypto.randomUUID(), text });
  console.log(JSON.stringify({ elapsedSeconds: Math.round((Date.now() - start) / 100) / 10, message: result.message, completed: result.completed }));
  return result;
}
try {
  const db = await mf.getD1Database('DB');
  for (const file of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort())
    for (const sql of (await readFile('drizzle/' + file, 'utf8')).split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  await request('/api/auth/register', { username: 'smokeowner', name: 'Test cook', password: 'isolated-test-password-123' });
  await request('/api/profile', { name: 'Test cook', profile: { diet: 'vegan', eggs: 'no', dairy: 'no', onboarded: true } });
  if (!creationOnly) {
    const hello = await command('Say hello in one short sentence. Do not change anything.');
    assert.equal(hello.completed, false);
  }
  const created = await command('Save a simple vegan red lentil dal recipe named Test Dal for one serving, with ingredients, cooking steps and preparation prerequisites. Plan it for my dinner tomorrow. Add 500 g of red lentils to my shopping list. Mark cumin as usual in my pantry and remember that I prefer mild food. These are explicit instructions; use your reasonable estimates for the recipe amounts.');
  assert.equal(created.completed, true, 'The creation request must save actions.');
  let snap = await request('/api/state');
  const recipe = Object.values(snap.state.entities.recipes).find(r => r.name === 'Test Dal');
  assert.ok(recipe); assert.equal(recipe.origin, 'generated'); assert.equal(typeof recipe.prerequisites, 'string');
  assert.ok(recipe.steps.length && recipe.ingredients.length);
  assert.ok(Object.values(snap.state.entities.meals).some(m => m.components.some(c => c.recipeId === recipe.id)));
  assert.ok(Object.values(snap.state.entities.items).some(i => i.origin === 'instruction' && i.status === 'confirmed'));
  assert.ok(Object.values(snap.state.entities.pantry).length);
  assert.ok(Object.values(snap.state.entities.memories).length);
  if (!creationOnly) {
  const changed = await command('Change Test Dal to 3 servings, with active time 15 minutes and total time 35 minutes. Keep its ingredients, steps and the planned dinner otherwise unchanged.');
  assert.equal(changed.completed, true);
  snap = await request('/api/state');
  assert.equal(snap.state.entities.recipes[recipe.id].servings, 3);
  assert.equal(snap.state.entities.recipes[recipe.id].activeMinutes, 15);
  assert.equal(snap.state.entities.recipes[recipe.id].totalMinutes, 35);
  const suggested = await command('Propose Test Dal as a recipe suggestion for me tomorrow, expiring two days from today. Save only a suggestion; do not change my meals or groceries.');
  assert.equal(suggested.completed, true);
  snap = await request('/api/state');
  assert.ok(Object.values(snap.state.entities.suggestions).some(s => s.recipeId === recipe.id && s.status === 'proposed'));
  console.log('PASS: real model conversation, recipe/meal/shopping/pantry/preference creation, typed recipe edits, and recipe proposals saved through isolated Worker/D1.');
  } else console.log('PASS: real model recipe, meal, shopping, pantry and preference creation saved through isolated Worker/D1.');
} finally { await mf.dispose(); }
