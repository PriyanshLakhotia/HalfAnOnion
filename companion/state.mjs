import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'node:crypto';

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
  async withLease(work) {
    const { data, generation } = await this.read();
    if (data.lease?.until > Date.now()) throw new BusyError();
    const owner = randomUUID();
    data.lease = { owner, until: Date.now() + 240_000 };
    try { await this.save(data, generation); }
    catch (e) { if ([409, 412].includes(e.code)) throw new BusyError(); throw e; }
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
