import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DiagrammarError } from '@noblecloak/diagrammar-core';
import { serve } from './serve.js';

const MCP_DIST_URL = new URL('../dist/index.mjs', import.meta.url);
const CORE_DIST_URL = new URL('../../core/dist/index.mjs', import.meta.url);

describe('serve host default', () => {
  it('binds to 127.0.0.1 when host is omitted', async () => {
    const result = await serve({ noFs: true, port: 0 });
    try {
      expect(result.host).toBe('127.0.0.1');
      const res = await fetch(`http://127.0.0.1:${result.port}/healthz`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      await result.close();
    }
  });
});

describe('serve listen errors', () => {
  it('rejects with a DiagrammarError (code "listen") when the port is already taken', async () => {
    const first = await serve({ noFs: true, port: 0, host: '127.0.0.1' });
    try {
      await expect(
        serve({ noFs: true, port: first.port, host: '127.0.0.1' }),
      ).rejects.toMatchObject({ code: 'listen' });
      try {
        await serve({ noFs: true, port: first.port, host: '127.0.0.1' });
        throw new Error('expected serve() to reject');
      } catch (err) {
        expect(err).toBeInstanceOf(DiagrammarError);
        expect((err as DiagrammarError).message).toContain('127.0.0.1');
        expect((err as DiagrammarError).message).toContain(String(first.port));
      }
    } finally {
      await first.close();
    }
  });
});

describe('serve().close()', () => {
  /**
   * Spawns a plain Node process (not this test's own runtime, so it starts
   * with no diagrammar-related handles at all) that imports the *built*
   * dist bundles, serves, renders once, and closes — then never calls
   * `process.exit()` itself. If `close()` doesn't await `@noblecloak/diagrammar-core`'s
   * `shutdown()` (which disposes the D2 worker), that worker keeps the
   * event loop alive and the process hangs forever instead of exiting on
   * its own; this is a stronger signal than inspecting
   * `process.getActiveResourcesInfo()` from inside the (already
   * resource-heavy) vitest worker process.
   */
  it('a process that rendered exits naturally after close(), with no lingering worker', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagrammar-serve-close-'));
    const scriptPath = join(dir, 'serve-close.mjs');
    const script = `
import { serve } from ${JSON.stringify(pathToFileURL(fileURLToPath(MCP_DIST_URL)).href)};
import { render } from ${JSON.stringify(pathToFileURL(fileURLToPath(CORE_DIST_URL)).href)};

const FLOWCHART = "diagrammar: 1\\ntype: flowchart\\nnodes:\\n  - { id: a }\\nedges: []\\n";

const result = await serve({ noFs: true, port: 0 });
await render(FLOWCHART, { format: "svg" });
console.log("RENDERED", Date.now());
await result.close();
console.log("CLOSED", Date.now());
`;
    await writeFile(scriptPath, script, 'utf8');

    try {
      const child = spawn(process.execPath, [scriptPath]);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          rejectExit(
            new Error(
              `process did not exit within the time limit; stdout=${stdout} stderr=${stderr}`,
            ),
          );
        }, 20_000);
        child.on('exit', (code) => {
          clearTimeout(timer);
          resolveExit(code);
        });
      });
      const exitedAt = Date.now();

      expect(stderr).toBe('');
      expect(exitCode).toBe(0);

      const closedMatch = /CLOSED (\d+)/.exec(stdout);
      if (closedMatch === null) {
        throw new Error(`script never logged CLOSED; stdout=${stdout}`);
      }
      const closedAt = Number(closedMatch[1]);
      expect(exitedAt - closedAt).toBeLessThan(5000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
