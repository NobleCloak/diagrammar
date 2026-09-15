import type { Readable, Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { shutdown } from '@noblecloak/diagrammar-core';
import { buildContext, buildServer, type McpAppConfig } from './app.js';

export interface StdioServeResult {
  /** Closes the transport, then disposes the core engine (`shutdown()`), in that order — the same teardown `serve()` uses. */
  close(): Promise<void>;
}

/** Test seam: in-memory streams instead of the process's own stdio. The CLI never passes this. */
export interface StdioStreams {
  stdin?: Readable;
  stdout?: Writable;
}

/**
 * Serves the same tools and resources as `createApp`, over stdio: one client
 * (the parent process), no sessions, no origin guard, no body limit.
 *
 * Only `root`, `noFs` and `icons` from `McpAppConfig` apply. The HTTP-only
 * fields (`allowedOrigins`, `sessionIdleMs`, `maxSessions`, `maxBodyBytes`)
 * are accepted and ignored so one config type serves both transports.
 *
 * stdout is the protocol channel: never write diagnostics to it from this
 * process. Use `console.error`.
 */
export async function serveStdio(
  config: McpAppConfig,
  streams: StdioStreams = {},
): Promise<StdioServeResult> {
  const server = buildServer(buildContext(config));
  const transport = new StdioServerTransport(
    streams.stdin ?? process.stdin,
    streams.stdout ?? process.stdout,
  );
  await server.connect(transport);
  return {
    close: async () => {
      await transport.close();
      await shutdown();
    },
  };
}
