import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore, BusyError, once } from '../state.mjs';
class FakeStore extends StateStore {
  constructor() { super({}); this.data = {}; this.generation = 0; }
  async read() { return { data: structuredClone(this.data), generation: this.generation }; }
  async save(data, generation) {
    if (generation !== this.generation) throw Object.assign(new Error('precondition'), { code: 412 });
    this.data = structuredClone(data); this.generation++;
  }
}
test('overlapping instances cannot acquire the same credentials', async () => {
  const s = new FakeStore();
  await s.withLease(async () => assert.rejects(s.withLease(() => {}), BusyError));
  assert.equal(s.data.lease, undefined);
});
test('a prompt waits for an overlapping status read and runs once', async () => {
  const store = new FakeStore();
  let prompt;
  let calls = 0;
  await store.withLease(async () => {
    prompt = store.withLease(() => ++calls, 'prompt');
    assert.equal(calls, 0);
  }, 'status');
  assert.equal(await prompt, 1);
  assert.equal(store.data.lease, undefined);
});
test('a second prompt is still refused while a turn owns the lease', async () => {
  const store = new FakeStore();
  await store.withLease(() => assert.rejects(store.withLease(() => assert.fail('overlapping prompt ran'), 'prompt'), BusyError), 'prompt');
});
test('fenced worker cannot overwrite a newer owner', async () => {
  const s = new FakeStore();
  await assert.rejects(s.withLease(async (data, commit) => {
    s.data.lease.owner = 'replacement'; s.generation++;
    data.auth = 'old credentials'; await commit();
  }), /lease expired/);
  assert.equal(s.data.auth, undefined);
  assert.equal(s.data.lease.owner, 'replacement');
});
test('receipts and daily attempts survive cold starts; interrupted work is not replayed', async () => {
  const s = new FakeStore(); let calls = 0;
  const run = id => s.withLease((data, commit) => once(data, commit, id, async () => { calls++; return { status: 'completed' }; }));
  await run('one'); await run('one'); assert.equal(calls, 1);
  await assert.rejects(s.withLease((data, commit) => once(data, commit, 'two', async () => { throw new Error('crash'); })), /crash/);
  await assert.rejects(run('two'), /interrupted/);
  assert.equal(s.data.budget.count, 2);
});
test('durable daily guard blocks the 31st request', async () => {
  const s = new FakeStore();
  for (let i = 0; i < 30; i++) await s.withLease((data, commit) => once(data, commit, String(i), async () => ({ ok: true })));
  await assert.rejects(s.withLease((data, commit) => once(data, commit, '31', async () => ({}))), /Daily assistant limit/);
});
