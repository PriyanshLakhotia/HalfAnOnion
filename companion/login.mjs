// One device login owns the runtime lease. Reopened tabs join that same login
// instead of starting another process or competing for its credentials.
export class LoginSessions {
  constructor(run) { this.run = run; this.current = null; }
  connect() {
    if (this.current) return this.current;
    let ready, failed;
    const code = new Promise((resolve, reject) => { ready = resolve; failed = reject; });
    const session = { code, result: null };
    this.current = session;
    session.result = Promise.resolve().then(() => this.run(value => ready({
      ...value, expires_at: Date.now() + 165000,
    }))).finally(() => { if (this.current === session) this.current = null; });
    // Also reject callers waiting for a code when acquiring the lease/startup fails.
    session.result.catch(failed);
    return session;
  }
}

export async function streamLogin(session, res) {
  const code = await session.code;
  res.setHeader('Content-Type', 'application/x-ndjson');
  const write = event => {
    if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(event) + '\n');
  };
  write(code);
  const timer = setInterval(() => write({ pending: true }), 10000);
  try { write(await session.result); }
  finally { clearInterval(timer); }
  res.end();
}
