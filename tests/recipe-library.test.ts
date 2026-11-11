import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, assistantState, emptyState, normalizeRecipeCollections, suggestedRecipes, pendingSuggestions, profileSchema, type State, type Operation } from '../src/domain/model';
import { parseAssistantResult } from '../src/domain/assistant';
const now = Date.parse('2026-11-11T10:00:00Z');
const members = [{ id: 'me', name: 'Me', role: 'owner', profile: profileSchema.parse({}) }];
const recipe = (id = 'r', name = 'Rice') => ({ type: 'put', kind: 'recipes', id, data: { name, origin: 'generated', ingredients: [{ name: 'Rice', quantity: 100, unit: 'g' }] } });
const idea = (id = 's', overrides = {}) => ({ type: 'put', kind: 'suggestions', id, data: { name: 'Rice', recipeId: 'r', participants: ['me'], expiresOn: '2026-11-13', ...overrides } });
const act = (state: State, actions: any[], source: 'manual' | 'assistant' | 'capture' = 'assistant') => applyOperation(state, { id: crypto.randomUUID(), actions } as Operation, 'me', members, now, source).state;
const kitchen = () => act(emptyState(), [recipe(), idea()]);
test('assistant recipes require an explicit manual save, independently of planning', () => {
  const s = kitchen();
  assert.equal(s.entities.recipes.r.collection, 'suggested');
  const planned = act(s, [{ type: 'accept', kind: 'suggestions', id: 's' }], 'manual');
  assert.equal(planned.entities.recipes.r.collection, 'suggested');
  const saved = act(planned, [{ type: 'save-recipe', kind: 'recipes', id: 'r', expected: { version: 1 } }], 'manual');
  assert.equal(saved.entities.recipes.r.collection, 'saved');
  assert.equal(Object.keys(saved.entities.meals).length, 1);
  assert.throws(() => act(s, [{ type: 'save-recipe', kind: 'recipes', id: 'r' }]), /Save button/);
  assert.throws(() => act(s, [{ type: 'patch', kind: 'recipes', id: 'r', data: { collection: 'ours' } }]), /Save button/);
  assert.throws(() => parseAssistantResult({ message: '', actions: [{ type: 'put', kind: 'recipes', id: 'bad', data: { name: 'Bad', collection: 'ours' } }] }));
});
test('manual and captured recipes stay ours after AI edits', () => {
  for (const source of ['manual', 'capture'] as const) {
    const s = act(emptyState(), [recipe()], source);
    const edited = act(s, [{ type: 'patch', kind: 'recipes', id: 'r', data: { notes: 'Edited' }, expected: { notes: '' } }]);
    assert.equal(edited.entities.recipes.r.collection, 'ours');
  }
});
test('save and dismissal are reversible and preserve other household data', () => {
  for (const type of ['save-recipe', 'dismiss-recipe']) {
    const s = kitchen(), changed = act(s, [{ type, kind: 'recipes', id: 'r' }], 'manual');
    assert.equal(suggestedRecipes(changed, '2026-11-11').length, 0);
    if (type === 'dismiss-recipe') assert.equal(changed.entities.suggestions.s.status, 'dismissed');
    const undone = act(changed, [{ type: 'undo', id: changed.activity.at(-1)!.id }], 'manual');
    assert.equal(undone.entities.recipes.r.collection, 'suggested');
    assert.equal(undone.entities.suggestions.s.status, 'proposed');
    assert.equal(suggestedRecipes(undone, '2026-11-11').length, 1);
  }
});
test('unaccepted ideas are excluded from entities AND activity in future assistant context', () => {
  const s = act(kitchen(), [recipe('own', 'Our soup')], 'capture');
  const context = assistantState(s);
  assert.deepEqual(Object.keys(context.entities.recipes), ['own']);
  assert.deepEqual(context.entities.suggestions, {});
  assert.ok(context.activity.every(a => a.changes.every(c => c.id !== 'r' && c.id !== 's')));
  assert.equal(s.entities.recipes.r.collection, 'suggested', 'filtering must not mutate storage');
  const saved = act(s, [{ type: 'save-recipe', kind: 'recipes', id: 'r' }], 'manual');
  assert.ok(assistantState(saved).entities.recipes.r);
  const planned = act(s, [{ type: 'accept', kind: 'suggestions', id: 's' }], 'manual');
  assert.equal(assistantState(planned).entities.recipes.r.collection, 'suggested', 'accepted plan is available without pretending it is saved');
});
test('legacy suggestions move out of our recipes, preserving captured and later edited recipes', () => {
  const s = act(kitchen(), [recipe('capture', 'Our soup')], 'capture');
  const legacy = JSON.parse(JSON.stringify(s, (key, value) => key === 'collection' ? undefined : value));
  const migrated = normalizeRecipeCollections(legacy);
  assert.equal(migrated.entities.recipes.r.collection, 'suggested');
  assert.equal(migrated.entities.recipes.capture.collection, 'ours');
  assert.doesNotThrow(() => act(migrated, [{ type: 'undo', id: migrated.activity.at(-1)!.id }], 'manual'));
  const fallback = structuredClone(legacy); fallback.activity = []; delete fallback.entities.recipes.r.collection;
  assert.equal(normalizeRecipeCollections(fallback).entities.recipes.r.collection, 'suggested');
});
test('duplicate daily outputs do not leave orphan recipe cards', () => {
  const s = act(kitchen(), [recipe('duplicate'), idea('duplicate-idea', { recipeId: 'duplicate' })]);
  assert.equal(s.entities.recipes.duplicate, undefined);
  assert.equal(s.entities.suggestions['duplicate-idea'], undefined);
  assert.equal(suggestedRecipes(s, '2026-11-11').length, 1);
  assert.equal(suggestedRecipes(s, '2026-11-14').length, 0);
});
test('restaurant recommendations are distinct ideas, never recipes or groceries', () => {
  const s = act(emptyState(), [idea('restaurant1', { name: 'Cafe One', kind: 'restaurant', recipeId: '', location: 'Amsterdam', url: 'https://example.com', reason: 'A place for dinner.' }), idea('restaurant2', { name: 'Cafe Two', kind: 'restaurant', recipeId: '' })]);
  assert.equal(pendingSuggestions(s.entities.suggestions, '2026-11-11').length, 2, 'empty recipe IDs must not cause deduplication');
  assert.deepEqual(s.entities.recipes, {});
  const planned = act(s, [{ type: 'accept', kind: 'suggestions', id: 'restaurant1' }], 'manual');
  const meal = Object.values(planned.entities.meals)[0];
  assert.equal(meal.kind, 'eating-out'); assert.deepEqual(meal.components, []);
  assert.match(meal.notes, /Amsterdam/); assert.match(meal.notes, /https:\/\/example.com/);
  assert.deepEqual(planned.entities.recipes, {}); assert.deepEqual(planned.entities.items, {});
  assert.throws(() => act(s, [idea('invalid', { kind: 'restaurant', recipeId: 'fake' })]), /cannot reference/);
  assert.throws(() => act(s, [idea('invalid', { kind: 'restaurant', recipeId: '', url: 'javascript:alert(1)' })]));
});
test('general meal ideas can be planned without a fabricated recipe', () => {
  const s = act(emptyState(), [idea('takeaway', { name: 'Takeaway tonight', kind: 'meal', recipeId: '' })]);
  const planned = act(s, [{ type: 'accept', kind: 'suggestions', id: 'takeaway' }], 'manual');
  assert.equal(Object.values(planned.entities.meals)[0].kind, 'undecided');
  assert.deepEqual(planned.entities.recipes, {});
});
