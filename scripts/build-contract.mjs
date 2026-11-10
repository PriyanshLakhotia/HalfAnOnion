import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({
  entryPoints: ['src/domain/assistant.ts'], bundle: true, format: 'esm', platform: 'neutral',
  target: 'es2022', minify: true, write: false,
  banner: { js: '// Generated from src/domain/assistant.ts. Run npm run contract:build; do not edit.' },
});
const output = result.outputFiles[0].text;
if (process.argv.includes('--check')) {
  if (await readFile('companion/contract.mjs', 'utf8').catch(() => '') !== output)
    throw new Error('Companion contract is stale. Run npm run contract:build and commit the generated file.');
} else await writeFile('companion/contract.mjs', output);
