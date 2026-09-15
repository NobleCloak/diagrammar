import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { IconRegistry } from '@noblecloak/diagrammar-core';
import { registerAllTools } from './tools/index.js';
import { registerResources } from './resources.js';
import type { ToolContext } from './fs.js';
import { defaultIconRegistry } from './icons.js';

export interface McpAppConfig {
  root?: string;
  noFs: boolean;
  /** Icon sets available to `icon:` references. Default: the bundled Lucide and Simple Icons sets. */
  icons?: IconRegistry;
  allowedOrigins?: string[];
  /** Idle timeout (ms) after which an unused session is closed and evicted. Default 30 minutes. */
  sessionIdleMs?: number;
  /** Hard cap on concurrently tracked sessions; the least-recently-seen one is evicted to make room. Default 256. */
  maxSessions?: number;
  /** Maximum accepted request body size (bytes) on `/mcp`. Default 8 MiB. */
  maxBodyBytes?: number;
}

export interface CreateAppResult {
  app: Hono;
  /** Clears the idle sweeper and closes every tracked session's transport. */
  closeSessions: () => Promise<void>;
}

const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const SERVER_INFO = { name: 'diagrammar', version: '0.1.0' };
const DEFAULT_SESSION_IDLE_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 256;
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

export function originGuard(allowedOrigins?: string[]) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header('origin');
    if (origin === undefined) {
      await next();
      return;
    }
    if (LOCAL_ORIGIN_RE.test(origin) || (allowedOrigins?.includes(origin) ?? false)) {
      await next();
      return;
    }
    return c.text('Forbidden: origin not allowed', 403);
  };
}

interface SessionEntry {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  lastSeen: number;
}

function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerAllTools(server, ctx);
  registerResources(server, ctx);
  return server;
}

export function createApp(config: McpAppConfig): CreateAppResult {
  const root = config.noFs ? undefined : resolve(config.root ?? process.cwd());
  const ctx: ToolContext = {
    root,
    noFs: config.noFs,
    icons: config.icons ?? defaultIconRegistry(),
  };
  const sessionIdleMs = config.sessionIdleMs ?? DEFAULT_SESSION_IDLE_MS;
  const maxSessions = config.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const maxBodyBytes = config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const sessions = new Map<string, SessionEntry>();

  // Closing a tracked transport fires its `onclose` handler (wired below),
  // which removes it from `sessions` — callers here never touch the map
  // directly, so eviction, the idle sweep, and full shutdown all share one
  // teardown path.
  function closeSession(sid: string): Promise<void> {
    const entry = sessions.get(sid);
    return entry === undefined ? Promise.resolve() : entry.transport.close();
  }

  function oldestSessionId(): string | undefined {
    let oldestId: string | undefined;
    let oldestSeen = Infinity;
    for (const [sid, entry] of sessions) {
      if (entry.lastSeen < oldestSeen) {
        oldestSeen = entry.lastSeen;
        oldestId = sid;
      }
    }
    return oldestId;
  }

  async function evictIfAtCapacity(): Promise<void> {
    if (sessions.size < maxSessions) return;
    const oldestId = oldestSessionId();
    if (oldestId !== undefined) {
      await closeSession(oldestId);
    }
  }

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [sid, entry] of sessions) {
      if (now - entry.lastSeen >= sessionIdleMs) {
        void closeSession(sid);
      }
    }
  }, sessionIdleMs);
  sweeper.unref();

  const app = new Hono();
  app.use('/mcp', originGuard(config.allowedOrigins));
  app.get('/healthz', (c) => c.json({ ok: true }));

  app.all(
    '/mcp',
    bodyLimit({
      maxSize: maxBodyBytes,
      onError: (c) =>
        c.json(
          {
            code: 'payload_too_large',
            message: `Request body exceeds ${maxBodyBytes} bytes limit.`,
          },
          413,
        ),
    }),
    async (c) => {
      const sessionId = c.req.header('mcp-session-id');

      if (sessionId !== undefined) {
        const existing = sessions.get(sessionId);
        if (existing !== undefined) {
          existing.lastSeen = Date.now();
          return existing.transport.handleRequest(c.req.raw);
        }
        // Unknown session id: a different replica behind a load balancer, or
        // this process restarted since the client last saw an id. There is no
        // per-session state to recover (every tool is a pure function of its
        // arguments), so serve the request with a disposable stateless-mode
        // transport rather than rejecting it.
        // Omitting `sessionIdGenerator` (rather than setting it to `undefined`)
        // is what the SDK's `exactOptionalPropertyTypes`-incompatible type
        // requires for stateless mode; see class doc in
        // `webStandardStreamableHttp.d.ts`.
        const fallbackServer = buildServer(ctx);
        const fallbackTransport = new WebStandardStreamableHTTPServerTransport({});
        await fallbackServer.connect(fallbackTransport);
        return fallbackTransport.handleRequest(c.req.raw);
      }

      // No session id: this is either the `initialize` call or a client that
      // never uses sessions. Start a new sticky session for this process.
      await evictIfAtCapacity();
      const server = buildServer(ctx);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { server, transport, lastSeen: Date.now() });
        },
        onsessionclosed: (sid) => {
          sessions.delete(sid);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId !== undefined) {
          sessions.delete(transport.sessionId);
        }
      };
      await server.connect(transport);
      return transport.handleRequest(c.req.raw);
    },
  );

  return {
    app,
    closeSessions: async () => {
      clearInterval(sweeper);
      const ids = [...sessions.keys()];
      await Promise.all(ids.map((sid) => closeSession(sid)));
    },
  };
}
