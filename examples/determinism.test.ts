import { describe, it, expect } from 'vitest';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { render, fileResolver, IconRegistry } from '@noblecloak/diagrammar-core';
import { lucide } from '@noblecloak/diagrammar-icons-lucide';
import { simpleIcons } from '@noblecloak/diagrammar-icons-simple-icons';

const examplesDir = path.dirname(fileURLToPath(import.meta.url));
const resolver = fileResolver(examplesDir);
const icons = new IconRegistry();
icons.register(lucide);
icons.register(simpleIcons);

async function loadExample(name: string): Promise<string> {
  return readFile(path.join(examplesDir, name), 'utf-8');
}

// @noblecloak/diagrammar-core is ESM-only (contract §1: "type": "module", no CJS build), so the
// child process evaluates an ESM module rather than `require()`-ing it. Top-level
// await is valid in an ES module.
//
// The child script is written to a real `.mjs` file under a temp directory
// *inside* `examples/` (not `os.tmpdir()`) and run as `node <file>`, rather than
// evaluated inline via `node --input-type=module -e <script>`:
//
// 1. Module resolution: `@noblecloak/diagrammar-core` has no tsconfig path mapping — it
//    resolves only via node_modules lookup, which walks up from the *file
//    being run* to find the repo root's workspace symlink. A file under
//    `os.tmpdir()` has no such ancestor, so `-e`/`--input-type` (which Node
//    treats as running from the current working directory, not a real file
//    path) can't find it either; cwd tricks don't fix that for ESM `import`.
// 2. Real bug: `@d2lang/d2` spawns an internal worker_threads Worker that
//    inherits `process.execArgv`. When the *parent* process itself was
//    launched with `--input-type=module -e`, that flag combination is
//    inherited by the Worker, whose entry is a real file, not `-e`/eval/stdin
//    input — Node's own CLI validation then rejects it with "--input-type can
//    only be used with string input via --eval, --print, or STDIN", crashing
//    the render. Running the child as a plain `node <file>.mjs` (no
//    `--input-type`, no `-e`) avoids this entirely. Verified directly against
//    this repo's engine, independent of vitest/bun.
async function renderInChildProcess(yaml: string, outFile: string): Promise<void> {
  const scriptDir = await mkdtemp(path.join(examplesDir, '.determinism-'));
  const scriptFile = path.join(scriptDir, 'render.mjs');
  const script = `
import { render, shutdown, fileResolver, IconRegistry } from '@noblecloak/diagrammar-core';
import { lucide } from '@noblecloak/diagrammar-icons-lucide';
import { simpleIcons } from '@noblecloak/diagrammar-icons-simple-icons';
import { writeFileSync } from 'node:fs';
const icons = new IconRegistry();
icons.register(lucide);
icons.register(simpleIcons);
const result = await render(${JSON.stringify(yaml)}, { format: 'png', resolver: fileResolver(${JSON.stringify(examplesDir)}), icons });
writeFileSync(${JSON.stringify(outFile)}, Buffer.from(result.bytes));
await shutdown();
`;
  try {
    await writeFile(scriptFile, script, 'utf-8');
    await new Promise<void>((resolve, reject) => {
      const child = spawn('node', [scriptFile], { stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`child process exited with code ${code}`));
      });
      child.on('error', reject);
    });
  } finally {
    await rm(scriptDir, { recursive: true, force: true });
  }
}

describe('determinism', () => {
  const STEMS = ['annotated', 'themed', 'icons'];

  for (const stem of STEMS) {
    it(`renders ${stem}.yaml to byte-identical PNGs twice in-process and once in a fresh node child process`, async () => {
      const yaml = await loadExample(`${stem}.yaml`);

      const first = await render(yaml, { format: 'png', resolver, icons });
      const second = await render(yaml, { format: 'png', resolver, icons });
      expect(Buffer.from(second.bytes).equals(Buffer.from(first.bytes))).toBe(true);

      const outDir = await mkdtemp(path.join(examplesDir, '.determinism-'));
      const outFile = path.join(outDir, `${stem}.child.png`);
      try {
        await renderInChildProcess(yaml, outFile);
        const childBytes = await readFile(outFile);
        expect(childBytes.equals(Buffer.from(first.bytes))).toBe(true);
      } finally {
        await rm(outDir, { recursive: true, force: true });
      }
    }, 30_000);
  }
});
