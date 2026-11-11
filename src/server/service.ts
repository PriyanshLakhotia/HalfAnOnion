import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  applyOperation,
  DomainError,
  emptyState,
  operationSchema,
  profileSchema,
  schemas,
  DAY,
  type State,
  type Member,
  type Operation,
} from "../domain/model";
export type Env = {
  DB: D1Database;
  BOOTSTRAP_OWNER_EMAIL?: string;
  BRIDGE_URL?: string;
  BRIDGE_SECRET?: string;
  OPENAI_API_KEY?: string;
  DISCOVERY_SECRET?: string;
  SCHEDULES_CONFIGURED?: string;
};
export type Actor = {
  id: string;
  username: string;
  name: string;
  household_id: string;
  role: string;
  profile: string;
};
export const sha = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export async function body(request: Request, maximum = 250000) {
  if (Number(request.headers.get('Content-Length')) > maximum)
    throw new DomainError("This request is too large.", 413);
  const reader = request.body?.getReader(), decoder = new TextDecoder();
  let raw = '', size = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) { await reader.cancel(); throw new DomainError("This request is too large.", 413); }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError("Invalid request.");
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin !== new URL(request.url).origin)
    throw new DomainError("Reload the app before trying again.", 403);
}
export async function limit(
  db: D1Database,
  key: string,
  max = 20,
  window = 15 * 60000,
) {
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END",
    )
    .bind(key, now + window, now, now, now + window)
    .run();
  const row = await db
    .prepare("SELECT count FROM rate_limits WHERE key=?")
    .bind(key)
    .first<{ count: number }>();
  if (row!.count > max)
    throw new DomainError("Too many attempts. Try again in 15 minutes.", 429);
}
export async function actorFor(request: Request, env: Env) {
  const raw = request.headers
    .get("Cookie")
    ?.match(/(?:^|; )onion_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!raw) return null;
  return await env.DB.prepare(
    "SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires_at>?",
  )
    .bind(await sha(raw), Date.now())
    .first<Actor>();
}
export async function requiredActor(request: Request, env: Env) {
  const actor = await actorFor(request, env);
  if (!actor) throw new DomainError("Sign in again to sync your kitchen.", 401);
  return actor;
}
export async function members(env: Env, household: string): Promise<Member[]> {
  const rows = await env.DB.prepare(
    "SELECT id,name,role,profile FROM accounts WHERE household_id=? ORDER BY created_at",
  )
    .bind(household)
    .all<any>();
  return rows.results.map((r) => ({
    ...r,
    profile: profileSchema.parse(JSON.parse(r.profile)),
  }));
}
export async function snapshot(env: Env, actor: Actor) {
  const row = await env.DB.prepare("SELECT * FROM households WHERE id=?")
    .bind(actor.household_id)
    .first<any>();
  if (!row) throw new DomainError("Household not found.", 404);
  const state = JSON.parse(row.state) as State;
  state.activity = state.activity.filter((x) => Date.now() - x.at < 30 * DAY);
  return {
    user: {
      id: actor.id,
      name: actor.name,
      username: actor.username,
      role: actor.role,
    },
    household: {
      id: row.id,
      name: row.name,
      version: row.version,
      timezone: "Europe/Amsterdam",
    },
    members: await members(env, row.id),
    state,
  };
}
export async function mutate(
  env: Env,
  actor: Actor,
  raw: unknown,
  source: "manual" | "assistant" | "discovery" = "manual",
) {
  const op = operationSchema.parse(raw);
  if (op.actions.some((a) => a.type === "settings") && actor.role !== "owner")
    throw new DomainError("Only the owner can change AI settings.", 403);
  const digest = await sha(JSON.stringify(op));
  for (let attempt = 0; attempt < 5; attempt++) {
    const seen = await env.DB.prepare(
      "SELECT actor,result FROM receipts WHERE id=? AND household_id=?",
    )
      .bind(op.id, actor.household_id)
      .first<any>();
    if (seen) {
      const result = JSON.parse(seen.result);
      if (seen.actor !== actor.id || result.digest !== digest)
        throw new DomainError(
          "This retry does not match the original request.",
          409,
        );
      return result;
    }
    const row = await env.DB.prepare(
      "SELECT state,version FROM households WHERE id=?",
    )
      .bind(actor.household_id)
      .first<any>();
    if (!row) throw new DomainError("Household not found.", 404);
    const { state, label } = applyOperation(
      JSON.parse(row.state),
      op,
      actor.id,
      await members(env, actor.household_id),
      Date.now(),
      source,
    );
    if (JSON.stringify(state).length > 1500000)
      throw new DomainError(
        "Your kitchen is full. Export or remove old records first.",
        413,
      );
    const result = { id: op.id, label, version: row.version + 1, digest };
    const res = await env.DB.batch([
      env.DB.prepare(
        "UPDATE households SET state=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM accounts WHERE id=? AND household_id=?)",
      ).bind(
        JSON.stringify(state),
        actor.household_id,
        row.version,
        actor.id,
        actor.household_id,
      ),
      env.DB.prepare(
        "INSERT INTO receipts (id,actor,household_id,result,created_at) SELECT ?,?,?,?,? WHERE changes()=1",
      ).bind(
        op.id,
        actor.id,
        actor.household_id,
        JSON.stringify(result),
        Date.now(),
      ),
    ]);
    if (res[0].meta.changes) return result;
  }
  throw new DomainError("Your kitchen is being updated. Try again.", 409);
}
const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 letters, numbers or underscores."),
  password: z
    .string()
    .min(12, "Use at least 12 characters.")
    .max(72)
    .refine(
      (p) => new TextEncoder().encode(p).length <= 72,
      "Password must fit within 72 UTF-8 bytes.",
    ),
});
async function session(env: Env, actor: Actor) {
  const raw = token(),
    now = Date.now();
  await env.DB.prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .bind(await sha(raw), actor.id, now + 30 * DAY, now)
    .run();
  return json({ ok: true }, 200, {
    "Set-Cookie": `onion_session=${raw}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30 * 86400}`,
  });
}
export async function authRoute(request: Request, env: Env, path: string) {
  if (path === "/api/auth/status") {
    const actor = await actorFor(request, env);
    return json({
      signedIn: !!actor,
      canCreate:
        !!env.BOOTSTRAP_OWNER_EMAIL &&
        request.headers.get("oai-authenticated-user-email")?.toLowerCase() ===
          env.BOOTSTRAP_OWNER_EMAIL.toLowerCase(),
    });
  }
  if (request.method !== "POST") throw new DomainError("POST required.", 405);
  sameOrigin(request);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  await limit(env.DB, "auth-ip:" + (await sha(ip)));
  if (path === "/api/auth/logout") {
    const raw = request.headers
      .get("Cookie")
      ?.match(/onion_session=([a-f0-9]{64})/)?.[1];
    if (raw)
      await env.DB.prepare("DELETE FROM sessions WHERE hash=?")
        .bind(await sha(raw))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "onion_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    });
  }
  const input = await body(request),
    c = credentials.parse(input);
  await limit(env.DB, "auth-user:" + (await sha(c.username)), 12);
  if (path === "/api/auth/login") {
    const account = await env.DB.prepare(
      "SELECT * FROM accounts WHERE username=?",
    )
      .bind(c.username)
      .first<Actor & { password: string }>();
    const valid = await bcrypt.compare(
      c.password,
      account?.password ??
        "$2b$12$C6UzMDM.H6dfI/f/IKcEe.6hTqZmJEuEWpyC8EGJQS.V1wRLs2bG2",
    );
    if (!account || !valid)
      throw new DomainError("Username or password is incorrect.", 401);
    return session(env, account);
  }
  if (path === "/api/auth/register") {
    const p = z
      .object({
        name: z.string().trim().min(1).max(80),
        householdName: z.string().trim().min(1).max(80).default("Our kitchen"),
        invite: z.string().max(100).optional(),
      })
      .parse(input);
    const id = crypto.randomUUID(),
      now = Date.now(),
      password = await bcrypt.hash(c.password, 12);
    let household: string;
    if (p.invite) {
      const hash = await sha(p.invite);
      const invite = await env.DB.prepare(
        "SELECT * FROM invites WHERE hash=? AND expires_at>? AND revoked=0 AND used_by IS NULL",
      )
        .bind(hash, now)
        .first<any>();
      if (!invite)
        throw new DomainError(
          "This invitation expired or has already been used.",
          410,
        );
      household = invite.household_id;
      const r = await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO accounts (id,username,password,household_id,name,role,profile,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM invites WHERE hash=? AND expires_at>? AND revoked=0 AND used_by IS NULL)",
        ).bind(
          id,
          c.username,
          password,
          household,
          p.name,
          "member",
          JSON.stringify(profileSchema.parse({})),
          now,
          hash,
          now,
        ),
        env.DB.prepare(
          "UPDATE invites SET used_by=? WHERE hash=? AND changes()=1",
        ).bind(id, hash),
      ]);
      if (!r[0].meta.changes)
        throw new DomainError("This invitation has already been used.", 410);
    } else {
      if (
        !env.BOOTSTRAP_OWNER_EMAIL ||
        request.headers.get("oai-authenticated-user-email")?.toLowerCase() !==
          env.BOOTSTRAP_OWNER_EMAIL.toLowerCase()
      )
        throw new DomainError(
          "Use a household invitation, or sign in with ChatGPT once to create your kitchen.",
          403,
        );
      const count = await env.DB.prepare(
        "SELECT count(*) as n FROM households",
      ).first<{ n: number }>();
      if (count!.n)
        throw new DomainError(
          "A kitchen already exists. Sign in or use an invitation.",
          409,
        );
      household = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO households (id,name,state,version,created_at) SELECT ?,?,?,0,? WHERE NOT EXISTS(SELECT 1 FROM households)",
        ).bind(household, p.householdName, JSON.stringify(emptyState()), now),
        env.DB.prepare(
          "INSERT INTO accounts SELECT ?,?,?,?,?,?,?,? WHERE changes()=1",
        ).bind(
          id,
          c.username,
          password,
          household,
          p.name,
          "owner",
          JSON.stringify(profileSchema.parse({})),
          now,
        ),
      ]);
    }
    return session(env, {
      id,
      username: c.username,
      name: p.name,
      household_id: household,
      role: p.invite ? "member" : "owner",
      profile: "{}",
    });
  }
  throw new DomainError("Not found.", 404);
}
export async function accountRoute(
  request: Request,
  env: Env,
  actor: Actor,
  path: string,
) {
  const input = await body(request);
  if (path === "/api/profile") {
    const p = z
      .object({
        name: z.string().trim().min(1).max(80),
        profile: profileSchema,
      })
      .parse(input);
    await env.DB.prepare("UPDATE accounts SET name=?,profile=? WHERE id=?")
      .bind(p.name, JSON.stringify(p.profile), actor.id)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/password") {
    const p = z
      .object({ current: z.string(), password: z.string().min(12).max(72) })
      .parse(input);
    const account = await env.DB.prepare(
      "SELECT password FROM accounts WHERE id=?",
    )
      .bind(actor.id)
      .first<any>();
    if (!(await bcrypt.compare(p.current, account.password)))
      throw new DomainError("Current password is incorrect.", 403);
    await env.DB.batch([
      env.DB.prepare("UPDATE accounts SET password=? WHERE id=?").bind(
        await bcrypt.hash(p.password, 12),
        actor.id,
      ),
      env.DB.prepare("DELETE FROM sessions WHERE account_id=?").bind(actor.id),
    ]);
    return session(env, actor);
  }
  if (path === "/api/invites") {
    if (actor.role !== "owner")
      throw new DomainError(
        "Only the household owner can invite members.",
        403,
      );
    if (input.revoke) {
      await env.DB.prepare(
        "UPDATE invites SET revoked=1 WHERE hash=? AND household_id=?",
      )
        .bind(z.string().parse(input.revoke), actor.household_id)
        .run();
      return json({ ok: true });
    }
    const raw = token(),
      expires = Date.now() + 2 * DAY;
    await env.DB.prepare("INSERT INTO invites VALUES (?,?,?,?,NULL,0)")
      .bind(await sha(raw), actor.household_id, actor.id, expires)
      .run();
    return json({
      url: new URL("/?invite=" + raw, request.url).href,
      expiresAt: expires,
    });
  }
  if (path === "/api/household/delete") {
    if (actor.role !== "owner" || input.confirm !== "DELETE MY HOUSEHOLD")
      throw new DomainError(
        "Only the owner can confirm household deletion.",
        403,
      );
    const acc = await env.DB.prepare("SELECT password FROM accounts WHERE id=?")
      .bind(actor.id)
      .first<any>();
    if (!(await bcrypt.compare(String(input.password), acc.password)))
      throw new DomainError("Password is incorrect.", 403);
    await env.DB.prepare("DELETE FROM households WHERE id=?")
      .bind(actor.household_id)
      .run();
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "onion_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    });
  }
  throw new DomainError("Not found.", 404);
}
