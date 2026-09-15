import { parseArgs } from 'node:util';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DiagrammarError } from '@noblecloak/diagrammar-core';
import {
  registryWithDirs,
  serve,
  serveStdio,
  type McpAppConfig,
  type ServeConfig,
  type StdioStreams,
} from '@noblecloak/diagrammar-mcp';

export const help = `diagrammar mcp [--root <dir>] [--port 3737] [--host 127.0.0.1] [--no-fs] [--allow-origin <origin>]... [--icons <dir>]...
diagrammar mcp --stdio [--root <dir>] [--no-fs] [--icons <dir>]...

Runs the Diagrammar MCP server until interrupted: Streamable HTTP by default,
or over stdin/stdout with --stdio.

Options:
  --root <dir>             Directory jailed for path-based tool arguments (default: cwd).
  --port <n>               Port to listen on (default: 3737).
  --host <addr>            Address to bind (default: 127.0.0.1).
  --no-fs                  Disable filesystem access entirely (pure render/edit service).
  --allow-origin <origin>  Additional allowed Origin header value (repeatable).
  --icons <dir>            Register an extra icon-set directory, relative to the current directory (repeatable).
  --stdio                  Speak MCP over stdin/stdout instead of HTTP; cannot be combined with
                           --port, --host or --allow-origin.

Use --stdio when an MCP client spawns the server itself (Claude Code plugin, editors); use the HTTP server for a long-running shared instance.
`;

const STDIO_CONFLICT = 'mcp: --stdio cannot be combined with --port, --host or --allow-origin';

/**
 * `streams` is a test seam for the stdio path (in-memory pipes instead of
 * the process's own stdin/stdout); `bin.ts` never passes it.
 */
export async function run(argv: string[], streams: StdioStreams = {}): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
      'no-fs': { type: 'boolean', default: false },
      'allow-origin': { type: 'string', multiple: true },
      icons: { type: 'string', multiple: true },
      stdio: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  const stdio = values.stdio === true;
  // Presence, not value: `--stdio --port 3737` is still a contradiction even
  // though 3737 is the HTTP default. `port`/`host`/`allow-origin` declare no
  // parser default, so `undefined` means "not on the command line".
  if (
    stdio &&
    (values.port !== undefined || values.host !== undefined || values['allow-origin'] !== undefined)
  ) {
    console.error(STDIO_CONFLICT);
    return 1;
  }

  const port = values.port !== undefined ? Number(values.port) : 3737;
  // 0 is deliberately still accepted alongside 1-65535: it's the standard
  // POSIX/Node convention for "let the OS assign a free port", already
  // relied on by this package's own tests and by `serve()`'s ephemeral-port
  // use (see serve.test.ts) — rejecting it here would just move that
  // friction into every caller that wants one. Genuinely invalid input
  // (non-integer, negative, or above 65535) still gets I8's exact message.
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('mcp: --port must be an integer between 1 and 65535');
    return 1;
  }
  const host = values.host ?? '127.0.0.1';
  const noFs = values['no-fs'] === true;

  if (values.root !== undefined) {
    let rootStat;
    try {
      rootStat = await stat(values.root);
    } catch {
      console.error(`mcp: --root ${values.root} is not a directory`);
      return 1;
    }
    if (!rootStat.isDirectory()) {
      console.error(`mcp: --root ${values.root} is not a directory`);
      return 1;
    }
  }

  const base: McpAppConfig = { noFs };
  if (values.root !== undefined) base.root = values.root;
  try {
    base.icons = registryWithDirs(values.icons ?? []);
  } catch (err) {
    if (err instanceof DiagrammarError) {
      console.error(`mcp: ${err.message}`);
      return 1;
    }
    throw err;
  }

  if (stdio) {
    return runStdio(base, streams);
  }

  const config: ServeConfig = { ...base, port, host };
  if (values['allow-origin'] !== undefined && values['allow-origin'].length > 0) {
    config.allowedOrigins = values['allow-origin'];
  }

  let result;
  try {
    result = await serve(config);
  } catch (err) {
    if (err instanceof DiagrammarError) {
      console.error(`mcp: ${err.message}`);
      return 1;
    }
    throw err;
  }
  console.error(`diagrammar MCP server listening at http://${result.host}:${result.port}/mcp`);

  await new Promise<void>((resolveShutdown) => {
    const onSignal = (): void => {
      result
        .close()
        .then(() => resolveShutdown())
        .catch(() => resolveShutdown());
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  });

  return 0;
}

async function runStdio(base: McpAppConfig, streams: StdioStreams): Promise<number> {
  const stdin = streams.stdin ?? process.stdin;
  const result = await serveStdio(base, streams);
  const where = base.noFs ? 'no filesystem access' : `root: ${resolve(base.root ?? process.cwd())}`;
  console.error(`diagrammar MCP server serving over stdio (${where})`);

  // The parent owns this process: when it closes our stdin (or sends a
  // signal) we are done. Whichever fires first wins; `close()` is idempotent
  // enough for the second to be a no-op on an already-closed transport.
  await new Promise<void>((resolveShutdown) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      result
        .close()
        .then(() => resolveShutdown())
        .catch(() => resolveShutdown());
    };
    stdin.once('end', finish);
    stdin.once('close', finish);
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });
  return 0;
}
