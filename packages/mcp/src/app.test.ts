import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest';
import { Hono } from 'hono';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createApp, originGuard, type McpAppConfig } from './app.js';

function initializeBody(id: number): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    },
  });
}

async function initializeSession(app: Hono, id = 1): Promise<string> {
  const res = await app.request('/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: initializeBody(id),
  });
  await res.text();
  const sessionId = res.headers.get('mcp-session-id');
  if (sessionId === null) throw new Error('server did not issue a session id');
  return sessionId;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * The Streamable HTTP transport answers a JSON-RPC POST over
 * `text/event-stream`, not plain JSON, so a raw `fetch`/`app.request` test
 * can't just call `res.json()` (mirrors `mcp.integration.test.ts`'s
 * `readJsonRpcResponse`, duplicated locally rather than shared across test
 * files, matching this codebase's existing per-file-helper convention).
 */
async function readJsonRpcResponse(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  const text = await res.text();
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).replace(/^ /, ''));
  return JSON.parse(dataLines.join('\n'));
}

describe('createApp', () => {
  it('GET /healthz returns 200 with {ok: true}', async () => {
    const { app } = createApp({ noFs: false, root: process.cwd() });
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('createApp body limit', () => {
  it('rejects a request body over maxBodyBytes with a 413 and a JSON envelope', async () => {
    const { app } = createApp({ noFs: true, maxBodyBytes: 16 });
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: initializeBody(1), // well over 16 bytes
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe('payload_too_large');
    expect(body.message).toContain('16');
  });

  it('accepts a request body within maxBodyBytes', async () => {
    const { app } = createApp({ noFs: true, maxBodyBytes: 1024 * 1024 });
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: initializeBody(1),
    });
    expect(res.status).toBe(200);
    await res.text();
  });
});

describe('createApp session lifecycle', () => {
  let closeSpy: MockInstance<() => Promise<void>> | undefined;

  afterEach(() => {
    closeSpy?.mockRestore();
    closeSpy = undefined;
  });

  function spyOnTransportClose(): MockInstance<() => Promise<void>> {
    closeSpy = vi.spyOn(WebStandardStreamableHTTPServerTransport.prototype, 'close');
    return closeSpy;
  }

  function closedSessionIds(spy: MockInstance<() => Promise<void>>): (string | undefined)[] {
    return spy.mock.instances.map(
      (instance: unknown) => (instance as WebStandardStreamableHTTPServerTransport).sessionId,
    );
  }

  const baseConfig: McpAppConfig = { noFs: true };

  it('evicts the least-recently-seen session when a new initialize would exceed maxSessions', async () => {
    const spy = spyOnTransportClose();
    const { app } = createApp({ ...baseConfig, maxSessions: 2 });

    const s1 = await initializeSession(app, 1);
    await sleep(5);
    await initializeSession(app, 2);
    await sleep(5);

    expect(spy).not.toHaveBeenCalled();

    await initializeSession(app, 3);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(closedSessionIds(spy)).toEqual([s1]);
  });

  it('does not evict anything while under the maxSessions cap', async () => {
    const spy = spyOnTransportClose();
    const { app } = createApp({ ...baseConfig, maxSessions: 5 });

    await initializeSession(app, 1);
    await initializeSession(app, 2);

    expect(spy).not.toHaveBeenCalled();
  });

  it('the idle sweeper closes a session that has been idle longer than sessionIdleMs', async () => {
    const spy = spyOnTransportClose();
    const { app, closeSessions } = createApp({ ...baseConfig, sessionIdleMs: 30 });

    const sessionId = await initializeSession(app, 1);
    await sleep(150);

    expect(closedSessionIds(spy)).toContain(sessionId);
    await closeSessions();
  });

  it('a request against a session resets its idle clock', async () => {
    const spy = spyOnTransportClose();
    const { app, closeSessions } = createApp({ ...baseConfig, sessionIdleMs: 80 });

    const sessionId = await initializeSession(app, 1);
    // Touch the session repeatedly, faster than the idle timeout, so it's
    // never observed idle for a full sessionIdleMs stretch.
    for (let i = 0; i < 4; i++) {
      await sleep(40);
      const res = await app.request('/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': sessionId,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }),
      });
      await res.text();
    }

    expect(closedSessionIds(spy)).not.toContain(sessionId);
    await closeSessions();
  });

  it('closeSessions closes every tracked session and stops the sweeper', async () => {
    const spy = spyOnTransportClose();
    const { app, closeSessions } = createApp({ ...baseConfig, sessionIdleMs: 60_000 });

    const s1 = await initializeSession(app, 1);
    const s2 = await initializeSession(app, 2);

    await closeSessions();

    const closed = closedSessionIds(spy);
    expect(closed).toEqual(expect.arrayContaining([s1, s2]));
    expect(closed).toHaveLength(2);
  });
});

describe('tool annotations (M9)', () => {
  interface ListedTool {
    name: string;
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  }

  it('exposes readOnlyHint on schema/list/describe/validate and non-read-only, non-destructive hints on create/edit/render', async () => {
    const { app } = createApp({ noFs: false, root: process.cwd() });
    const sessionId = await initializeSession(app, 1);
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    const body = (await readJsonRpcResponse(res)) as { result: { tools: ListedTool[] } };
    const byName = new Map(body.result.tools.map((tool) => [tool.name, tool]));

    for (const name of [
      'diagrammar_schema',
      'diagrammar_list',
      'diagrammar_describe',
      'diagrammar_validate',
    ]) {
      const tool = byName.get(name);
      if (tool === undefined) throw new Error(`tool ${name} not found in tools/list`);
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }

    for (const name of ['diagrammar_create', 'diagrammar_edit', 'diagrammar_render']) {
      const tool = byName.get(name);
      if (tool === undefined) throw new Error(`tool ${name} not found in tools/list`);
      expect(tool.annotations?.readOnlyHint).toBe(false);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.annotations?.idempotentHint).toBe(false);
    }
  });
});

describe('originGuard', () => {
  function appWithGuard(allowedOrigins?: string[]): Hono {
    const app = new Hono();
    app.use('*', originGuard(allowedOrigins));
    app.get('/test', (c) => c.text('ok'));
    return app;
  }

  it('allows requests with no Origin header', async () => {
    const app = appWithGuard();
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  it('allows http://localhost with any port', async () => {
    const app = appWithGuard();
    const res = await app.request('/test', { headers: { origin: 'http://localhost:5173' } });
    expect(res.status).toBe(200);
  });

  it('allows http://127.0.0.1 with any port', async () => {
    const app = appWithGuard();
    const res = await app.request('/test', { headers: { origin: 'http://127.0.0.1:9999' } });
    expect(res.status).toBe(200);
  });

  it('rejects an arbitrary origin with 403', async () => {
    const app = appWithGuard();
    const res = await app.request('/test', { headers: { origin: 'http://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('rejects https on localhost (scheme must be http)', async () => {
    const app = appWithGuard();
    const res = await app.request('/test', { headers: { origin: 'https://localhost:5173' } });
    expect(res.status).toBe(403);
  });

  it('allows an origin present in the allowedOrigins list', async () => {
    const app = appWithGuard(['https://app.example.com']);
    const res = await app.request('/test', { headers: { origin: 'https://app.example.com' } });
    expect(res.status).toBe(200);
  });
});
