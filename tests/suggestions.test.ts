import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, emptyState, pendingSuggestions, profileSchema, schemas, type Entity } from '../src/domain/model';
const now = Date.parse('2026-11-11T10:00:00Z');
const members = ['one', 'two'].map(id => ({ id, name: id, role: 'owner', profile: profileSchema.parse({}) }));
const suggestion = (id: string, overrides = {}): Entity => ({ id, actor: 'one', version: 1, updatedAt: now - 1000,
  ...schemas.suggestions.parse({ name: 'Rajma chawal', recipeId: 'rajma', participants: ['one', 'two'], expiresOn: '2026-11-12', ...overrides }) });
function kitchen() { const s = emptyState(); s.entities.recipes.rajma = { ...schemas.recipes.parse({ name: 'Rajma chawal', tags: ['vegan'] }), id: 'rajma', version: 1, actor: 'one', updatedAt: now }; return s; }
const act = (state: any, actions: any[], source: any = 'assistant') => applyOperation(state, { id: crypto.randomUUID(), actions }, 'one', members, now, source).state;
test('daily output cannot repeat a current proposal, including renamed recipes and participant order', () => {
  const s = kitchen(); s.entities.suggestions.first = suggestion('first');
  const next = act(s, [{ type: 'put', kind: 'suggestions', id: 'second', data: suggestion('second', { name: 'RAJMA   CHAWAL', participants: ['two','one'] }) }]);
  assert.equal(Object.keys(next.entities.suggestions).length, 1);
  assert.equal(pendingSuggestions({ first: suggestion('first'), second: suggestion('second', { name: 'Another title' }) }, '2026-11-11').length, 1);
});
test('expired proposals and distinct participants do not block a fresh suggestion', () => {
  const s = kitchen(); s.entities.suggestions.first = suggestion('first', { expiresOn: '2026-11-10' });
  const next = act(s, [{ type: 'put', kind: 'suggestions', id: 'second', data: suggestion('second') }, { type: 'put', kind: 'suggestions', id: 'third', data: suggestion('third', { participants: ['one'] }) }]);
  assert.equal(pendingSuggestions(next.entities.suggestions, '2026-11-11').length, 2);
});
for (const type of ['accept', 'dismiss']) test(`${type} resolves old duplicate records together and undo restores them`, () => {
  const s = kitchen(); s.entities.suggestions.first = suggestion('first'); s.entities.suggestions.second = suggestion('second');
  const result = act(s, [{ type, kind: 'suggestions', id: 'first' }], 'manual');
  assert.equal(pendingSuggestions(result.entities.suggestions, '2026-11-11').length, 0);
  assert.equal(Object.keys(result.entities.meals).length, type === 'accept' ? 1 : 0);
  const blocked = act(result, [{ type: 'put', kind: 'suggestions', id: 'third', data: suggestion('third') }]);
  assert.equal(blocked.entities.suggestions.third, undefined);
  const undone = act(result, [{ type: 'undo', id: result.activity.at(-1)!.id }], 'manual');
  assert.equal(pendingSuggestions(undone.entities.suggestions, '2026-11-11').length, 1);
  assert.equal(Object.keys(undone.entities.meals).length, 0);
});
