// Real model/transcription against a candidate; all recipe writes use isolated D1.
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
const service = new URL(process.env.ONION_TEST_URL);
if (service.protocol !== 'https:' || !service.hostname.endsWith('.a.run.app') || !process.env.BRIDGE_SECRET)
  throw new Error('Provide the verified candidate URL and bridge credential.');
let modelCalls = 0;
const mf = new Miniflare({ modules: true, scriptPath: 'dist/server/index.js', compatibilityDate: '2026-05-15', cf: false,
  d1Databases: ['DB'], bindings: { BOOTSTRAP_OWNER_EMAIL: 'capture@test.invalid', BRIDGE_URL: service.origin, BRIDGE_SECRET: process.env.BRIDGE_SECRET },
  outboundService: async request => {
    const url = new URL(request.url); assert.equal(url.origin, service.origin);
    assert.ok(['/recipe','/transcribe'].includes(url.pathname)); if (url.pathname === '/recipe') modelCalls++;
    return fetch(url, { method: 'POST', headers: { 'Content-Type': request.headers.get('Content-Type'), Authorization: request.headers.get('Authorization') }, body: await request.arrayBuffer(), redirect: 'error', signal: AbortSignal.timeout(185000) });
  },
});
let cookie = '';
async function request(path, data) {
  const form = data instanceof FormData;
  const r = await mf.dispatchFetch('https://capture.test' + path, {
    method: data === undefined ? 'GET' : 'POST', headers: { Origin: 'https://capture.test', Cookie: cookie, ...(!form ? { 'Content-Type': 'application/json' } : {}), 'oai-authenticated-user-email': 'capture@test.invalid' },
    ...(data === undefined ? {} : { body: form ? data : JSON.stringify(data) }),
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
  const images = await Promise.all([1,2].map(async i => 'data:image/png;base64,' + (await readFile(`tests/fixtures/recipe-page-${i}.png`)).toString('base64')));
  const input = { id: crypto.randomUUID(), images };
  let started = Date.now();
  const captured = await request('/api/ai/recipe', input);
  assert.equal(captured.completed, true, captured.message);
  const recipe = captured.recipe;
  assert.match(recipe.name, /tomato soup/i);
  assert.equal(recipe.servings, 2);
  assert.ok(recipe.ingredients.some(i => /tomato/i.test(i.name) && i.quantity === 250 && i.unit === 'g'));
  assert.ok(recipe.ingredients.some(i => /water/i.test(i.name) && i.quantity === 100 && i.unit === 'ml'));
  assert.ok(recipe.steps.some(step => /12/.test(step)));
  assert.ok(recipe.steps.some(step => /blend/i.test(step)));
  let snapshot = await request('/api/state');
  assert.equal(Object.keys(snapshot.state.entities.recipes).length, 1);
  assert.equal(Object.keys(snapshot.state.entities.meals).length, 0);
  assert.equal(Object.keys(snapshot.state.entities.items).length, 0);
  assert.ok(!JSON.stringify(snapshot).includes('data:image'));
  console.log(JSON.stringify({ check: 'Two photos, no text; extracted and saved recipe', seconds: Math.round((Date.now()-started)/100)/10, ingredients: recipe.ingredients.length, steps: recipe.steps.length }));
  const calls = modelCalls;
  const replay = await request('/api/ai/recipe', input);
  assert.equal(replay.recipe.id, recipe.id); assert.equal(modelCalls, calls);
  console.log('PASS: retry returned the saved recipe without another model call.');
  started = Date.now();
  const text = await request('/api/ai/recipe', { id: crypto.randomUUID(), text: 'Verification cucumber salad. Serves 1. Ingredients: 200 g cucumber and 1 tsp lemon juice. Slice the cucumber, toss with lemon juice, and serve. Active and total time 5 minutes. Description: a quick cold side dish.' });
  assert.equal(text.completed, true, text.message);
  assert.match(text.recipe.name, /cucumber/i); assert.equal(text.recipe.servings, 1);
  assert.ok(text.recipe.steps.length); assert.ok(text.recipe.ingredients.length >= 2);
  console.log(JSON.stringify({ check: 'One text box; extracted and saved recipe', seconds: Math.round((Date.now()-started)/100)/10 }));
  if (process.env.ONION_TEST_AUDIO) {
    const form = new FormData(); form.append('audio', new Blob([await readFile(process.env.ONION_TEST_AUDIO)], { type: 'audio/wav' }), 'recipe.wav');
    const transcript = await request('/api/transcribe', form);
    assert.match(transcript.text, /cucumber/i);
    const dictated = await request('/api/ai/recipe', { id: crypto.randomUUID(), text: transcript.text });
    assert.equal(dictated.completed, true, dictated.message); assert.match(dictated.recipe.name, /cucumber/i);
    console.log('PASS: voice audio transcribed and saved as a recipe.');
  }
  snapshot = await request('/api/state');
  assert.equal(Object.keys(snapshot.state.entities.recipes).length, process.env.ONION_TEST_AUDIO ? 3 : 2);
  console.log('PASS: live recipe capture; production household unchanged.');
} finally { await mf.dispose(); }
