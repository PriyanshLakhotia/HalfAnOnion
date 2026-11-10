import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
let mf: Miniflare, ownerCookie: string, memberCookie: string;
const origin = "https://kitchen.test";
async function req(
  path: string,
  data?: any,
  cookie = "",
  headers: Record<string, string> = {},
) {
  return mf.dispatchFetch(origin + path, {
    method: data ? "POST" : "GET",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
const op = (actions: any[]) => ({ id: crypto.randomUUID(), actions });
before(async () => {
  mf = new Miniflare({
    modules: true,
    scriptPath: "dist/server/index.js",
    compatibilityDate: "2026-05-15",
    d1Databases: ["DB"],
    bindings: { BOOTSTRAP_OWNER_EMAIL: "owner@test.invalid", BRIDGE_SECRET: "test-only-bridge-key-not-a-production-secret" },
    cf: false,
  });
  const db = await mf.getD1Database("DB");
  for (const f of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    for (const sql of (await readFile("drizzle/" + f, "utf8"))
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
});
after(async () => {
  await mf.dispose();
});
test("anonymous callers and uninvited registration cannot access household", async () => {
  assert.equal((await req("/api/state")).status, 401);
  assert.equal(
    (
      await req("/api/auth/register", {
        username: "intruder",
        password: "long-and-strong-pass",
        name: "Outsider",
      })
    ).status,
    403,
  );
});
test("owner creates account, invites second independent account, single use redemption", async () => {
  let r = await req(
    "/api/auth/register",
    { username: "owner", password: "strong-password-123", name: "One" },
    "",
    { "oai-authenticated-user-email": "owner@test.invalid" },
  );
  assert.equal(r.status, 200, await r.clone().text());
  ownerCookie = r.headers.get("set-cookie")!.split(";")[0];
  r = await req("/api/invites", {}, ownerCookie);
  const invite = new URL(((await r.json()) as any).url).searchParams.get(
    "invite",
  );
  r = await req("/api/auth/register", {
    username: "partner",
    password: "different-password-123",
    name: "Two",
    invite,
  });
  assert.equal(r.status, 200, await r.clone().text());
  memberCookie = r.headers.get("set-cookie")!.split(";")[0];
  r = await req("/api/auth/register", {
    username: "other",
    password: "different-password-123",
    name: "Other",
    invite,
  });
  assert.equal(r.status, 410);
  const snap = (await (
    await req("/api/state", undefined, memberCookie)
  ).json()) as any;
  assert.equal(snap.members.length, 2);
  assert.equal(snap.user.username, "partner");
});
test("cross-session changes, retry idempotency and concurrent independent edits", async () => {
  const one = op([
    { type: "put", kind: "items", id: "rice", data: { name: "Rice" } },
  ]);
  assert.equal((await req("/api/operations", one, ownerCookie)).status, 200);
  assert.equal((await req("/api/operations", one, ownerCookie)).status, 200);
  let s = (await (
    await req("/api/state", undefined, memberCookie)
  ).json()) as any;
  assert.equal(Object.keys(s.state.entities.items).length, 1);
  const responses = await Promise.all([
    req(
      "/api/operations",
      op([
        {
          type: "purchase",
          kind: "items",
          id: "rice",
          expected: { status: "confirmed" },
          data: { purchased: true },
        },
      ]),
      ownerCookie,
    ),
    req(
      "/api/operations",
      op([
        { type: "put", kind: "items", id: "paneer", data: { name: "Paneer" } },
      ]),
      memberCookie,
    ),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  );
  s = (await (await req("/api/state", undefined, ownerCookie)).json()) as any;
  assert.equal(s.state.entities.items.rice.status, "purchased");
  assert.equal(s.state.entities.items.paneer.name, "Paneer");
});
test("CSRF and owner-only invitations enforced", async () => {
  assert.equal(
    (
      await req(
        "/api/operations",
        op([{ type: "clear-history" }]),
        ownerCookie,
        { Origin: "https://attacker.test" },
      )
    ).status,
    403,
  );
  assert.equal((await req("/api/invites", {}, memberCookie)).status, 403);
});
test("export excludes passwords, sessions and provider credentials", async () => {
  const result = await (
    await req("/api/export", undefined, ownerCookie)
  ).text();
  assert.ok(!result.includes("password"));
  assert.ok(!result.includes("onion_session"));
  assert.ok(!result.includes("$2b$"));
});
test("AI connection is explicit and never falls back to paid reasoning", async () => {
  const status = (await (
    await req("/api/ai/status", undefined, ownerCookie)
  ).json()) as any;
  assert.equal(status.connected, false);
  assert.equal(status.model, "gpt-6.1-sol");
  assert.equal(status.reasoning, "high");
  assert.equal(
    (
      await req(
        "/api/ai/command",
        { id: crypto.randomUUID(), text: "Add paneer" },
        ownerCookie,
      )
    ).status,
    503,
  );
  assert.equal((await req("/api/ai/connect", {}, memberCookie)).status, 403);
});
test("revoked invitations cannot be redeemed", async () => {
  let r = await req("/api/invites", {}, ownerCookie);
  const invite = new URL(((await r.json()) as any).url).searchParams.get(
    "invite",
  )!;
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(invite)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await req("/api/invites", { revoke: hash }, ownerCookie);
  r = await req("/api/auth/register", {
    username: "revoked",
    password: "different-password-123",
    name: "Revoked",
    invite,
  });
  assert.equal(r.status, 410);
});
test("MCP discovery refuses anonymous tool use and skips unselected chains", async () => {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "discovery_context", arguments: { retailer: "AH" } },
  };
  let r = await req("/mcp", payload);
  assert.equal(((await r.json()) as any).result.isError, true);
  r = await req("/mcp", payload, "", {
    "oai-authenticated-user-email": "owner@test.invalid",
  });
  const result = (await r.json()) as any;
  assert.equal(JSON.parse(result.result.content[0].text).selected, false);
});
test("another household cannot see or mutate original kitchen", async () => {
  const db = await mf.getD1Database("DB");
  const { emptyState } = await import("../src/domain/model");
  await db
    .prepare("INSERT INTO households VALUES (?,?,?,?,?)")
    .bind("foreign", "Other", JSON.stringify(emptyState()), 0, Date.now())
    .run();
  await db
    .prepare("INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?)")
    .bind(
      "foreign-person",
      "foreign",
      "unused",
      "foreign",
      "Foreign",
      "owner",
      "{}",
      Date.now(),
    )
    .run();
  const token = "c".repeat(64);
  const { sha } = await import("../src/server/service");
  await db
    .prepare("INSERT INTO sessions VALUES (?,?,?,?)")
    .bind(await sha(token), "foreign-person", Date.now() + 100000, Date.now())
    .run();
  const cookie = "onion_session=" + token;
  const snap = (await (
    await req("/api/state", undefined, cookie)
  ).json()) as any;
  assert.deepEqual(snap.state.entities.items, {});
  assert.equal(
    (
      await req(
        "/api/operations",
        op([
          {
            type: "patch",
            kind: "items",
            id: "paneer",
            data: { name: "Stolen" },
          },
        ]),
        cookie,
      )
    ).status,
    404,
  );
});

test('scheduled callbacks require their secret and cannot change household plans', async () => {
  const headers = { Authorization: 'Bearer test-only-bridge-key-not-a-production-secret' };
  assert.equal((await req('/internal/jobs/context', {})).status, 401);
  const context = await req('/internal/jobs/context', {}, '', headers);
  assert.equal(context.status, 200);
  const state: any = await context.json();
  assert.equal(JSON.stringify(state).includes('password'), false);
  const forbidden = await req('/internal/jobs/recipes', {
    id: crypto.randomUUID(), message: 'Changed shopping', followUp: false,
    actions: [{ type: 'put', kind: 'items', id: crypto.randomUUID(), data: { name: 'Rice' } }],
  }, '', headers);
  assert.equal(forbidden.status, 403);
  const accepted = await req('/internal/jobs/recipes', {
    id: crypto.randomUUID(), message: 'Accepted plan', followUp: false,
    actions: [{ type: 'put', kind: 'suggestions', id: crypto.randomUUID(), data: { status: 'accepted' } }],
  }, '', headers);
  assert.equal(accepted.status, 403);
  const skipped = await req('/internal/jobs/context', { retailer: 'ALDI' }, '', headers);
  assert.equal((await skipped.json() as any).skipped, true);
});

test('scheduled recipe proposals are saved once and mismatched retries are refused', async () => {
  const headers = { Authorization: 'Bearer test-only-bridge-key-not-a-production-secret' };
  const context: any = await (await req('/internal/jobs/context', {}, '', headers)).json();
  const recipeId = crypto.randomUUID(), suggestionId = crypto.randomUUID();
  const input = { id: crypto.randomUUID(), message: 'A recipe idea', followUp: false, actions: [
    {type: 'put', kind: 'recipes', id: recipeId, data: {name: 'Rice bowl', origin: 'generated'}},
    {type: 'put', kind: 'suggestions', id: suggestionId, data: {name: 'Rice bowl', recipeId, participants: [context.ownerId], status: 'proposed', expiresOn: '2099-01-01'}},
  ] };
  const first = await req('/internal/jobs/recipes', input, '', headers);
  assert.equal(first.status, 200, await first.clone().text());
  const replay = await req('/internal/jobs/recipes', input, '', headers);
  assert.equal(replay.status, 200);
  assert.deepEqual(await first.json(), await replay.json());
  input.actions[0].data.name = 'A different recipe';
  assert.equal((await req('/internal/jobs/recipes', input, '', headers)).status, 409);
});
