import { describe, it, expect, beforeAll } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const binPath = join(packageRoot, 'dist', 'bin.mjs');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const FLOWCHART = `diagrammar: 1
type: flowchart
title: Order fulfilment
nodes:
  - id: start
    label: Order received
    shape: oval
  - id: check
    label: In stock?
  - id: ship
    label: Ship order
edges:
  - { from: start, to: check }
  - { id: yes, from: check, to: ship, label: "yes" }
`;

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd: string): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [binPath, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/**
 * Spawns `diagrammar mcp` as a long-running child process (unlike `runCli`,
 * which waits for the process to exit) so the test can interact with the
 * server while it is up, then stop it with a signal.
 */
function spawnMcp(args: string[], cwd: string) {
  const child = spawn('node', [binPath, 'mcp', ...args], { cwd });
  let stderrBuf = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString();
  });
  const listeningUrl = new Promise<URL>((resolveUrl, rejectUrl) => {
    const timer = setTimeout(() => {
      rejectUrl(new Error(`timed out waiting for listening line; stderr so far: ${stderrBuf}`));
    }, 5000);
    const check = (): void => {
      const match = /http:\/\/\S+/.exec(stderrBuf);
      if (match !== null) {
        clearTimeout(timer);
        resolveUrl(new URL(match[0]));
      }
    };
    child.stderr.on('data', check);
    check();
  });
  const exitCode = new Promise<number | null>((resolveExit) => {
    child.on('exit', (code) => resolveExit(code));
  });
  return { child, listeningUrl, exitCode };
}

describe('diagrammar CLI (spawned binary)', () => {
  let dir: string;

  beforeAll(async () => {
    // Self-contained: build the CLI here so this suite passes even if run in
    // isolation (e.g. `cd packages/cli && bun run test`) without relying on
    // an earlier task's gate having already run `bun run build`.
    await execFileAsync('bun', ['run', 'build'], { cwd: packageRoot });
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-cli-spawn-'));
    await writeFile(join(dir, 'order.yaml'), FLOWCHART, 'utf8');
  }, 120_000);

  it('the package entry re-exports @noblecloak/diagrammar-core (I5, spec §7): import exposes render, DiagramDocument, etc.', async () => {
    const entryUrl = pathToFileURL(join(packageRoot, 'dist', 'main.mjs')).href;
    const mod = (await import(entryUrl)) as Record<string, unknown>;
    expect(typeof mod.render).toBe('function');
    expect(typeof mod.DiagramDocument).toBe('function');
    expect(typeof mod.validate).toBe('function');
    expect(typeof mod.createDocument).toBe('function');
    expect(typeof mod.parseOp).toBe('function');
    // The CLI's own exports still live alongside the re-exported core API.
    expect(typeof mod.main).toBe('function');
    expect(mod.COMMANDS).toBeTruthy();
  });

  it('validate --json reports a valid file', async () => {
    const result = await runCli(['validate', 'order.yaml', '--json'], dir);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { file: string; ok: boolean; issues: unknown[] }[];
    expect(parsed).toEqual([{ file: 'order.yaml', ok: true, issues: [] }]);
  });

  it('validate exits 1 on an invalid file', async () => {
    await writeFile(
      join(dir, 'bad.yaml'),
      'diagrammar: 1\ntype: flowchart\nnodes: []\nedges:\n  - { from: a, to: b }\n',
      'utf8',
    );
    const result = await runCli(['validate', 'bad.yaml', '--json'], dir);
    expect(result.code).toBe(1);
    const parsed = JSON.parse(result.stdout) as { ok: boolean; issues: unknown[] }[];
    expect(parsed[0]?.ok).toBe(false);
    expect(parsed[0]?.issues.length).toBeGreaterThan(0);
  });

  it('new creates a minimal valid file', async () => {
    const result = await runCli(
      ['new', 'fresh.yaml', '--type', 'sequence', '--title', 'Fresh'],
      dir,
    );
    expect(result.code).toBe(0);
    const text = await readFile(join(dir, 'fresh.yaml'), 'utf8');
    expect(text).toContain('diagrammar: 1');
    expect(text).toContain('type: sequence');
  });

  it('describe --json reflects the file', async () => {
    const result = await runCli(['describe', 'order.yaml', '--json'], dir);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { type: string; valid: boolean; hash: string };
    expect(parsed.type).toBe('flowchart');
    expect(parsed.valid).toBe(true);
    expect(typeof parsed.hash).toBe('string');
  });

  it('render writes a PNG with a valid signature', async () => {
    const result = await runCli(['render', 'order.yaml'], dir);
    expect(result.code).toBe(0);
    const bytes = await readFile(join(dir, 'order.png'));
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it('render --format d2 writes D2 source', async () => {
    const result = await runCli(['render', 'order.yaml', '--format', 'd2'], dir);
    expect(result.code).toBe(0);
    const text = await readFile(join(dir, 'order.d2'), 'utf8');
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('start');
  });

  it('edit applies an op and describe reflects it', async () => {
    const ops = [{ op: 'addNode', node: { id: 'archived', label: 'Archived' } }];
    await writeFile(join(dir, 'ops.json'), JSON.stringify(ops), 'utf8');
    const editResult = await runCli(['edit', 'order.yaml', '--ops', 'ops.json'], dir);
    expect(editResult.code).toBe(0);
    const describeResult = await runCli(['describe', 'order.yaml', '--json'], dir);
    const parsed = JSON.parse(describeResult.stdout) as { elements: { id?: string }[] };
    expect(parsed.elements.some((el) => el.id === 'archived')).toBe(true);
  });

  it('edit reports a conflict on hash mismatch', async () => {
    const ops = [{ op: 'addNode', node: { id: 'x', label: 'X' } }];
    await writeFile(join(dir, 'ops2.json'), JSON.stringify(ops), 'utf8');
    const result = await runCli(
      ['edit', 'order.yaml', '--ops', 'ops2.json', '--expected-hash', 'deadbeef'],
      dir,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('conflict');
  });

  it('--help prints usage for a command', async () => {
    const result = await runCli(['render', '--help'], dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('diagrammar render');
  });

  it('mcp starts a Streamable HTTP server on a free port, serves /healthz, and exits 0 on SIGTERM', async () => {
    const { child, listeningUrl, exitCode } = spawnMcp(['--port', '0', '--no-fs'], dir);
    try {
      const url = await listeningUrl;
      const res = await fetch(`http://${url.host}/healthz`);
      expect(res.status).toBe(200);

      child.kill('SIGTERM');
      const code = await exitCode;
      expect(code).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }, 10_000);
});
