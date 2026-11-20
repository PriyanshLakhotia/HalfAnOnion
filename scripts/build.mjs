import { createHash } from "node:crypto";
import './build-contract.mjs';
import { build } from "esbuild";
import { extname } from "node:path";
import { mkdir, readFile, writeFile, readdir, cp } from "node:fs/promises";
await mkdir(".sites-runtime", { recursive: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const out = await build({
  entryPoints: ["src/client/main.tsx"],
  bundle: true,
  external: ["/*.woff2", "/*.webp"],
  minify: true,
  format: "esm",
  write: false,
  outdir: "assets",
  target: "es2022",
});
const html = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#faf7f0"><title>Half an Onion · Our kitchen</title><meta name="description" content="Meals, groceries and recipes for your household."><link rel="stylesheet" href="/assets/main-__BUILD_ID__.css"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" type="image/png" href="/icon-192.png"><link rel="apple-touch-icon" href="/icon-192.png"></head><body><div id="root"></div><script type="module" src="/assets/main-__BUILD_ID__.js"></script></body></html>';
const publicNames = (await readdir("public")).sort();
const publicFiles = await Promise.all(publicNames.map(async name => ({
  name,
  data: await readFile("public/" + name),
})));
const hash = createHash("sha256").update(html);
for (const file of out.outputFiles) hash.update(file.contents);
for (const { name, data } of publicFiles) hash.update(name).update(data);
const buildId = hash.digest("hex").slice(0, 16);
const assets = {};
for (const f of out.outputFiles) {
  const name = f.path.split("/").pop();
  const asset = {
    body: f.text,
    type: name.endsWith(".css") ? "text/css" : "text/javascript",
  };
  assets["/" + name] = asset; // Compatibility for an already-open older shell.
  assets['/assets/' + name.replace(/\.(js|css)$/, '-' + buildId + '.$1')] = asset;
}
assets["/"] = {
  body: html.replaceAll("__BUILD_ID__", buildId),
  type: "text/html; charset=utf-8",
};
const contentTypes = {
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};
const publicShell = publicNames.filter(name => name !== "sw.js").map(name => "/" + name);
for (const { name, data } of publicFiles) {
  const bytes = name === "sw.js"
    ? Buffer.from(data.toString().replaceAll("__BUILD_ID__", buildId)
      .replace("__PUBLIC_ASSETS__", JSON.stringify(publicShell)))
    : data;
  assets["/" + name] = {
    body: bytes.toString("base64"),
    base64: true,
    type: contentTypes[extname(name)] ?? "text/plain",
  };
}
const fontLicenses = "third-party/fonts";
for (const name of await readdir(fontLicenses)) {
  assets[`/${fontLicenses}/${name}`] = {
    body: await readFile(`${fontLicenses}/${name}`, "utf8"),
    type: "text/plain; charset=utf-8",
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
