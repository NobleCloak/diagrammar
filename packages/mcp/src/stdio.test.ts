import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { serveStdio } from './stdio.js';
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
