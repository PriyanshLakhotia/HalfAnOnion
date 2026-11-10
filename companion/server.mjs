import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { OAuth2Client } from 'google-auth-library';
import { CodexRuntime } from './codex.mjs';
import { StateStore, once } from './state.mjs';
import { transcribe } from './voice.mjs';
import { runJob } from './jobs.mjs';
import { LoginSessions, streamLogin } from './login.mjs';

const key = process.env.BRIDGE_SECRET;
if (!key || key.length < 32 || !process.env.STATE_BUCKET)
  throw new Error('BRIDGE_SECRET and STATE_BUCKET are required.');
const store = new StateStore();
const oauth = new OAuth2Client();
const home = process.env.CODEX_HOME ?? '/data/codex';
let active = false;
function authorized(header) {
  const got = Buffer.from(header ?? ''), expected = Buffer.from('Bearer ' + key);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
async function schedulerAuthorized(req) {
  if (!process.env.SCHEDULER_EMAIL || !process.env.SERVICE_URL) return false;
  try {
    const ticket = await oauth.verifyIdToken({ idToken: (req.headers.authorization ?? '').replace(/^Bearer /, ''), audience: process.env.SERVICE_URL });
    const claim = ticket.getPayload();
    return claim.email_verified === true && claim.email === process.env.SCHEDULER_EMAIL;
  } catch { return false; }
}
async function withRuntime(work) {
  return store.withLease(async (data, commit) => {
    if (active) throw new Error('The assistant is busy.');
    active = true;
    const runtime = new CodexRuntime({ home });
    let deadline;
    try {
      await rm(home, { recursive: true, force: true });
      await mkdir(home, { recursive: true, mode: 0o700 });
      if (data.auth) await writeFile(home + '/auth.json', data.auth, { mode: 0o600 });
      return await Promise.race([
        work(runtime, data, commit),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Assistant request timed out.')), 190000); }),
      ]);
    } finally {
      clearTimeout(deadline);
      try {
        await runtime.stop();
        try { data.auth = await readFile(home + '/auth.json', 'utf8'); }
        catch (e) { if (e.code === 'ENOENT') delete data.auth; else throw e; }
        await rm(home, { recursive: true, force: true });
      } finally { active = false; }
    }
  });
}
const logins = new LoginSessions(publish => withRuntime(async (runtime, data, commit) => {
  publish(await runtime.connect());
  const status = await runtime.waitForLogin();
  if (!status.connected) throw new Error('Sign-in did not finish. Connect ChatGPT again.');
  data.auth = await readFile(home + '/auth.json', 'utf8');
  await commit();
  return { ...status, transcription: true, transcription_provider: 'whisper' };
}));
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  if (req.url === '/healthz' && req.method === 'GET') return send(200, { ok: true });
  const job = req.url?.match(/^\/jobs\/(recipes|offers-AH|offers-ALDI|offers-Jumbo|offers-PLUS)$/)?.[1];
  if (!(job ? await schedulerAuthorized(req) : authorized(req.headers.authorization)))
    return send(401, { error: 'Unauthorized' });
  if (req.method !== 'POST') return send(405, { error: 'POST required' });
  try {
    const maximum = req.url === '/transcribe' ? 8 * 1024 * 1024 : 250000;
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maximum) return send(413, { error: 'Request too large' });
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (req.url === '/transcribe') {
      if (bytes.length < 300) return send(400, { error: 'Empty recording' });
      return send(200, await store.withLease(() => transcribe(bytes)));
    }
    const input = JSON.parse(bytes.toString() || '{}');
    if (req.url === '/connect') return await streamLogin(logins.connect(), res);
    if (job) return send(200, await runJob(job, input, (id, task) => withRuntime(async (runtime, data, commit) => {
      if (!(await runtime.status()).connected) return { status: 'not-connected' };
      return once(data, commit, id, () => task(runtime));
    })));
    if (req.url === '/status' && active)
      return send(200, { available: true, connected: false, busy: true, login_pending: !!logins.current, transcription: true, transcription_provider: 'whisper' });
    const result = await withRuntime(async (runtime, data, commit) => {
      if (req.url === '/status') return { ...await runtime.status(), transcription: true, transcription_provider: 'whisper' };
      if (req.url === '/models') return { models: await runtime.models() };
      if (req.url === '/disconnect') { const r = await runtime.disconnect(); delete data.auth; return r; }
      if (req.url !== '/command') throw Object.assign(new Error('Not found'), { status: 404 });
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.id) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000)
        throw Object.assign(new Error('Invalid instruction'), { status: 400 });
      return once(data, commit, input.id, () => runtime.command({ text: input.text, context: input.context, model: input.model, reasoning: input.reasoning, priorContext: input.priorContext }));
    });
    if (res.headersSent) res.end(); else send(200, result);
  } catch (error) {
    const message = error.code ? 'Assistant storage is unavailable. Try again later.' : (error.message || 'Assistant unavailable').slice(0, 300);
    if (res.headersSent) res.end(JSON.stringify({ error: message }) + '\n');
    else send(error.status ?? 503, { error: message });
  }
});
server.requestTimeout = 210000;
server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
process.on('SIGTERM', () => server.close(() => process.exit(0)));
