import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export class BusyError extends Error {
  status = 409;
  constructor() { super('The assistant is busy. Try again in a moment.'); }
}

// One generation-fenced object owns credentials, limits and receipts across
// cold starts and overlapping revisions. Never rely on max-instances for locks.
export class StateStore {
  constructor(file = new Storage().bucket(process.env.STATE_BUCKET).file('companion/state.json')) {
    this.file = file;
  }
  async read() {
    try {
      const [meta] = await this.file.getMetadata();
      const [bytes] = await this.file.bucket.file(this.file.name, { generation: meta.generation }).download();
      return { data: JSON.parse(bytes.toString()), generation: meta.generation };
    } catch (e) {
      if (e.code === 404) return { data: {}, generation: 0 };
      throw e;
    }
  }
  async save(data, generation) {
    await this.file.save(JSON.stringify(data), {
      resumable: false, contentType: 'application/json',
      preconditionOpts: { ifGenerationMatch: generation },
    });
  }
  async acquire(purpose) {
    // A page-load status check uses the same credentials as a prompt. Let that
    // short read finish, but never replay work or queue behind another turn.
    const deadline = Date.now() + 15000;
    while (true) {
      const { data, generation } = await this.read();
      if (data.lease?.until > Date.now()) {
        if (purpose !== 'prompt' || data.lease.purpose !== 'status' || Date.now() >= deadline)
          throw new BusyError();
        await delay(500);
        continue;
      }
      data.lease = { owner: randomUUID(), until: Date.now() + 240_000, purpose };
      try {
        await this.save(data, generation);
        return data;
      } catch (error) {
        if (![409, 412].includes(error.code)) throw error;
        if (purpose !== 'prompt' || Date.now() >= deadline) throw new BusyError();
        // Re-read the winning lease to distinguish a status check from a turn.
      }
    }
  }
  async withLease(work, purpose = 'work') {
    const data = await this.acquire(purpose);
    const owner = data.lease.owner;
    const commit = async () => {
      const current = await this.read();
      if (current.data.lease?.owner !== owner || data.lease.until <= Date.now())
        throw new Error('Assistant lease expired; result was not committed.');
      await this.save(data, current.generation);
    };
    try { return await work(data, commit); }
    finally {
      const current = await this.read();
      if (current.data.lease?.owner === owner) {
        delete data.lease;
        await this.save(data, current.generation);
      }
    }
  }
}

export async function once(data, commit, id, work) {
  data.receipts ??= {};
  for (const [key, value] of Object.entries(data.receipts))
    if (Date.now() - value.at > 8 * 86400_000) delete data.receipts[key];
  const prior = data.receipts[id];
  if (prior?.result) return prior.result;
  if (prior) throw new Error('This request was interrupted. Review the kitchen before trying a new instruction.');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
  if (data.budget?.day !== day) data.budget = { day, count: 0 };
  if (data.budget.count >= 30) throw Object.assign(new Error('Daily assistant limit reached.'), { status: 429 });
  data.budget.count++;
  data.receipts[id] = { at: Date.now() };
  await commit(); // Persist the attempt before inference; never silently replay it.
  const result = await work();
  data.receipts[id].result = result;
  await commit();
  return result;
}
