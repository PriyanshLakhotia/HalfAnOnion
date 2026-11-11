import test from 'node:test';
import assert from 'node:assert/strict';
import { recipeCaptureSchema, MAX_RECIPE_PHOTOS } from '../src/domain/recipe-capture';
import { validateAssistantResult } from '../src/domain/assistant';
import { emptyState } from '../src/domain/model';
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6QFEAAAAASUVORK5CYII=';
test('recipe capture accepts text alone or several photos without text', () => {
  assert.equal(recipeCaptureSchema.parse({ id: crypto.randomUUID(), text: 'My dal' }).images.length, 0);
  assert.equal(recipeCaptureSchema.parse({ id: crypto.randomUUID(), images: [photo, photo] }).text, '');
});
test('empty, remote, disguised, malformed and excessive images are rejected', () => {
  for (const images of [[], ['https://example.com/recipe.jpg'], ['data:image/svg+xml;base64,PHN2Zz4='], ['data:image/jpeg;base64,aGVsbG8='], ['data:image/png;base64,???'], Array(MAX_RECIPE_PHOTOS + 1).fill(photo)])
    assert.equal(recipeCaptureSchema.safeParse({ id: crypto.randomUUID(), images }).success, false);
});
test('recipe capture cannot modify existing records or perform unrelated kitchen actions', () => {
  for (const actions of [
    [{ type: 'put', kind: 'items', id: 'x', data: { name: 'Rice' } }],
    [{ type: 'put', kind: 'recipes', id: 'x', data: { name: 'Rice' } }, { type: 'put', kind: 'recipes', id: 'y', data: { name: 'Beans' } }],
    [{ type: 'remove', kind: 'recipes', id: 'x' }],
  ]) assert.throws(() => validateAssistantResult({ message: 'Done', followUp: false, actions }, emptyState(), 'one', [], 'recipe-capture'));
  const result = validateAssistantResult({ message: 'What is the dish?', followUp: true, actions: [] }, emptyState(), 'one', [], 'recipe-capture');
  assert.equal(result.followUp, true);
});
