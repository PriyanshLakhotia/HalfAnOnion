import test from 'node:test';
import assert from 'node:assert/strict';
import { LoginSessions, streamLogin } from '../login.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
function response() {
  return { lines: [], destroyed: false, writableEnded: false,
    setHeader() {}, write(line) { this.lines.push(JSON.parse(line)); },
    end() { this.writableEnded = true; } };
}
test('reopening sign-in replays its code and completion, including after a closed response', async () => {
  const finish = deferred(); let calls = 0;
  const logins = new LoginSessions(async publish => {
    calls++;
    publish({ user_code: 'test-code', auth_url: 'https://auth.openai.com/device', login_pending: true });
    return finish.promise;
  });
  const first = logins.connect(), a = response();
  const original = streamLogin(first, a);
  await first.code;
  a.destroyed = true;
  const resumed = logins.connect(), b = response();
  const reopened = streamLogin(resumed, b);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(first, resumed);
  assert.equal(a.lines[0].user_code, b.lines[0].user_code);
  assert.ok(b.lines[0].expires_at > Date.now());
  finish.resolve({ connected: true });
  await Promise.all([original, reopened]);
  assert.equal(a.lines.length, 1);
  assert.equal(b.lines[1].connected, true);
  assert.equal(logins.current, null);
});
test('expired login releases the session and a retry gets a fresh code', async () => {
  const finish = deferred(); let calls = 0;
  const logins = new LoginSessions(async publish => {
    publish({ user_code: String(++calls) });
    if (calls === 1) return finish.promise;
    return { connected: true };
  });
  const first = logins.connect(); await first.code;
  finish.reject(new Error('Sign-in expired'));
  await assert.rejects(first.result, /expired/);
  const second = logins.connect();
  assert.equal((await second.code).user_code, '2');
  await second.result;
});
test('startup failures reach code waiters and allow retry', async () => {
  const logins = new LoginSessions(async () => { throw new Error('storage busy'); });
  const first = logins.connect();
  await assert.rejects(first.code, /storage busy/);
  await assert.rejects(first.result, /storage busy/);
  assert.equal(logins.current, null);
});
