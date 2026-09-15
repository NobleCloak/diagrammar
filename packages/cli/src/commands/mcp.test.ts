import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { PassThrough } from 'node:stream';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { run, help } from './mcp.js';

async function writeIconSetDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'index.json'),
    JSON.stringify({
      'diagrammar-icons': 1,
      id: 'aws',
      version: 't',
      license: { spdx: 'LicenseRef-AWS', url: 'https://aws.amazon.com/architecture/icons/' },
      names: ['lambda'],
      aliases: {},
    }),
  );
  await writeFile(
    join(dir, 'icons.json.gz'),
    gzipSync(
      Buffer.from(
        JSON.stringify({
          lambda:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="#f90"/></svg>',
        }),
      ),
    ),
  );
}

describe('mcp command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts the server, logs the listening address to stderr (not stdout), and exits 0 on SIGINT', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runPromise = run(['--port', '0', '--no-fs']);
    // Give the server a tick to bind before we ask it to stop.
    await new Promise((r) => setTimeout(r, 100));
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('listening at'))).toBe(true);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('listening at'))).toBe(false);
    process.emit('SIGINT');
    const code = await runPromise;
    expect(code).toBe(0);
  });

  it('exits 0 on SIGTERM and responds to GET /healthz while running', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runPromise = run(['--port', '0', '--no-fs']);
    await new Promise((r) => setTimeout(r, 100));
    const line = errSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('listening at'));
    if (line === undefined) throw new Error('server did not log a listening line');
    const match = /http:\/\/\S+/.exec(line);
    if (match === null) throw new Error(`could not find URL in log line: ${line}`);
    const url = new URL(match[0]);
    const res = await fetch(`http://${url.host}/healthz`);
    expect(res.status).toBe(200);
    process.emit('SIGTERM');
    const code = await runPromise;
    expect(code).toBe(0);
  });

  it('exits 1 with a one-line stderr message (no stack trace) when the port is already in use', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const firstPromise = run(['--port', '0', '--no-fs']);
    await new Promise((r) => setTimeout(r, 100));
    const line = errSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes('listening at'));
    if (line === undefined) throw new Error('server did not log a listening line');
    const portMatch = /:(\d+)\/mcp/.exec(line);
    if (portMatch === null) throw new Error(`could not find port in log line: ${line}`);
    const port = portMatch[1]!;

    errSpy.mockClear();
    const code = await run(['--port', port, '--no-fs']);
    expect(code).toBe(1);
    expect(errSpy.mock.calls).toHaveLength(1);
    const message = String(errSpy.mock.calls[0]![0]);
    expect(message).toMatch(/^mcp: /);
    expect(message).not.toContain('\n');
    expect(message).not.toContain('    at ');

    process.emit('SIGINT');
    expect(await firstPromise).toBe(0);
  });

  it('rejects a non-integer --port with a one-line stderr message and exit 1 (I8)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run(['--port', 'nope', '--no-fs']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith('mcp: --port must be an integer between 1 and 65535');
  });

  it('rejects a --port above 65535 (I8)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run(['--port', '70000', '--no-fs']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith('mcp: --port must be an integer between 1 and 65535');
  });

  it('rejects a negative --port (I8)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // node:util's parseArgs treats a bare "-1" positional as an ambiguous
    // flag; "--port=-1" is the documented way to pass a negative option value.
    const code = await run(['--port=-1', '--no-fs']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith('mcp: --port must be an integer between 1 and 65535');
  });

  it('rejects a non-integer (fractional) --port (I8)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run(['--port', '80.5', '--no-fs']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith('mcp: --port must be an integer between 1 and 65535');
  });

  it('rejects a --root that does not exist (I8)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run(['--port', '0', '--root', '/no/such/directory/at/all']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith('mcp: --root /no/such/directory/at/all is not a directory');
  });

  it('rejects a --root that is a file, not a directory (I8)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagrammar-mcp-root-'));
    const file = join(dir, 'not-a-dir.yaml');
    await writeFile(file, 'diagrammar: 1\ntype: flowchart\n', 'utf8');
    try {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await run(['--port', '0', '--root', file]);
      expect(code).toBe(1);
      expect(errSpy).toHaveBeenCalledWith(`mcp: --root ${file} is not a directory`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts --root when it is a real directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagrammar-mcp-root-ok-'));
    try {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const runPromise = run(['--port', '0', '--root', dir]);
      await new Promise((r) => setTimeout(r, 100));
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes('listening at'))).toBe(true);
      process.emit('SIGINT');
      expect(await runPromise).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a --icons directory with no index.json', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run(['--icons', '/nonexistent/dir', '--port', '0']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const message = String(errSpy.mock.calls[0]![0]);
    expect(message).toMatch(/^mcp: /);
    expect(message).toContain('index.json');
  });

  it('accepts a valid --icons set directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagrammar-mcp-icons-'));
    try {
      await writeIconSetDir(join(dir, 'aws'));
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const runPromise = run(['--icons', join(dir, 'aws'), '--port', '0', '--no-fs']);
      await new Promise((r) => setTimeout(r, 100));
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes('listening at'))).toBe(true);
      process.emit('SIGINT');
      expect(await runPromise).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('help documents the HTTP flags and --stdio', () => {
    expect(help).toContain('--port');
    expect(help).toContain('--host');
    expect(help).toContain('--root');
    expect(help).toContain('--no-fs');
    expect(help).toContain('--allow-origin');
    expect(help).toContain('--stdio');
    expect(help).toContain(
      'Use --stdio when an MCP client spawns the server itself (Claude Code plugin, editors); use the HTTP server for a long-running shared instance.',
    );
  });

  it.each([
    ['--stdio', '--port', '1234'],
    ['--stdio', '--port', '3737'],
    ['--stdio', '--host', '127.0.0.1'],
    ['--stdio', '--allow-origin', 'http://a'],
  ])('rejects %s %s %s with a usage error and exit 1', async (...argv) => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([...argv, '--no-fs']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      'mcp: --stdio cannot be combined with --port, --host or --allow-origin',
    );
  });

  it('--stdio --no-fs announces itself on stderr and exits 0 when stdin ends', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const runPromise = run(['--stdio', '--no-fs'], { stdin, stdout });
    await new Promise((r) => setTimeout(r, 100));
    expect(errSpy).toHaveBeenCalledWith(
      'diagrammar MCP server serving over stdio (no filesystem access)',
    );
    stdin.end();
    expect(await runPromise).toBe(0);
  });

  it('--stdio --root <dir> reports the absolute root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagrammar-mcp-stdio-root-'));
    try {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const runPromise = run(['--stdio', '--root', dir], { stdin, stdout });
      await new Promise((r) => setTimeout(r, 100));
      expect(errSpy).toHaveBeenCalledWith(
        `diagrammar MCP server serving over stdio (root: ${resolve(dir)})`,
      );
      stdin.end();
      expect(await runPromise).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('--stdio accepts --icons', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagrammar-mcp-stdio-icons-'));
    try {
      await writeIconSetDir(join(dir, 'aws'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const stdin = new PassThrough();
      const stdout = new PassThrough();
      const runPromise = run(['--stdio', '--no-fs', '--icons', join(dir, 'aws')], {
        stdin,
        stdout,
      });
      await new Promise((r) => setTimeout(r, 100));
      stdin.end();
      expect(await runPromise).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not leak SIGINT/SIGTERM listeners after --stdio exits via stdin end', async () => {
    const sigintBefore = process.listenerCount('SIGINT');
    const sigtermBefore = process.listenerCount('SIGTERM');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const runPromise = run(['--stdio', '--no-fs'], { stdin, stdout });
    await new Promise((r) => setTimeout(r, 100));
    stdin.end();
    expect(await runPromise).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore);
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore);
  });
});
