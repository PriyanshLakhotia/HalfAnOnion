// Real recommendations against a candidate; all household writes use isolated D1.
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
const service = new URL(process.env.ONION_TEST_URL);
if (service.protocol !== 'https:' || !service.hostname.endsWith('.a.run.app') || !process.env.BRIDGE_SECRET)
  throw new Error('Provide the verified candidate URL and bridge credential.');
const mf = new Miniflare({ modules: true, scriptPath: 'dist/server/index.js', compatibilityDate: '2026-05-15', cf: false,
  d1Databases: ['DB'], bindings: { BOOTSTRAP_OWNER_EMAIL: 'capture@test.invalid', BRIDGE_URL: service.origin, BRIDGE_SECRET: process.env.BRIDGE_SECRET },
  outboundService: async request => {
    const url = new URL(request.url); assert.equal(url.origin, service.origin);
    assert.equal(url.pathname, '/command');
    const payload = await request.arrayBuffer();
    const context = JSON.parse(new TextDecoder().decode(payload)).context;
    assert.deepEqual(context.entities.recipes, {}, 'Unaccepted recipes must not enter future context');
    assert.deepEqual(context.entities.suggestions, {}, 'Unaccepted ideas must not enter future context');
    assert.deepEqual(context.recentActivity, [], 'Activity must not leak unaccepted ideas');
    return fetch(url, { method: 'POST', headers: { 'Content-Type': request.headers.get('Content-Type'), Authorization: request.headers.get('Authorization') }, body: payload, redirect: 'error', signal: AbortSignal.timeout(185000) });
  },
});
let cookie = '';
async function request(path, data) {
  const form = data instanceof FormData;
  // Serialize with the host Request before crossing into Miniflare's fetch implementation.
  const multipart = form ? new Request('https://capture.test', { method: 'POST', body: data }) : null;
  const payload = multipart ? await multipart.arrayBuffer() : data === undefined ? undefined : JSON.stringify(data);
  const r = await mf.dispatchFetch('https://capture.test' + path, {
    method: data === undefined ? 'GET' : 'POST', headers: { Origin: 'https://capture.test', Cookie: cookie, 'Content-Type': multipart?.headers.get('Content-Type') ?? 'application/json', 'oai-authenticated-user-email': 'capture@test.invalid' },
    ...(data === undefined ? {} : { body: payload }),
  });
  if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  const result = await r.json(); assert.equal(r.status, 200, JSON.stringify(result)); return result;
}
try {
  const db = await mf.getD1Database('DB');
  for (const file of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort())
    for (const sql of (await readFile('drizzle/' + file, 'utf8')).split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  await request('/api/auth/register', { username: 'captureowner', name: 'Test cook', password: 'isolated-capture-test-123' });
  await request('/api/profile', { name: 'Test cook', profile: { diet: 'vegan', eggs: 'no', dairy: 'no', onboarded: true } });
  const proposed = await request('/api/ai/command', { id: crypto.randomUUID(), text: 'Suggest one simple vegan rice and chickpea recipe for dinner for me. I am only considering it; do not plan it yet.' });
  assert.equal(proposed.completed, true, proposed.message);
  let snapshot = await request('/api/state');
  const recipes = Object.values(snapshot.state.entities.recipes);
  assert.ok(recipes.length > 0);
  assert.ok(recipes.every(r => r.collection === 'suggested'));
  assert.equal(Object.keys(snapshot.state.entities.meals).length, 0);
  assert.ok(Object.values(snapshot.state.entities.suggestions).some(s => s.kind === 'recipe'));
  console.log('PASS: real recipe recommendation stays an unsaved suggestion.');
  const restaurant = await request('/api/ai/command', { id: crypto.randomUUID(), text: 'Recommend one restaurant in central Amsterdam for a casual vegan dinner for me. General knowledge is fine; I will check current opening hours and the menu myself. I am only considering it, so do not plan it yet.' });
  assert.equal(restaurant.completed, true, restaurant.message);
  snapshot = await request('/api/state');
  assert.equal(Object.keys(snapshot.state.entities.recipes).length, recipes.length);
  assert.equal(Object.keys(snapshot.state.entities.meals).length, 0);
  const venue = Object.values(snapshot.state.entities.suggestions).find(s => s.kind === 'restaurant');
  assert.ok(venue); assert.equal(venue.recipeId, '');
  const beforeItems = snapshot.state.entities.items;
  await request('/api/operations', { id: crypto.randomUUID(), actions: [{ type: 'accept', kind: 'suggestions', id: venue.id, expected: { version: venue.version } }] });
  snapshot = await request('/api/state');
  const visit = Object.values(snapshot.state.entities.meals)[0];
  assert.equal(visit.kind, 'eating-out'); assert.deepEqual(visit.components, []);
  assert.deepEqual(snapshot.state.entities.items, beforeItems);
  console.log('PASS: real restaurant recommendation plans an eating-out visit without recipes or groceries.');
  const r = recipes[0];
  await request('/api/operations', { id: crypto.randomUUID(), actions: [{ type: 'save-recipe', kind: 'recipes', id: r.id, expected: { version: r.version } }] });
  snapshot = await request('/api/state');
  assert.equal(snapshot.state.entities.recipes[r.id].collection, 'saved');
  console.log('PASS: explicit Save recipe adds only the chosen recipe to the library.');
  console.log('PASS: live recommendations; production household unchanged.');
} finally { await mf.dispose(); }
