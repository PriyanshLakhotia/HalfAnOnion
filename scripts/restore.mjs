import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
const [, , origin, file, ...flags] = process.argv;
if (!origin || !file)
  throw new Error(
    "Usage: node scripts/restore.mjs https://your-site export.json [--apply]",
  );
if (new URL(origin).protocol !== "https:") throw new Error("Use HTTPS.");
const backup = JSON.parse(await readFile(file, "utf8"));
if (backup.format !== "half-an-onion-v1")
  throw new Error("Unsupported export.");
// Do not pass a cookie in shell arguments or store it in source.
if (process.stdin.isTTY)
  spawnSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });
console.log("Enter JSON with username and password on hidden stdin.");
const rl = createInterface({ input: process.stdin, terminal: false });
const credentials = JSON.parse(await new Promise((r) => rl.once("line", r)));
rl.close();
const login = await fetch(origin + "/api/auth/login", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify(credentials),
});
if (!login.ok) throw new Error("Sign-in failed.");
const cookie = login.headers.get("set-cookie").split(";")[0];
async function request(path, data) {
  const r = await fetch(origin + path, {
    method: data ? "POST" : "GET",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error);
  return result;
}
const current = await request("/api/state");
if (
  current.user.role !== "owner" ||
  current.household.id !== backup.household.id
)
  throw new Error("Restore requires the owner of the original household.");
const kinds = [
  "stores",
  "recipes",
  "pantry",
  "memories",
  "meals",
  "items",
  "suggestions",
];
const actions = [];
for (const kind of kinds)
  for (const [id, record] of Object.entries(backup.state.entities[kind])) {
    if (id === "any") continue;
    if (kind === "items" && !["confirmed", "purchased"].includes(record.status))
      continue;
    if (kind === "suggestions") continue;
    const { updatedAt, actor, version, id: unused, ...data } = record;
    const old = current.state.entities[kind][id];
    if (old) {
      if (kind === "items") {
        delete data.status;
        delete data.origin;
        delete data.sourceKey;
      }
      const changed = Object.fromEntries(
        Object.entries(data).filter(
          ([k, v]) => JSON.stringify(old[k]) !== JSON.stringify(v),
        ),
      );
      if (Object.keys(changed).length)
        actions.push({
          type: "patch",
          kind,
          id,
          data: changed,
          expected: Object.fromEntries(
            Object.keys(changed).map((k) => [k, old[k]]),
          ),
        });
    } else {
      actions.push({ type: "put", kind, id, data });
      if (kind === "items" && record.status === "purchased")
        actions.push({ type: "purchase", kind, id, data: { purchased: true } });
    }
  }
console.log(
  JSON.stringify(
    {
      household: current.household.name,
      changes: actions.length,
      mode: flags.includes("--apply") ? "apply" : "dry-run",
    },
    null,
    2,
  ),
);
if (flags.includes("--apply"))
  for (let i = 0; i < actions.length; i += 25)
    console.log(
      (
        await request("/api/operations", {
          id: crypto.randomUUID(),
          actions: actions.slice(i, i + 25),
        })
      ).label,
    );
