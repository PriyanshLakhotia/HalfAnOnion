import test from 'node:test';
import assert from 'node:assert/strict';
import { evidence, requestId, sources } from '../jobs.mjs';
test('daily scheduler retries have stable UUID receipts', () => {
  assert.equal(requestId('recipes', '2026-11-10'), requestId('recipes', '2026-11-10'));
  assert.notEqual(requestId('recipes', '2026-11-10'), requestId('recipes', '2026-11-11'));
  assert.match(requestId('recipes', '2026-11-10'), /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/);
  assert.equal(sources['Bahar Delft'], undefined);
});
test('blocked and unreadable retailer pages cannot masquerade as empty offers', async () => {
  await assert.rejects(evidence('https://www.ah.nl/bonus', async () => new Response('Access denied'.repeat(100), { headers: { 'content-type': 'text/html' } })), /unavailable/);
  await assert.rejects(evidence('https://www.ah.nl/bonus', async () => new Response('', { status: 403 })), /unavailable/);
});
test('source collection retains dated structured evidence and strips executable content', async () => {
  const result = await evidence('https://www.ah.nl/bonus', async () => new Response('<body><script>bad()</script><script type="application/ld+json">{"validThrough":"2026-11-15"}</script>' + 'Vegetables discounted. '.repeat(30) + '</body>', { headers: { 'content-type': 'text/html' } }));
  assert.match(result.text, /2026-11-15/);
  assert.doesNotMatch(result.text, /bad\(\)/);
  assert.equal(result.url, 'https://www.ah.nl/bonus');
});
