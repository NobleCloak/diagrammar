import { parseArgs } from 'node:util';
import { stat } from 'node:fs/promises';
import { DiagrammarError } from '@noblecloak/diagrammar-core';
import { registryWithDirs, serve, type ServeConfig } from '@noblecloak/diagrammar-mcp';

export const help = `diagrammar mcp [--root <dir>] [--port 3737] [--host 127.0.0.1] [--no-fs] [--allow-origin <origin>]... [--icons <dir>]...

Runs the Diagrammar MCP server (Streamable HTTP) until interrupted.

Options:
  --root <dir>             Directory jailed for path-based tool arguments (default: cwd).
  --port <n>               Port to listen on (default: 3737).
  --host <addr>            Address to bind (default: 127.0.0.1).
  --no-fs                  Disable filesystem access entirely (pure render/edit service).
  --allow-origin <origin>  Additional allowed Origin header value (repeatable).
  --icons <dir>            Register an extra icon-set directory, relative to the current directory (repeatable).
`;

export async function run(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      port: { type: 'string' },
      host: { type: 'string' },
      'no-fs': { type: 'boolean', default: false },
      'allow-origin': { type: 'string', multiple: true },
      icons: { type: 'string', multiple: true },
    },
    allowPositionals: false,
  });

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

  const config: ServeConfig = { noFs, port, host };
  if (values.root !== undefined) config.root = values.root;
  if (values['allow-origin'] !== undefined && values['allow-origin'].length > 0) {
    config.allowedOrigins = values['allow-origin'];
  }

  let result;
  try {
    config.icons = registryWithDirs(values.icons ?? []);
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
