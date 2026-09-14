import { serve as nodeServe } from '@hono/node-server';
import { DiagrammarError, shutdown } from '@noblecloak/diagrammar-core';
import { createApp, type McpAppConfig } from './app.js';

export interface ServeConfig extends McpAppConfig {
  port: number;
  host?: string;
}

export interface ServeResult {
  port: number;
  host: string;
  close: () => Promise<void>;
}

const DEFAULT_HOST = '127.0.0.1';

/**
 * Note (M15, deferred): `serve()` is designed to be called at most once per
 * process — it doesn't track "am I already listening" state, so a second
 * call races its own listener against the first. The CLI's `mcp` command
 * and every test in this package only ever call it once per process; a
 * multi-instance-per-process use case is out of scope for this plan.
 */
export function serve(config: ServeConfig): Promise<ServeResult> {
  const host = config.host ?? DEFAULT_HOST;
  const { app, closeSessions } = createApp(config);
  return new Promise((resolveServe, rejectServe) => {
    const onListenError = (err: Error): void => {
      server.off('error', onListenError);
      rejectServe(
        new DiagrammarError(
          `Failed to start the MCP server on ${host}:${config.port}: ${err.message}`,
          'listen',
        ),
      );
    };
    const server = nodeServe({ fetch: app.fetch, port: config.port, hostname: host }, (info) => {
      server.off('error', onListenError);
      // Once listening, keep a persistent handler instead of removing the
      // listener entirely: a later socket-level error (e.g. ECONNRESET from
      // a misbehaving client) would otherwise be an unhandled 'error' event
      // on the underlying `http.Server`, which crashes the process. Log and
      // keep serving.
      server.on('error', (err: Error) => {
        console.error(`diagrammar MCP server error: ${err.message}`);
      });
      resolveServe({
        port: info.port,
        host,
        close: async () => {
          await new Promise<void>((resolveClose, rejectClose) => {
            server.close((err) => {
              if (err) rejectClose(err);
              else resolveClose();
            });
          });
          await closeSessions();
          await shutdown();
        },
      });
    });
    server.on('error', onListenError);
  });
}
