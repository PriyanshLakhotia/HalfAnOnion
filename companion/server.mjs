import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { CodexRuntime } from "./codex.mjs";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  readdir,
} from "node:fs/promises";
const runtime = new CodexRuntime();
const key = process.env.BRIDGE_SECRET;
if (!key || key.length < 32)
  throw new Error("Set a strong BRIDGE_SECRET in the host secret manager.");
const root = "/data/requests";
await mkdir(root, { recursive: true, mode: 0o700 });
const calls = new Map();
let budgetDate = "",
  budget = 0;
function allowed(header) {
  const got = Buffer.from(header ?? ""),
    expected = Buffer.from("Bearer " + key);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const send = (status, data) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };
  if (!allowed(req.headers.authorization))
    return send(401, { error: "Unauthorized" });
  if (req.method !== "POST") return send(405, { error: "POST required" });
  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 250000) throw new Error("Request too large");
    }
    const input = JSON.parse(raw || "{}");
    if (req.url === "/status") return send(200, await runtime.status());
    if (req.url === "/models")
      return send(200, { models: await runtime.models() });
    if (req.url === "/connect") return send(200, await runtime.connect());
    if (req.url === "/disconnect") return send(200, await runtime.disconnect());
    if (req.url !== "/command") return send(404, { error: "Not found" });
    if (
      !/^[a-f0-9-]{36}$/.test(input.id) ||
      typeof input.text !== "string" ||
      input.text.length > 4000
    )
      throw new Error("Invalid instruction");
    const now = new Date().toISOString().slice(0, 10);
    if (now !== budgetDate) {
      budgetDate = now;
      budget = 0;
    }
    try {
      const record = JSON.parse(
        await readFile(root + "/" + input.id + ".json", "utf8"),
      );
      if (record.result) return send(200, record.result);
      return send(409, {
        error:
          "The previous request was interrupted. Check the kitchen before submitting a new instruction.",
      });
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (calls.has(input.id)) return send(200, await calls.get(input.id));
    if (budget >= 30)
      return send(429, { error: "Daily assistant limit reached." });
    budget++;
    await writeFile(
      root + "/" + input.id + ".json",
      JSON.stringify({ started: Date.now() }),
      { mode: 0o600, flag: "wx" },
    );
    const work = runtime.command(input);
    calls.set(input.id, work);
    let result;
    try {
      result = await work;
      await writeFile(
        root + "/" + input.id + ".tmp",
        JSON.stringify({ at: Date.now(), result }),
        { mode: 0o600 },
      );
      await rename(
        root + "/" + input.id + ".tmp",
        root + "/" + input.id + ".json",
      );
    } finally {
      calls.delete(input.id);
    }
    send(200, result);
  } catch (error) {
    send(503, {
      error: error.message?.slice(0, 300) || "Assistant unavailable",
    });
  }
});
server.requestTimeout = 130000;
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
// Request records contain short-lived context/results, never audio. Clean after 24 hours.
setInterval(async () => {
  for (const name of await readdir(root)) {
    try {
      const p = root + "/" + name;
      const r = JSON.parse(await readFile(p, "utf8"));
      if (Date.now() - (r.at ?? r.started) > 86400000) await unlink(p);
    } catch {}
  }
}, 3600000).unref();
process.on("SIGTERM", () => {
  runtime.process?.kill("SIGTERM");
  server.close(() => process.exit(0));
});
