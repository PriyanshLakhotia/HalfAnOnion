import { createHash } from "node:crypto";
import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir, cp } from "node:fs/promises";
await mkdir(".sites-runtime", { recursive: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const out = await build({
  entryPoints: ["src/client/main.tsx"],
  bundle: true,
  minify: true,
  format: "esm",
  write: false,
  outdir: "assets",
  target: "es2022",
});
const assets = {};
const buildId = createHash("sha256")
  .update(out.outputFiles.map((f) => f.text).join(""))
  .digest("hex")
  .slice(0, 16);
for (const f of out.outputFiles) {
  const name = f.path.split("/").pop();
  assets["/" + name] = {
    body: f.text,
    type: name.endsWith(".css") ? "text/css" : "text/javascript",
  };
}
assets["/"] = {
  body: '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#faf9f5"><title>Half an Onion · Our kitchen</title><meta name="description" content="Meals, groceries and recipes for your household."><link rel="stylesheet" href="/main.css"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/png" href="/icon-192.png"><link rel="apple-touch-icon" href="/icon-192.png"></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>',
  type: "text/html; charset=utf-8",
};
for (const name of await readdir("public")) {
  let data = await readFile("public/" + name);
  if (name === "sw.js")
    data = Buffer.from(data.toString().replaceAll("__BUILD_ID__", buildId));
  assets["/" + name] = {
    body: data.toString("base64"),
    base64: true,
    type: name.endsWith(".js")
      ? "text/javascript"
      : name.endsWith(".svg")
        ? "image/svg+xml"
        : name.endsWith(".png")
          ? "image/png"
          : name.endsWith(".webmanifest")
            ? "application/manifest+json"
            : "text/plain",
  };
}
await writeFile(
  ".sites-runtime/assets.ts",
  "export const assets: Record<string,{body:string;type:string;base64?:boolean}> = " +
    JSON.stringify(assets) +
    ";",
);
await build({
  entryPoints: ["src/server/worker.ts"],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  outfile: "dist/server/index.js",
  target: "es2022",
});
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
try {
  await cp("drizzle", "dist/drizzle", { recursive: true });
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
console.log("Built Worker and embedded UI assets");
