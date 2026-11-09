// Fallback for environments without the installed Sites source-workflow helper.
// Credential JSON is read from hidden stdin and retained only in process memory.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
const rl = createInterface({ input: process.stdin, terminal: false });
if (process.stdin.isTTY)
  spawnSync("stty", ["-echo"], { stdio: ["inherit", "ignore", "ignore"] });
console.log("Ready for source credential JSON on stdin (input is hidden).");
const line = await new Promise((resolve) => rl.once("line", resolve));
rl.close();
const c = JSON.parse(line);
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
if (!c.remote_url.includes("/" + manifest.project_id + ".git"))
  throw new Error("Credential and Site identity do not match.");
const run = (args, env = {}) => {
  const r = spawnSync("git", args, {
    encoding: "utf8",
    env: { ...process.env, GIT_TRACE: "0", GIT_CURL_VERBOSE: "0", ...env },
  });
  if (r.status)
    throw new Error(
      r.stderr.replaceAll(c.token ?? "NEVER_A_TOKEN", "[redacted]"),
    );
  return r.stdout.trim();
};
const current = spawnSync("git", ["remote", "get-url", "sites"], {
  encoding: "utf8",
});
if (current.status) run(["remote", "add", "sites", c.remote_url]);
else if (current.stdout.trim() !== c.remote_url)
  throw new Error("Existing Sites remote does not match.");
if (run(["status", "--porcelain"]))
  throw new Error("Commit the exact source before publication.");
const auth =
  c.auth_mode === "work_proxy"
    ? {}
    : {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0:
          "http." + new URL(c.remote_url).origin + "/.extraheader",
        GIT_CONFIG_VALUE_0: "Authorization: Bearer " + c.token,
      };
run(["push", "sites", "HEAD:refs/heads/" + c.branch], auth);
console.log(
  JSON.stringify({
    project_id: manifest.project_id,
    commit_sha: run(["rev-parse", "HEAD"]),
    pushed: true,
  }),
);
