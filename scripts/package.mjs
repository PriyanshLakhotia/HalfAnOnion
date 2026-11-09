import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
const manifest = JSON.parse(
  await readFile("dist/.openai/hosting.json", "utf8"),
);
if (!manifest.project_id) throw new Error("Missing project identity.");
const output = "/workspace/half-an-onion-deployment.tar.gz";
const r = spawnSync("tar", ["-czf", output, "-C", "dist", "."], {
  stdio: "inherit",
});
if (r.status) process.exit(r.status);
console.log(output);
