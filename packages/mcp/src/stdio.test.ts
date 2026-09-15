import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { serveStdio } from './stdio.js';
import { serve } from './serve.js';
import { SERVER_VERSION } from './app.js';

/**
 * Drives `serveStdio` over two in-memory pipes: what the server writes to
 * its "stdout" is the client's inbound stream and vice versa. The framing is
 * the SDK's own newline-delimited JSON-RPC, so a hand-rolled request is
 * enough to check the handshake without spawning a process (that lives in
 * the end-to-end suite below).
 */
function jsonRpcLines(stream: PassThrough): Promise<string[]> {
  return new Promise((resolveLines) => {
    let buffer = '';
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n').filter((l) => l.trim() !== '');
      if (lines.length > 0) resolveLines(lines);
    });
  });
}

describe('serveStdio (in-process)', () => {
  it('answers initialize with the diagrammar server info at SERVER_VERSION', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const result = await serveStdio({ noFs: true }, { stdin, stdout });
    try {
      const pending = jsonRpcLines(stdout);
      stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '0.0.0' },
          },
        }) + '\n',
      );
      const [line] = await pending;
      const reply = JSON.parse(line!) as {
        result: { serverInfo: { name: string; version: string } };
      };
      expect(reply.result.serverInfo).toEqual({ name: 'diagrammar', version: SERVER_VERSION });
    } finally {
      await result.close();
    }
  });

  it('ignores HTTP-only config fields without throwing', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const result = await serveStdio(
      {
        noFs: true,
        allowedOrigins: ['http://x'],
        maxSessions: 1,
        sessionIdleMs: 1,
        maxBodyBytes: 1,
      },
      { stdin, stdout },
    );
    await result.close();
  });
});

const CLI_BIN = fileURLToPath(new URL('../../cli/dist/bin.mjs', import.meta.url));

const FLOWCHART = `diagrammar: 1
type: flowchart
title: Order fulfilment
nodes:
  - { id: start, label: Order received, shape: oval }
  - { id: ship, label: Ship order }
edges:
  - { from: start, to: ship }
`;

function toolNames(list: { tools: { name: string }[] }): string[] {
  return list.tools.map((t) => t.name).sort();
}

async function spawnStdioClient(
  args: string[],
): Promise<{ client: Client; transport: StdioClientTransport }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI_BIN, 'mcp', '--stdio', ...args],
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-e2e', version: '0.0.0' });
  await client.connect(transport);
  return { client, transport };
}

/**
 * Spawns the BUILT CLI (`bun run build` first) exactly the way Claude Code's
 * plugin does, and compares it against an in-process HTTP server with the
 * same config so the two transports can never drift apart in what they
 * expose.
 */
describe('diagrammar mcp --stdio (end to end)', () => {
  it('handshakes as diagrammar at SERVER_VERSION and lists the same tools as HTTP', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammar-stdio-e2e-'));
    const http = await serve({ noFs: false, root, port: 0 });
    const httpClient = new Client({ name: 'http-ref', version: '0.0.0' });
    await httpClient.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${http.port}/mcp`)) as Transport,
    );
    const { client } = await spawnStdioClient(['--root', root]);
    try {
      expect(client.getServerVersion()).toEqual({ name: 'diagrammar', version: SERVER_VERSION });
      expect(toolNames(await client.listTools())).toEqual(toolNames(await httpClient.listTools()));
    } finally {
      await client.close();
      await httpClient.close();
      await http.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('renders a file inside --root and refuses one outside it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammar-stdio-e2e-'));
    await writeFile(join(root, 'a.yaml'), FLOWCHART, 'utf8');
    const { client } = await spawnStdioClient(['--root', root]);
    try {
      const ok = await client.callTool({
        name: 'diagrammar_render',
        arguments: { path: 'a.yaml', format: 'svg' },
      });
      expect(ok.isError).not.toBe(true);
      const bad = await client.callTool({
        name: 'diagrammar_describe',
        arguments: { path: '../../etc/passwd' },
      });
      expect(bad.isError).toBe(true);
      const parsed = JSON.parse((bad.content as { text: string }[])[0]!.text) as { code: string };
      expect(parsed.code).toBe('path_outside_root');
    } finally {
      await client.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('--no-fs drops path-based tools and still renders from source', async () => {
    const { client } = await spawnStdioClient(['--no-fs']);
    try {
      const names = toolNames(await client.listTools());
      expect(names).not.toContain('diagrammar_list');
      expect(names).not.toContain('diagrammar_create');
      const result = await client.callTool({
        name: 'diagrammar_render',
        arguments: { source: FLOWCHART, format: 'svg' },
      });
      expect(result.isError).not.toBe(true);
    } finally {
      await client.close();
    }
  });

  it('closing the client ends the child process', async () => {
    const { client, transport } = await spawnStdioClient(['--no-fs']);
    const pid = transport.pid;
    expect(pid).not.toBeNull();
    await client.close();
    // Poll for the process to disappear: `kill(pid, 0)` throws ESRCH once it's gone.
    const deadline = Date.now() + 10_000;
    let gone = false;
    while (Date.now() < deadline) {
      try {
        process.kill(pid!, 0);
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        gone = true;
        break;
      }
    }
    expect(gone).toBe(true);
  }, 15_000);
});
