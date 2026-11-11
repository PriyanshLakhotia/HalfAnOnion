import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { assistantOutputSchema, offerOutputSchema, decodeAssistantOutput, parseAssistantResult, validateAssistantResult, validateModelResult } from '../src/domain/assistant';
import { schemas, emptyState, profileSchema, applyOperation, type Kind, type Entity } from '../src/domain/model';

const ajv = new Ajv({ strict: false, allowUnionTypes: true });
addFormats(ajv);
const validWire = ajv.compile(assistantOutputSchema), validOffer = ajv.compile(offerOutputSchema);
const member = { id: 'owner', name: 'Owner', role: 'owner', profile: profileSchema.parse({ diet: 'vegan', eggs: 'no', dairy: 'no' }) };
const fixtures: Record<string, any> = {
  stores: { name: 'Local market' }, items: { name: 'Rice', origin: 'instruction' },
  recipes: { name: 'Rice bowl', origin: 'generated', tags: ['vegan'], prerequisites: 'Rinse the rice.', ingredients: [{ name: 'Rice' }] },
  meals: { name: 'Rice dinner', date: '2099-01-01', participants: ['owner'], components: [{ name: 'Rice', recipeId: 'recipes-1', participants: ['owner'], servings: 1 }] },
  pantry: { name: 'Rice', state: 'usual' }, memories: { fact: 'I like rice', scope: 'owner' },
  suggestions: { name: 'Rice bowl', recipeId: 'recipes-1', participants: ['owner'], expiresOn: '2099-01-02' },
};
const state = emptyState();
for (const [kind, data] of Object.entries(fixtures)) state.entities[kind as Kind][kind + '-1'] = {
  ...schemas[kind as Kind].parse(data), id: kind + '-1', actor: 'owner', updatedAt: 1, version: 1,
} as Entity;
const packet = (actions: any[]) => ({ message: 'Ready.', followUp: false, actions });

test('generated contract is strict at every object and its recipe fields match storage', () => {
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort());
    }
    assert.equal(node.default, undefined);
    Object.values(node).forEach(v => Array.isArray(v) ? v.forEach(walk) : walk(v));
  };
  walk(assistantOutputSchema); walk(offerOutputSchema);
  const recipe = assistantOutputSchema.properties.actions.items.anyOf.find((a: any) => a.properties.type.const === 'put' && a.properties.kind.const === 'recipes');
  assert.deepEqual(recipe.properties.data.properties.origin.enum, ['manual', 'link', 'generated', 'variation']);
  assert.equal(recipe.properties.data.properties.prerequisites.type, 'string');
});
for (const [kind, input] of Object.entries(fixtures)) {
  test(`${kind}: a model creation passes JSON schema, decoding and actual domain validation`, () => {
    const initial = structuredClone(state);
    if (kind === 'suggestions') initial.entities.suggestions = {};
    const data = (kind === "recipes" ? schemas.recipes.omit({ collection: true }) : schemas[kind as Kind]).parse(input);
    const raw = packet([{ type: 'put', kind, id: kind + '-2', data }]);
    assert.ok(validWire(raw), JSON.stringify(validWire.errors));
    const decoded = decodeAssistantOutput(raw);
    assert.doesNotThrow(() => validateAssistantResult(decoded, initial, member.id, [member]));
    const saved = applyOperation(initial, { id: crypto.randomUUID(), actions: decoded.actions }, member.id, [member], Date.now(), 'assistant');
    assert.ok(saved.state.entities[kind as Kind][kind + '-2']);
  });
  test(`${kind}: typed patches preserve unrelated fields and reject stale values`, () => {
    const field = kind === 'memories' ? 'fact' : 'name', old = state.entities[kind as Kind][kind + '-1'];
    const raw = packet([{ type: 'patch', kind, id: old.id, changes: [{ field, value: 'Updated', expected: old[field] }] }]);
    assert.ok(validWire(raw), JSON.stringify(validWire.errors));
    const decoded = decodeAssistantOutput(raw);
    assert.doesNotThrow(() => validateAssistantResult(decoded, state, member.id, [member]));
    decoded.actions[0].expected[field] = 'Stale';
    assert.throws(() => validateAssistantResult(decoded, state, member.id, [member]), /another device/);
  });
}
test('the reported legacy recipe response is normalized without discarding its content', () => {
  const parsed = parseAssistantResult(packet([{ type: 'put', kind: 'recipes', id: 'new', data: { name: 'Dal', origin: 'inference', prerequisites: ['Soak lentils', 'Rinse'] } }]));
  assert.equal(parsed.actions[0].data!.origin, 'generated');
  assert.equal(parsed.actions[0].data!.prerequisites, 'Soak lentils\nRinse');
});
test('empty actions are accepted for replies and follow-ups; follow-ups cannot also write', () => {
  assert.ok(validWire(packet([])));
  assert.deepEqual(parseAssistantResult(packet([])).actions, []);
  assert.doesNotThrow(() => validateAssistantResult({ ...packet([]), followUp: true }, state, member.id, [member]));
  assert.throws(() => parseAssistantResult({ ...packet([{ type: 'put', kind: 'recipes', id: 'r', data: { name: 'Rice' } }]), followUp: true }), /follow-up/);
});
test('invalid enums, types, limits, unknown fields and dates cannot become saved model actions', () => {
  for (const [kind, changes] of [
    ['recipes', { origin: 'inference' }], ['recipes', { prerequisites: ['Soak'] }], ['recipes', { servings: 'two' }],
    ['recipes', { steps: 'Cook' }], ['recipes', { tags: 'vegan' }], ['recipes', { activeMinutes: -1 }],
    ['items', { unit: 'grams' }], ['items', { quantity: 0 }], ['pantry', { state: 'plenty' }],
    ['meals', { participants: 'owner' }], ['memories', { confidence: 2 }], ['suggestions', { reason: ['Cheap'] }],
    ['recipes', { unexpectedField: true }],
  ] as [Kind, Record<string, unknown>][]) {
    const raw = packet([{ type: 'put', kind, id: 'new', data: { ...(kind === "recipes" ? schemas.recipes.omit({ collection: true }) : schemas[kind]).parse(fixtures[kind]), ...changes } }]);
    assert.equal(validWire(raw), false, kind + JSON.stringify(changes));
    assert.throws(() => decodeAssistantOutput(raw));
  }
  assert.throws(() => validateModelResult(packet([{ type: 'put', kind: 'meals', id: 'new', data: { ...schemas.meals.parse(fixtures.meals), date: '2099-02-30' } }]), { entities: state.entities, members: [member], speaker: member.id }));
});
test('domain preflight rejects unknown references and dietary violations without mutating the snapshot', () => {
  const before = structuredClone(state);
  for (const data of [
    { ...schemas.suggestions.parse(fixtures.suggestions), recipeId: 'missing' },
    { ...schemas.suggestions.parse(fixtures.suggestions), participants: ['outsider'] },
  ]) assert.throws(() => validateAssistantResult(packet([{ type: 'put', kind: 'suggestions', id: 'new', data }]), state, member.id, [member]));
  const unsafe = structuredClone(state); unsafe.entities.recipes['recipes-1'].ingredients = [{ name: 'Milk' }];
  assert.throws(() => validateAssistantResult(packet([{ type: 'put', kind: 'suggestions', id: 'new', data: fixtures.suggestions }]), unsafe, member.id, [member]), /dietary/);
  assert.deepEqual(state, before);
});
test('status actions are typed, patches cannot change item provenance, and schedules stay proposal-only', () => {
  const raw = packet([{ type: 'purchase', kind: 'items', id: 'items-1', purchased: true, expectedVersion: 1 }]);
  assert.ok(validWire(raw));
  assert.doesNotThrow(() => validateAssistantResult(decodeAssistantOutput(raw), state, member.id, [member]));
  assert.equal(validWire(packet([{ type: 'patch', kind: 'items', id: 'items-1', changes: [{ field: 'origin', value: 'instruction', expected: 'inference' }] }])), false);
  assert.throws(() => validateAssistantResult(packet([{ type: 'put', kind: 'items', id: 'new', data: fixtures.items }]), state, member.id, [member], 'recipes'), /Scheduled/);
  assert.throws(() => parseAssistantResult(packet([{ type: 'settings', data: { model: 'anything' } }])), /settings/);
});
test('offers use the same field limits and only supplied retailer evidence', () => {
  const raw = { status: 'success', note: '', offers: [schemas.offers.parse({ name: 'Rice', retailer: 'AH', terms: '2 for 1', price: null, start: '2099-01-01', end: '2099-01-07', sourceUrl: 'https://www.ah.nl/bonus', fetchedAt: Date.now(), scope: 'national', productKey: 'rice' })] };
  const context = { retailer: 'AH', pages: [{ url: 'https://www.ah.nl/bonus' }] };
  assert.ok(validOffer(raw), JSON.stringify(validOffer.errors));
  assert.doesNotThrow(() => validateModelResult(raw, context, 'offers'));
  raw.offers[0].sourceUrl = 'https://other.example/offer';
  assert.throws(() => validateModelResult(raw, context, 'offers'), /evidence/);
});
test('accept, dismiss, purchase, forget and remove decode into the expected domain behavior', () => {
  for (const [action, expected] of [
    [{ type: 'accept', kind: 'items', id: 'items-1', expectedVersion: 1 }, 'confirmed'],
    [{ type: 'dismiss', kind: 'items', id: 'items-1', expectedVersion: 1 }, 'dismissed'],
    [{ type: 'accept', kind: 'suggestions', id: 'suggestions-1', expectedVersion: 1, date: '2099-01-01' }, 'accepted'],
    [{ type: 'dismiss', kind: 'suggestions', id: 'suggestions-1', expectedVersion: 1 }, 'dismissed'],
    [{ type: 'purchase', kind: 'items', id: 'items-1', expectedVersion: 1, purchased: true }, 'purchased'],
    [{ type: 'forget', kind: 'memories', id: 'memories-1', expectedVersion: 1 }, true],
    [{ type: 'remove', kind: 'pantry', id: 'pantry-1', expectedVersion: 1 }, undefined],
  ] as [any, any][]) {
    const kitchen = structuredClone(state);
    if (['accept', 'dismiss'].includes(action.type) && action.kind === 'items') kitchen.entities.items['items-1'].status = 'proposed';
    const raw = packet([action]);
    assert.ok(validWire(raw), JSON.stringify(validWire.errors));
    const decoded = decodeAssistantOutput(raw);
    const parsed = validateAssistantResult(decoded, kitchen, member.id, [member]);
    const saved = applyOperation(kitchen, { id: crypto.randomUUID(), actions: parsed.actions }, member.id, [member], Date.now(), 'assistant').state;
    const record = saved.entities[action.kind as Kind][action.id];
    assert.equal(action.type === 'forget' ? record.forgotten : record?.status, expected);
    if (action.type === 'accept' && action.kind === 'suggestions') assert.ok(Object.values(saved.entities.meals).some(m => m.date === action.date && m.components.some((c: any) => c.recipeId === 'recipes-1')));
  }
});
test('groceries and undo use valid operation payloads and preserve domain safeguards', () => {
  const grocery = packet([{ type: 'groceries', from: '2099-01-01', to: '2099-01-01', confirm: true }]);
  assert.ok(validWire(grocery));
  assert.doesNotThrow(() => validateAssistantResult(decodeAssistantOutput(grocery), state, member.id, [member]));
  const id = crypto.randomUUID();
  const changed = applyOperation(state, { id, actions: [{ type: 'put', kind: 'pantry', id: 'temporary', data: { name: 'Temporary' } }] }, member.id, [member], Date.now(), 'assistant').state;
  const undo = packet([{ type: 'undo', id }]);
  assert.ok(validWire(undo));
  const parsed = validateAssistantResult(decodeAssistantOutput(undo), changed, member.id, [member]);
  const restored = applyOperation(changed, { id: crypto.randomUUID(), actions: parsed.actions }, member.id, [member], Date.now(), 'assistant').state;
  assert.equal(restored.entities.pantry.temporary, undefined);
});
