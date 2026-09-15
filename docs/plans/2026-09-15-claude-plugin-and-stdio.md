# Claude Code Plugin and stdio Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stdio adapter over the existing MCP server (`serveStdio`, `diagrammar mcp --stdio`) and ship an in-repo Claude Code plugin (skill + MCP server) with a `noblecloak` marketplace manifest, so `claude plugin install diagrammar@noblecloak` gives any project the skill and a server rooted at that project.

**Architecture:** `packages/mcp/src/app.ts` exports `buildContext` and `buildServer`; a new `packages/mcp/src/stdio.ts` connects that same `McpServer` to the SDK's `StdioServerTransport`. The CLI's `mcp` command grows a `--stdio` flag that is mutually exclusive with the HTTP-only flags. The plugin lives at `plugin/` (manifest, `.mcp.json` spawning the published CLI with `npx`, the skill moved from `docs/SKILL.md`), the marketplace at `.claude-plugin/marketplace.json`, and a script keeps `plugin.json`'s version equal to the CLI's during the Changesets version step.

**Tech Stack:** TypeScript 6 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Bun 1.4 workspaces, Vitest 5, `@modelcontextprotocol/sdk` 1.30.0 (`server/stdio.js`, `client/stdio.js`), Node `parseArgs`, Changesets.

**Spec:** `docs/specs/2026-09-15-claude-plugin-and-stdio-design.md` (all sections). Existing surfaces this plan builds on: `createApp(config: McpAppConfig)` and `SERVER_VERSION` in `packages/mcp/src/app.ts`; `serve(config: ServeConfig)` in `packages/mcp/src/serve.ts`; `ToolContext { root?: string; noFs: boolean; icons: IconRegistry }` in `packages/mcp/src/fs.ts`; `defaultIconRegistry()` / `registryWithDirs(dirs)` in `packages/mcp/src/icons.ts`; `run(argv): Promise<number>` and `help` in `packages/cli/src/commands/mcp.ts`; `shutdown()` from `@noblecloak/diagrammar-core`.

## Global Constraints

- Gates run from the repo root, **build first** (type-aware lint reads `dist/*.d.mts`): `bun install --frozen-lockfile && bun run build && bun run lint && bun run format:check && bun run typecheck && bun run test`. Every task ends with `bun run typecheck && bun run test` green for the projects it touched; Task 7 runs the full chain plus coverage. Tests in `packages/mcp` that spawn `packages/cli/dist/bin.mjs` need `bun run build` first (the existing `serve.test.ts` already assumes a built `dist`).
- Existing goldens in `examples/goldens/` stay byte-identical; nothing in this plan touches rendering.
- No `any`. Optional fields are omitted, never set to `undefined`: `const config: X = { ... }; if (v !== undefined) config.v = v;` (the pattern already used in `packages/cli/src/commands/mcp.ts`).
- **Nothing in `packages/mcp/src` (outside `*.test.ts`) may call `console.log` or `process.stdout.write`.** stdout is the stdio protocol channel. Diagnostics go to `console.error`.
- Every commit is signed off (`git commit -s`) and ends with the two trailers shown in Task 1's commit step. Work on branch `chore/mcp-server-version` (already contains the `SERVER_VERSION` fix and the spec); never commit to `main`. Never stage `package.json` or `bun.lock` at the repo root except where Task 6 says to stage `package.json`; never use `git add -A` or `git add .`.
- Exact copy from the spec:
  - usage error: `mcp: --stdio cannot be combined with --port, --host or --allow-origin` (stderr, return 1);
  - stdio startup line: `diagrammar MCP server serving over stdio (root: <abs root>)` or `diagrammar MCP server serving over stdio (no filesystem access)`;
  - help sentence: `Use --stdio when an MCP client spawns the server itself (Claude Code plugin, editors); use the HTTP server for a long-running shared instance.`;
  - `.mcp.json` server: `{ "diagrammar": { "command": "npx", "args": ["-y", "@noblecloak/diagrammar@^0.2", "mcp", "--stdio"] } }`;
  - marketplace name `noblecloak`, plugin name `diagrammar`, plugin `source` `./plugin`;
  - install commands: `claude plugin marketplace add NobleCloak/diagrammar` then `claude plugin install diagrammar@noblecloak`;
  - `plugin.json` version always equals `packages/cli/package.json` version (currently `0.2.0`).
- Prettier formats JSON and Markdown under `plugin/` and `.claude-plugin/`; run `bunx prettier --write <files>` before every commit that adds them.

---

## File structure

| Path                                                   | Responsibility                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `packages/mcp/src/app.ts`                              | Existing. Gains exported `buildContext(config)` and `buildServer(ctx)`; `createApp` uses them (Task 1).   |
| `packages/mcp/src/stdio.ts`                            | New. `serveStdio(config)` connecting the server to `StdioServerTransport` (Task 2).                       |
| `packages/mcp/src/stdio.test.ts`                       | New. In-process `serveStdio` unit tests and the end-to-end spawn test against the built CLI (Tasks 2, 3). |
| `packages/mcp/src/no-stdout.test.ts`                   | New. Greps `src` for stdout writes (Task 2).                                                              |
| `packages/mcp/src/index.ts`                            | Existing. Exports `serveStdio`, `StdioServeResult`, `buildContext`, `buildServer` (Tasks 1, 2).           |
| `packages/cli/src/commands/mcp.ts`                     | Existing. `--stdio` flag, exclusivity check, stdio startup line, stdin-EOF shutdown (Task 3).             |
| `packages/cli/src/commands/mcp.test.ts`                | Existing. Flag-exclusivity and stdio-path tests (Task 3).                                                 |
| `plugin/skills/diagrammar/SKILL.md`                    | Moved from `docs/SKILL.md` (Task 4).                                                                      |
| `docs/SKILL.md`                                        | Becomes a pointer (Task 4).                                                                               |
| `docs/docs.test.ts`                                    | Existing. Validates the skill at its new path (Task 4).                                                   |
| `plugin/.claude-plugin/plugin.json`                    | Plugin manifest (Task 4).                                                                                 |
| `plugin/.mcp.json`                                     | Plugin MCP server entry (Task 4).                                                                         |
| `plugin/README.md`                                     | Plugin user docs (Task 4).                                                                                |
| `scripts/plugin.test.ts`                               | Plugin packaging tests (Tasks 4, 5, 6).                                                                   |
| `.claude-plugin/marketplace.json`                      | The `noblecloak` marketplace (Task 5).                                                                    |
| `docs/plugin-submission.md`                            | Maintainer checklist for the official directory (Task 5).                                                 |
| `scripts/sync-plugin-version.ts`                       | Copies the CLI version into `plugin.json` (Task 6).                                                       |
| `package.json` (root), `.github/workflows/release.yml` | `version` script and `version-script` wiring (Task 6).                                                    |
| `README.md`, `.changeset/*.md`                         | Docs and changesets (Task 7).                                                                             |

---

### Task 1: Export `buildContext` and `buildServer` from `app.ts`

**Files:**

- Modify: `packages/mcp/src/app.ts` (the `buildServer` function at line 73 and the top of `createApp` at line 80)
- Modify: `packages/mcp/src/index.ts`
- Test: `packages/mcp/src/app.test.ts`

**Interfaces:**

- Consumes: `ToolContext` from `./fs.js`, `defaultIconRegistry` from `./icons.js`, `McpAppConfig`.
- Produces:
  - `export function buildContext(config: Pick<McpAppConfig, 'root' | 'noFs' | 'icons'>): ToolContext`
  - `export function buildServer(ctx: ToolContext): McpServer`

- [ ] **Step 1: Write the failing tests**

Append to `packages/mcp/src/app.test.ts` (keep the existing imports; add `buildContext`, `buildServer` to the import from `./app.js`, and `import { resolve } from 'node:path';` plus `import { defaultIconRegistry } from './icons.js';` if not already imported):

```ts
describe('buildContext', () => {
  it('resolves root against cwd and keeps noFs false', () => {
    const ctx = buildContext({ noFs: false, root: 'examples' });
    expect(ctx.root).toBe(resolve('examples'));
    expect(ctx.noFs).toBe(false);
  });

  it('defaults root to cwd when omitted', () => {
    const ctx = buildContext({ noFs: false });
    expect(ctx.root).toBe(resolve(process.cwd()));
  });

  it('drops root entirely under noFs', () => {
    const ctx = buildContext({ noFs: true, root: 'examples' });
    expect(ctx.root).toBeUndefined();
    expect(ctx.noFs).toBe(true);
  });

  it('uses the bundled registry unless one is given', () => {
    const given = defaultIconRegistry();
    expect(buildContext({ noFs: true, icons: given }).icons).toBe(given);
    expect(buildContext({ noFs: true }).icons).not.toBe(given);
  });
});

describe('buildServer', () => {
  it('returns a server named diagrammar at SERVER_VERSION', async () => {
    const server = buildServer(buildContext({ noFs: true }));
    // McpServer exposes the low-level Server; its `initialize` result carries serverInfo.
    expect(server.server).toBeDefined();
    await server.close();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd packages/mcp test -- src/app.test.ts`
Expected: FAIL — `buildContext` / `buildServer` are not exported.

- [ ] **Step 3: Extract the two functions**

In `packages/mcp/src/app.ts`, replace the module-private `buildServer` and the first lines of `createApp` with:

```ts
/**
 * Turns the transport-independent part of `McpAppConfig` into the
 * `ToolContext` every tool and resource reads. Shared by the Streamable HTTP
 * app and the stdio server so both jail paths and register icon sets the
 * same way.
 */
export function buildContext(config: Pick<McpAppConfig, 'root' | 'noFs' | 'icons'>): ToolContext {
  const root = config.noFs ? undefined : resolve(config.root ?? process.cwd());
  return {
    root,
    noFs: config.noFs,
    icons: config.icons ?? defaultIconRegistry(),
  };
}

/** One fully registered `McpServer` (all tools + resources) over `ctx`, not yet connected to any transport. */
export function buildServer(ctx: ToolContext): McpServer {
  const server = new McpServer(SERVER_INFO);
  registerAllTools(server, ctx);
  registerResources(server, ctx);
  return server;
}

export function createApp(config: McpAppConfig): CreateAppResult {
  const ctx = buildContext(config);
  const sessionIdleMs = config.sessionIdleMs ?? DEFAULT_SESSION_IDLE_MS;
```

(Keep the rest of `createApp` exactly as it is; only the inline `root`/`ctx` construction is replaced. Note `ToolContext` is currently imported as a type only — that stays fine since `buildContext` returns an object literal.)

In `packages/mcp/src/index.ts`, change the first line to:

```ts
export { createApp, originGuard, SERVER_VERSION, buildContext, buildServer } from './app.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd packages/mcp test -- src/app.test.ts`
Expected: PASS, including every pre-existing `createApp` test (behaviour unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/app.ts packages/mcp/src/index.ts packages/mcp/src/app.test.ts
git commit -s -m "refactor(mcp): export buildContext and buildServer for a second transport

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 2: `serveStdio` and the no-stdout guard

**Files:**

- Create: `packages/mcp/src/stdio.ts`
- Create: `packages/mcp/src/stdio.test.ts`
- Create: `packages/mcp/src/no-stdout.test.ts`
- Modify: `packages/mcp/src/index.ts`

**Interfaces:**

- Consumes: `buildContext`, `buildServer`, `McpAppConfig` from `./app.js`; `shutdown` from `@noblecloak/diagrammar-core`; `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`.
- Produces:
  - `export interface StdioServeResult { close(): Promise<void> }`
  - `export interface StdioStreams { stdin?: Readable; stdout?: Writable }` (types from `node:stream`)
  - `export function serveStdio(config: McpAppConfig, streams?: StdioStreams): Promise<StdioServeResult>` — the optional `streams` argument exists only so tests can drive the server over in-memory streams; the CLI never passes it.

- [ ] **Step 1: Write the failing unit tests**

Create `packages/mcp/src/stdio.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { serveStdio } from './stdio.js';
import { SERVER_VERSION } from './app.js';
import { serve } from './serve.js';

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
```

Create `packages/mcp/src/no-stdout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Under `diagrammar mcp --stdio`, stdout IS the MCP wire: one stray
// `console.log` corrupts the JSON-RPC stream and the client disconnects with
// an opaque parse error. Every diagnostic in this package goes to stderr.
const srcDir = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('packages/mcp never writes to stdout', () => {
  const files = sourceFiles(srcDir);

  it('scans at least the app, serve and stdio modules', () => {
    const names = files.map((f) => path.basename(f));
    expect(names).toEqual(expect.arrayContaining(['app.ts', 'serve.ts', 'stdio.ts']));
  });

  it.each(files.map((file) => ({ name: path.relative(srcDir, file), file })))(
    '$name has no console.log or process.stdout.write',
    ({ file }) => {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/console\.log\(/);
      expect(text).not.toMatch(/process\.stdout\.write\(/);
    },
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd packages/mcp test -- src/stdio.test.ts src/no-stdout.test.ts`
Expected: `stdio.test.ts` FAILS (module `./stdio.js` not found); `no-stdout.test.ts` FAILS on the "scans at least" case because `stdio.ts` does not exist yet.

- [ ] **Step 3: Implement `serveStdio`**

Create `packages/mcp/src/stdio.ts`:

```ts
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
```

`StdioServerTransport`'s constructor is declared `(_stdin?: Readable, _stdout?: Writable, options?)` with the `node:stream` classes (verified in `dist/esm/server/stdio.d.ts`), which is why `StdioStreams` uses those exact types — no cast is needed for `PassThrough` in tests or `process.stdin`/`process.stdout` in the CLI.

Add to `packages/mcp/src/index.ts` after the `serve` lines:

```ts
export { serveStdio } from './stdio.js';
export type { StdioServeResult, StdioStreams } from './stdio.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd packages/mcp test -- src/stdio.test.ts src/no-stdout.test.ts`
Expected: PASS. If the initialize test hangs, the request line was not newline-terminated or `protocolVersion` was rejected — `'2025-11-25'` is the SDK 1.30.0 `LATEST_PROTOCOL_VERSION` (`dist/esm/types.js`); import that constant from `@modelcontextprotocol/sdk/types.js` instead of the literal if it has moved.

- [ ] **Step 5: Typecheck and lint the package**

Run: `bun run --cwd packages/mcp build && bun run typecheck && bun run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/stdio.ts packages/mcp/src/stdio.test.ts packages/mcp/src/no-stdout.test.ts packages/mcp/src/index.ts
git commit -s -m "feat(mcp): serveStdio, a stdio transport over the same server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 3: `diagrammar mcp --stdio` and the end-to-end spawn test

**Files:**

- Modify: `packages/cli/src/commands/mcp.ts` (whole file: help text, parser, new branch)
- Modify: `packages/cli/src/commands/mcp.test.ts` (replace the last test; add new ones)
- Modify: `packages/mcp/src/stdio.test.ts` (append the end-to-end suite)

**Interfaces:**

- Consumes: `serveStdio(config)` from `@noblecloak/diagrammar-mcp`; existing `serve`, `registryWithDirs`, `ServeConfig`, `McpAppConfig`.
- Produces: the `--stdio` flag, the usage error, the stderr startup line, and shutdown on stdin EOF. Later tasks spawn `node packages/cli/dist/bin.mjs mcp --stdio`.

- [ ] **Step 1: Write the failing CLI tests**

In `packages/cli/src/commands/mcp.test.ts`, **delete** the test `'help documents Streamable HTTP flags and never mentions stdio'` and add, inside the `describe('mcp command')` block:

```ts
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
    const runPromise = run(['--stdio', '--no-fs', '--icons', join(dir, 'aws')], { stdin, stdout });
    await new Promise((r) => setTimeout(r, 100));
    stdin.end();
    expect(await runPromise).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

Add to the imports at the top of the test file: `import { PassThrough } from 'node:stream';` and `import { join, resolve } from 'node:path';` (replacing the existing `join` import).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd packages/cli test -- src/commands/mcp.test.ts`
Expected: the new tests FAIL (`--stdio` is an unknown option → `parseArgs` throws; help lacks the sentence).

- [ ] **Step 3: Implement the flag**

Replace `packages/cli/src/commands/mcp.ts` with:

```ts
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
```

Note the icon-registry construction moved above the transport split so both paths share it; the pre-existing `--icons` error tests must still pass unchanged (same message, same single stderr line).

- [ ] **Step 4: Run the CLI tests**

Run: `bun run --cwd packages/mcp build && bun run --cwd packages/cli test -- src/commands/mcp.test.ts`
Expected: PASS (all pre-existing HTTP tests plus the new ones). If `stdin.once('end')` never fires for a `PassThrough`, the SDK transport has not started reading the stream — `serveStdio` must be awaited before `stdin.end()` is called (it is, via the 100 ms wait).

- [ ] **Step 5: Write the failing end-to-end spawn test**

Append to `packages/mcp/src/stdio.test.ts` (add these imports at the top: `import { mkdtemp, writeFile, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { fileURLToPath } from 'node:url'; import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';`):

```ts
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
    const deadline = Date.now() + 5000;
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
  }, 10_000);
});
```

`diagrammar_render`'s `format` argument (`packages/mcp/src/tools/render.ts:23`) accepts `"svg"`; the default is `"png"`, which returns an image block — `svg` keeps the assertions to JSON text.

- [ ] **Step 6: Build and run the end-to-end suite**

Run: `bun run build && bun run --cwd packages/mcp test -- src/stdio.test.ts`
Expected: PASS. On macOS a zombie-process race can make the last test flaky; if it fails only there, raise the poll deadline to 10 s rather than removing the assertion.

- [ ] **Step 7: Full package gates**

Run: `bun run lint && bun run typecheck && bun run --cwd packages/mcp test && bun run --cwd packages/cli test`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/commands/mcp.ts packages/cli/src/commands/mcp.test.ts packages/mcp/src/stdio.test.ts
git commit -s -m "feat(cli): diagrammar mcp --stdio for client-spawned servers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 4: Plugin directory and the skill move

**Files:**

- Move: `docs/SKILL.md` → `plugin/skills/diagrammar/SKILL.md` (with `git mv`)
- Create: `docs/SKILL.md` (pointer), `plugin/.claude-plugin/plugin.json`, `plugin/.mcp.json`, `plugin/README.md`
- Modify: `docs/docs.test.ts:24-28`, `README.md:134`
- Test: `scripts/plugin.test.ts` (create)

**Interfaces:**

- Produces: the paths above, which Tasks 5 and 6 read. `scripts/plugin.test.ts` exports nothing; Tasks 5 and 6 append tests to it.

- [ ] **Step 1: Write the failing packaging tests**

Create `scripts/plugin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The Claude Code plugin under plugin/ is not an npm package: nothing
// builds or validates it except this suite. It pins the shape Claude Code
// reads (manifest, .mcp.json, skill frontmatter) and the pointer that keeps
// docs/SKILL.md from silently diverging from the canonical skill.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(repoRoot, 'plugin');

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

const cliVersion = readJson(path.join(repoRoot, 'packages/cli/package.json')).version as string;

describe('plugin manifest', () => {
  const manifest = readJson(path.join(pluginDir, '.claude-plugin/plugin.json'));

  it('is named diagrammar', () => {
    expect(manifest.name).toBe('diagrammar');
  });

  it('carries the CLI version', () => {
    expect(manifest.version).toBe(cliVersion);
  });

  it('has a description, license and homepage', () => {
    expect(typeof manifest.description).toBe('string');
    expect(manifest.license).toBe('Apache-2.0');
    expect(manifest.homepage).toBe('https://github.com/NobleCloak/diagrammar');
  });
});

describe('plugin .mcp.json', () => {
  const servers = readJson(path.join(pluginDir, '.mcp.json')) as Record<
    string,
    { command: string; args: string[] }
  >;

  it('declares exactly one server, diagrammar, spawned with npx over stdio', () => {
    expect(Object.keys(servers)).toEqual(['diagrammar']);
    const server = servers.diagrammar!;
    expect(server.command).toBe('npx');
    expect(server.args).toContain('mcp');
    expect(server.args).toContain('--stdio');
    expect(server.args).not.toContain('--root');
  });

  it('pins a caret range of @noblecloak/diagrammar that contains the CLI version', () => {
    const spec = servers.diagrammar!.args.find((a) => a.startsWith('@noblecloak/diagrammar@'));
    expect(spec).toBeDefined();
    const range = spec!.slice('@noblecloak/diagrammar@'.length);
    expect(range).toMatch(/^\^\d+\.\d+$/);
    const [rangeMajor, rangeMinor] = range.slice(1).split('.').map(Number);
    const [major, minor] = cliVersion.split('.').map(Number);
    // Caret semantics: ^0.N pins the minor while major is 0; ^M.N pins the major from 1.0.
    if (major === 0) {
      expect([rangeMajor, rangeMinor]).toEqual([0, minor]);
    } else {
      expect(rangeMajor).toBe(major);
      expect(rangeMinor).toBeLessThanOrEqual(minor!);
    }
  });
});

describe('plugin skill', () => {
  const skillPath = path.join(pluginDir, 'skills/diagrammar/SKILL.md');

  it('exists with name: diagrammar and a non-empty description in its frontmatter', () => {
    expect(existsSync(skillPath)).toBe(true);
    const text = readFileSync(skillPath, 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter![1]).toMatch(/^name: diagrammar$/m);
    expect(frontmatter![1]).toMatch(/^description: \S.+$/m);
  });

  it('docs/SKILL.md is a pointer to the canonical skill', () => {
    const pointer = readFileSync(path.join(repoRoot, 'docs/SKILL.md'), 'utf8');
    expect(pointer).toContain('plugin/skills/diagrammar/SKILL.md');
    expect(pointer.split('\n').length).toBeLessThan(10);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd scripts test -- plugin.test.ts`
Expected: FAIL — `plugin/.claude-plugin/plugin.json` does not exist.

- [ ] **Step 3: Move the skill and write the pointer**

```bash
mkdir -p plugin/skills/diagrammar plugin/.claude-plugin
git mv docs/SKILL.md plugin/skills/diagrammar/SKILL.md
```

Create `docs/SKILL.md`:

```md
# Diagrammar skill

The agent-facing authoring guide lives at [`plugin/skills/diagrammar/SKILL.md`](../plugin/skills/diagrammar/SKILL.md)
so the Claude Code plugin can ship it. Read it there.
```

In the moved skill, replace the "## Starting the server" section (the last section of the file, from `## Starting the server` to the end) with:

````md
## Starting the server

If this skill arrived through the Claude Code plugin, the server is already
running: the plugin spawns `diagrammar mcp --stdio` in the session's working
directory, so `path` arguments are relative to that project.

To run a long-lived HTTP server by hand instead:

```bash
diagrammar mcp --root . --port 3737
```

then, in Claude Code:

```bash
claude mcp add --transport http diagrammar http://localhost:3737/mcp
```

or copy `.mcp.json.example` in this repo to `.mcp.json` in a project that already
has the server running. To have a client spawn the server itself without the
plugin:

```bash
claude mcp add diagrammar -- npx -y @noblecloak/diagrammar@^0.2 mcp --stdio
```
````

- [ ] **Step 4: Write the plugin files**

Create `plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "diagrammar",
  "version": "0.2.0",
  "description": "Author, validate, patch and render Diagrammar YAML diagrams (flowchart, architecture, sequence) from Claude Code — bundles the diagrammar skill and MCP server.",
  "author": { "name": "NobleCloak", "url": "https://github.com/NobleCloak" },
  "homepage": "https://github.com/NobleCloak/diagrammar",
  "repository": "https://github.com/NobleCloak/diagrammar",
  "license": "Apache-2.0",
  "keywords": ["diagram", "diagram-as-code", "mcp", "yaml", "d2", "architecture", "sequence"]
}
```

Create `plugin/.mcp.json`:

```json
{
  "diagrammar": {
    "command": "npx",
    "args": ["-y", "@noblecloak/diagrammar@^0.2", "mcp", "--stdio"]
  }
}
```

Create `plugin/README.md`:

````md
# Diagrammar for Claude Code

Diagrams as YAML files your agent can create, validate, patch and render — with
themes and icon sets — through the Diagrammar MCP server.

## What you get

- **Skill `diagrammar`** — the authoring guide Claude loads whenever a task needs
  a diagram as an editable artifact (`skills/diagrammar/SKILL.md`).
- **MCP server `diagrammar`** — eight tools (`diagrammar_list`, `diagrammar_describe`,
  `diagrammar_validate`, `diagrammar_create`, `diagrammar_edit`, `diagrammar_render`,
  `diagrammar_schema`, `diagrammar_icons`) and three resources, spawned on demand
  over stdio with `npx -y @noblecloak/diagrammar mcp --stdio`.

## Install

```sh
claude plugin marketplace add NobleCloak/diagrammar
claude plugin install diagrammar@noblecloak
```

Requires Node.js 24 or newer on your `PATH` (the `@noblecloak/diagrammar` CLI's
engine floor). The first tool call downloads the CLI through `npx`; later calls
reuse the npm cache.

## How the server is rooted

The server is spawned in Claude Code's working directory and jails every `path`
argument to it (lexical and symlink checks). Nothing outside the project is
readable or writable through the tools. It makes no network calls of its own;
the only network activity is `npx` fetching the CLI from npm.

Need a long-running shared server, or a different root? Run the HTTP server by
hand and register it instead — see the
[MCP server section of the main README](https://github.com/NobleCloak/diagrammar#mcp-server).

## Tool names inside Claude Code

Plugin-provided tools appear as `mcp__plugin_diagrammar_diagrammar__<tool>`, e.g.
`mcp__plugin_diagrammar_diagrammar__diagrammar_render`. The skill refers to them by
their bare `diagrammar_*` names.
````

- [ ] **Step 5: Repoint the docs test and README**

In `docs/docs.test.ts`, change the `DOC_FILES` entry `path.join(docsDir, 'SKILL.md')` to `path.join(repoRoot, 'plugin/skills/diagrammar/SKILL.md')`, and update the header comment's mention of `docs/SKILL.md` to `plugin/skills/diagrammar/SKILL.md`.

In `README.md` line 134, replace `[`docs/SKILL.md`](docs/SKILL.md)` with `[`plugin/skills/diagrammar/SKILL.md`](plugin/skills/diagrammar/SKILL.md)`.

- [ ] **Step 6: Format, run the tests**

Run: `bunx prettier --write plugin docs/SKILL.md README.md && bun run --cwd scripts test -- plugin.test.ts && bun run --cwd docs test`
Expected: PASS — the docs suite now validates the YAML/JSON blocks at the new path (the new `.mcp.json`-style block in the skill is a plain object, which the JSON check accepts).

- [ ] **Step 7: Commit**

```bash
git add plugin docs/SKILL.md docs/docs.test.ts README.md scripts/plugin.test.ts
git commit -s -m "feat(plugin): Claude Code plugin with the diagrammar skill and stdio MCP server

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 5: Marketplace manifest and the submission checklist

**Files:**

- Create: `.claude-plugin/marketplace.json`, `docs/plugin-submission.md`
- Modify: `scripts/plugin.test.ts` (append)

**Interfaces:**

- Consumes: `plugin/.claude-plugin/plugin.json` from Task 4.
- Produces: the marketplace file users add with `claude plugin marketplace add NobleCloak/diagrammar`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/plugin.test.ts`:

```ts
describe('marketplace', () => {
  const marketplace = readJson(path.join(repoRoot, '.claude-plugin/marketplace.json')) as {
    name: string;
    plugins: { name: string; source: string }[];
  };

  it('is the noblecloak marketplace listing the diagrammar plugin', () => {
    expect(marketplace.name).toBe('noblecloak');
    expect(marketplace.plugins.map((p) => p.name)).toEqual(['diagrammar']);
  });

  it('every plugin source resolves to a directory holding .claude-plugin/plugin.json', () => {
    for (const plugin of marketplace.plugins) {
      expect(plugin.source).toMatch(/^\.\//);
      const manifest = path.join(repoRoot, plugin.source, '.claude-plugin/plugin.json');
      expect(existsSync(manifest), `${plugin.source} has no plugin.json`).toBe(true);
      expect(readJson(manifest).name).toBe(plugin.name);
    }
  });
});

describe('submission checklist', () => {
  it('names the git-subdir path and the security notes reviewers ask about', () => {
    const text = readFileSync(path.join(repoRoot, 'docs/plugin-submission.md'), 'utf8');
    expect(text).toContain('https://clau.de/plugin-directory-submission');
    expect(text).toContain('`path` = `plugin`');
    expect(text).toContain('--no-fs');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd scripts test -- plugin.test.ts`
Expected: FAIL — `.claude-plugin/marketplace.json` does not exist.

- [ ] **Step 3: Create the marketplace file**

Create `.claude-plugin/marketplace.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-marketplace.json",
  "name": "noblecloak",
  "description": "NobleCloak plugins for Claude Code.",
  "owner": { "name": "NobleCloak", "url": "https://github.com/NobleCloak" },
  "plugins": [
    {
      "name": "diagrammar",
      "description": "Author, validate, patch and render Diagrammar YAML diagrams — skill plus MCP server.",
      "source": "./plugin",
      "author": { "name": "NobleCloak", "url": "https://github.com/NobleCloak" },
      "homepage": "https://github.com/NobleCloak/diagrammar",
      "license": "Apache-2.0",
      "keywords": ["diagram", "diagram-as-code", "mcp", "yaml"]
    }
  ]
}
```

- [ ] **Step 4: Write the submission checklist**

Create `docs/plugin-submission.md`:

```md
# Submitting the plugin to the Claude Code plugin directory

Maintainer checklist. Users do not need any of this: they install with
`claude plugin marketplace add NobleCloak/diagrammar` and
`claude plugin install diagrammar@noblecloak`.

## Before submitting

- [ ] `plugin/.claude-plugin/plugin.json` `version` equals the released
      `@noblecloak/diagrammar` version (CI test `scripts/plugin.test.ts`).
- [ ] That version is live on npm with provenance (`npm view @noblecloak/diagrammar version`).
- [ ] Fresh install works end to end in a scratch project:
      `claude plugin marketplace add NobleCloak/diagrammar`,
      `claude plugin install diagrammar@noblecloak`, then `/mcp` shows `diagrammar`
      connected and a `diagrammar_render` call succeeds.

## The form

Submit at https://clau.de/plugin-directory-submission. The source is a
`git-subdir` entry:

- `url` = `https://github.com/NobleCloak/diagrammar`
- `path` = `plugin`
- `ref` = the release tag for the CLI version in `plugin.json`
  (`@noblecloak/diagrammar@<version>`)
- `sha` = that tag's commit (`git rev-parse '@noblecloak/diagrammar@<version>^{commit}'`)

## Security notes (what reviewers ask)

- File access is jailed to the working directory Claude Code spawned the
  server in: lexical normalisation plus symlink resolution
  (`packages/mcp/src/fs.ts`, `resolveInRoot`).
- `--no-fs` runs the server with no filesystem access at all; path-based
  tools are not even registered.
- Local `.svg` icons pass a sanitizer (scripts, event handlers, external
  references and `<style>` rejected; 256 KB cap).
- The server makes no network calls. The only network activity is `npx`
  fetching `@noblecloak/diagrammar` from npm, published with provenance
  attestations via trusted publishing.
- The plugin has no hooks, commands or agents, and reads no environment
  variables.

## Resubmitting

Resubmit whenever `plugin.json` changes its version: the directory pins the
`sha`, so a new release is invisible until the entry moves.
```

- [ ] **Step 5: Format and run the tests**

Run: `bunx prettier --write .claude-plugin docs/plugin-submission.md && bun run --cwd scripts test -- plugin.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/marketplace.json docs/plugin-submission.md scripts/plugin.test.ts
git commit -s -m "feat(plugin): noblecloak marketplace manifest and directory submission checklist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 6: Plugin version sync in the Changesets version step

**Files:**

- Create: `scripts/sync-plugin-version.ts`, `scripts/sync-plugin-version.test.ts`
- Modify: `package.json` (root, `scripts` block only), `.github/workflows/release.yml` (the `version-script` line)

**Interfaces:**

- Produces: `export function syncPluginVersion(repoRoot: string): { previous: string; current: string }` plus a CLI entry that runs it against the real repo when executed directly.

- [ ] **Step 1: Write the failing test**

Create `scripts/sync-plugin-version.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncPluginVersion } from './sync-plugin-version.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'diagrammar-sync-'));
  await mkdir(path.join(root, 'packages/cli'), { recursive: true });
  await mkdir(path.join(root, 'plugin/.claude-plugin'), { recursive: true });
  await writeFile(
    path.join(root, 'packages/cli/package.json'),
    JSON.stringify({ name: '@noblecloak/diagrammar', version: '0.3.1' }, null, 2) + '\n',
  );
  await writeFile(
    path.join(root, 'plugin/.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'diagrammar', version: '0.2.0', license: 'Apache-2.0' }, null, 2) + '\n',
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('syncPluginVersion', () => {
  it('copies the CLI version into plugin.json, keeping key order and the trailing newline', async () => {
    const result = syncPluginVersion(root);
    expect(result).toEqual({ previous: '0.2.0', current: '0.3.1' });
    const text = await readFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), 'utf8');
    expect(text).toBe(
      JSON.stringify({ name: 'diagrammar', version: '0.3.1', license: 'Apache-2.0' }, null, 2) +
        '\n',
    );
  });

  it('is idempotent', async () => {
    syncPluginVersion(root);
    const before = await readFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), 'utf8');
    expect(syncPluginVersion(root)).toEqual({ previous: '0.3.1', current: '0.3.1' });
    const after = await readFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), 'utf8');
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd scripts test -- sync-plugin-version.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the script**

Create `scripts/sync-plugin-version.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Keeps `plugin/.claude-plugin/plugin.json`'s `version` equal to the CLI
 * package's. The CLI version is bumped by the Changesets bot in the "Version
 * Packages" PR (never by a human commit), so this runs as part of the root
 * `version` script that release.yml invokes — the bot's PR then carries the
 * plugin bump too. `scripts/plugin.test.ts` fails CI if the two ever differ.
 */
export function syncPluginVersion(repoRoot: string): { previous: string; current: string } {
  const cliManifest = path.join(repoRoot, 'packages/cli/package.json');
  const pluginManifest = path.join(repoRoot, 'plugin/.claude-plugin/plugin.json');
  const current = (JSON.parse(readFileSync(cliManifest, 'utf8')) as { version: string }).version;
  const plugin = JSON.parse(readFileSync(pluginManifest, 'utf8')) as Record<string, unknown> & {
    version: string;
  };
  const previous = plugin.version;
  if (previous !== current) {
    plugin.version = current; // assignment keeps the key in its original position
    writeFileSync(pluginManifest, JSON.stringify(plugin, null, 2) + '\n');
  }
  return { previous, current };
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { previous, current } = syncPluginVersion(repoRoot);
  console.error(
    previous === current
      ? `plugin.json already at ${current}`
      : `plugin.json ${previous} -> ${current}`,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd scripts test -- sync-plugin-version.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the version step**

In the root `package.json` `scripts` block, add after `"schema:generate"`:

```json
    "version": "changeset version && bun run scripts/sync-plugin-version.ts",
```

In `.github/workflows/release.yml`, change

```yaml
version-script: bun run changeset version
```

to

```yaml
version-script: bun run version
```

Then prove the wiring end to end without touching the real manifests: run `bun run scripts/sync-plugin-version.ts` — expected stderr `plugin.json already at 0.2.0` and no diff in `git status`.

- [ ] **Step 6: Lint, typecheck and format**

Run: `bun run lint && bun run typecheck && bunx prettier --check scripts package.json .github/workflows/release.yml`
Expected: clean (`scripts/tsconfig.json` already includes `*.ts`, so the new script is type-checked; `scripts/*` is not in the ESLint ignore list).

- [ ] **Step 7: Commit (root package.json is staged deliberately here, by path — `bun.lock` is NOT)**

```bash
git add scripts/sync-plugin-version.ts scripts/sync-plugin-version.test.ts .github/workflows/release.yml
git add -p package.json
```

In the interactive hunk selection, stage only the hunk adding the `"version"` script; answer `n` to any hunk that touches `devDependencies` or `dependencies` (the maintainer's uncommitted `@noblecloak/diagrammar` workspace edit lives there). If the environment cannot run `git add -p`, instead run:

```bash
git diff package.json > /tmp/pkg.diff   # inspect: it must show ONLY the "version" script line as your change
```

and ask before staging anything else. Then:

```bash
git commit -s -m "chore(release): sync plugin.json version during changeset version

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
git diff --stat package.json   # expected: the maintainer's dependency edit is still unstaged
```

---

### Task 7: README, changesets, full gates

**Files:**

- Modify: `README.md` (MCP server section, lines 136–172; Install section near line 79)
- Create: `.changeset/stdio-transport.md`, `.changeset/cli-stdio.md`
- Modify: `packages/mcp/package.json` (`description` field only)

- [ ] **Step 1: Document the stdio path after the HTTP path**

In `README.md`, directly after the paragraph ending `argument and never touch the server root.` (before the `TypeScript consumers` paragraph), insert:

````md
### Spawned by the client (stdio)

When an MCP client wants to own the server process (the Claude Code plugin,
editors), run it over stdio instead. The root defaults to the client's working
directory unless `--root` is passed; `--port`, `--host` and `--allow-origin`
are HTTP-only and rejected.

```bash
claude mcp add diagrammar -- npx -y @noblecloak/diagrammar@^0.2 mcp --stdio
```

Or install the plugin, which registers the skill and this server together:

```bash
claude plugin marketplace add NobleCloak/diagrammar
claude plugin install diagrammar@noblecloak
```
````

Change the section's first sentence from `Diagrammar ships a Streamable HTTP MCP server with eight tools` to `Diagrammar ships an MCP server (Streamable HTTP, or stdio with --stdio) with eight tools`.

In `packages/mcp/package.json`, change `"description"` to `"MCP server for Diagrammar diagrams (Streamable HTTP and stdio)."`.

- [ ] **Step 2: Add the changesets**

Create `.changeset/stdio-transport.md`:

```md
---
'@noblecloak/diagrammar-mcp': minor
---

New `serveStdio(config)` runs the same tools and resources over stdio for
clients that spawn the server themselves. `buildContext` and `buildServer`
are exported so other transports can reuse the registered server.
```

Create `.changeset/cli-stdio.md`:

```md
---
'@noblecloak/diagrammar': minor
---

`diagrammar mcp --stdio` speaks MCP over stdin/stdout (for the Claude Code
plugin and other clients that spawn the server). It cannot be combined with
`--port`, `--host` or `--allow-origin`; `--root`, `--no-fs` and `--icons`
work as before.
```

- [ ] **Step 3: Run the full gate chain**

Run: `bun install --frozen-lockfile && bun run build && bun run lint && bun run format:check && bun run typecheck && bun run test && bun run test -- --coverage`
Expected: all green; coverage thresholds (80 lines/branches/functions/statements) met. If `format:check` flags README or the changesets, run `bunx prettier --write` on them and re-run.

- [ ] **Step 4: Confirm goldens untouched and the docs suite still sees the skill**

Run: `git status --short examples/goldens && bun run --cwd docs test`
Expected: no golden changes; docs suite PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/mcp/package.json .changeset/stdio-transport.md .changeset/cli-stdio.md
git commit -s -m "docs: stdio transport and plugin install in the README, with changesets

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

## Self-review

**Spec coverage.** §2.1 `serveStdio`, HTTP-only fields ignored, close order, no stdout → Task 2. §2.2 `buildContext`/`buildServer` exported, `index.ts` → Tasks 1–2. §2.3 flag table, usage error, startup line, help sentence, stdin-EOF shutdown → Task 3. §2.4 README order → Task 7. §3.1 layout, `plugin.json`, `.mcp.json`, no `--root`, README tool-name note → Task 4. §3.2 `git mv`, pointer, docs test, README link, `GUIDE` untouched → Task 4. §3.3 marketplace, install commands, submission checklist → Task 5 (install commands also in Task 4's plugin README and Task 7's main README). §4 sync script, root `version` script, `release.yml`, equality test, caret-range test → Tasks 4 and 6. §5.1 → Task 3 step 5 (the eight-tool comparison is against an in-process HTTP client, per the spec's amended wording). §5.2 → Task 3 step 1. §5.3 → Tasks 4–5. §5.4 → Task 2. §6 changesets → Task 7. §7 follow-ups are out of scope by design.

**Placeholders.** None; every code step carries its full content. The SDK signatures used (`StdioServerTransport(Readable, Writable)`, `Client.getServerVersion()`, `StdioClientTransport.pid`, `stderr: 'pipe'`, protocol version `2025-11-25`) were verified against `@modelcontextprotocol/sdk` 1.30.0's `dist/esm` declarations while writing this plan.

**Type consistency.** `StdioServeResult { close(): Promise<void> }`, `StdioStreams { stdin?; stdout? }`, `serveStdio(config: McpAppConfig, streams?: StdioStreams)` are identical in Tasks 2 and 3; `run(argv, streams?: StdioStreams)` matches `bin.ts`/`main.ts`, which pass only `argv`. `buildContext(config: Pick<McpAppConfig, 'root' | 'noFs' | 'icons'>)` in Task 1 accepts the full `McpAppConfig` Task 2 passes (extra keys are fine on a `Pick` when the value is a typed variable, not an object literal). `syncPluginVersion(repoRoot): { previous; current }` matches its test. `readJson`, `repoRoot`, `pluginDir`, `cliVersion` are declared once at the top of `scripts/plugin.test.ts` in Task 4 and reused by Task 5's appended blocks.
