# Claude Code plugin and stdio transport — design

**Status:** approved design, 2026-09-15
**Builds on:** `docs/specs/2026-09-14-themes-and-icons-design.md` (MCP server surface, icon registry, root jail)

## 1. Problem

Diagrammar ships an agent-facing authoring guide (`docs/SKILL.md`, valid Claude Code skill
frontmatter) and a Streamable HTTP MCP server, but neither is discoverable by a fresh Claude Code
session:

- The skill file is registered nowhere. A session in another project never loads it.
- The HTTP server must be started by hand, on a fixed port, with a fixed `--root`. A globally
  registered server jails every other project's paths to whatever directory it was launched from.
- Claude Code cannot auto-launch an HTTP server; it can only spawn stdio servers.

Goal: `claude plugin install diagrammar@noblecloak` gives any project the skill and a working MCP
server rooted at that project, with no manual server management, and the plugin is ready to submit
to the official Claude Code plugin directory.

### Non-goals

- Slash commands, agents, or hooks in the plugin. Skill + MCP server only.
- A hosted (SaaS) MCP entry in the plugin. The HTTP server has no auth; a hosted entry waits for
  the auth story (tracked in the project notes as a v1.x gap).
- Replacing HTTP. HTTP stays the primary, documented-first transport for long-running local use
  and for the future hosted offering. stdio is a second adapter over the same server.
- Submitting the plugin directory form. That is a maintainer step with a checklist (§3.3).

## 2. stdio transport

### 2.1 Shape

New module `packages/mcp/src/stdio.ts`:

```ts
export interface StdioServeResult {
  close(): Promise<void>;
}

export async function serveStdio(config: McpAppConfig): Promise<StdioServeResult>;
```

- Accepts the existing `McpAppConfig`. `root`, `noFs` and `icons` are honoured exactly as in
  `createApp`. `allowedOrigins`, `sessionIdleMs`, `maxSessions` and `maxBodyBytes` are HTTP-only
  and ignored (documented on the function's JSDoc; not an error, so one config type serves both).
- Builds the same `McpServer` the HTTP app uses and connects it to the SDK's
  `StdioServerTransport` (`@modelcontextprotocol/sdk/server/stdio.js`).
- No session map, no origin guard, no body limit: a stdio server has exactly one client, its
  parent process.
- `close()` closes the transport, then calls core `shutdown()` (same teardown order as `serve()`).
- Nothing in `packages/mcp/src` may write to `stdout`; stdout is the protocol channel. Diagnostics
  go to `stderr` via `console.error` (the one existing call in `serve.ts` already does).

### 2.2 Refactor in `app.ts`

`createApp` currently builds the `ToolContext` inline and `buildServer(ctx)` is module-private.
Extract and export:

```ts
export function buildContext(config: Pick<McpAppConfig, 'root' | 'noFs' | 'icons'>): ToolContext;
export function buildServer(ctx: ToolContext): McpServer;
```

`createApp` calls both; `serveStdio` calls both. Behaviour of `createApp` is unchanged (existing
tests pin it). `packages/mcp/src/index.ts` exports `serveStdio` and `StdioServeResult` alongside
`serve`, `createApp`, `SERVER_VERSION`.

### 2.3 CLI

`diagrammar mcp` gains `--stdio` (boolean):

| Flag                         | HTTP (default)    | `--stdio`                    |
| ---------------------------- | ----------------- | ---------------------------- |
| `--root <dir>`               | as today          | as today (default: cwd)      |
| `--no-fs`                    | as today          | as today                     |
| `--icons <dir>` (repeatable) | as today          | as today                     |
| `--port`, `--host`           | as today          | usage error if given         |
| `--allow-origin`             | as today          | usage error if given         |
| startup message              | stderr, URL shown | stderr, `serving over stdio` |
| shutdown                     | SIGINT / SIGTERM  | stdin EOF, SIGINT, SIGTERM   |

Usage error, following the command's existing pattern (message on stderr, return code 1):
`mcp: --stdio cannot be combined with --port, --host or --allow-origin`. Detection uses "flag
present on the command line", not "differs from default", so `--stdio --port 3737` errors even
though 3737 is the default. The parser already declares `port` and `host` without defaults and
applies them after parsing, so presence is `values.port !== undefined`.

Startup line on stderr for `--stdio`:
`diagrammar MCP server serving over stdio (root: <abs root> | no filesystem access)`.

The `mcp` command's `--help` text lists `--stdio` after the HTTP options with the sentence
"Use `--stdio` when an MCP client spawns the server itself (Claude Code plugin, editors); use the
HTTP server for a long-running shared instance."

### 2.4 Documentation order

README "MCP server" section keeps the HTTP instructions first and unchanged, then adds a
"Spawned by the client (stdio)" subsection showing:

```sh
claude mcp add diagrammar -- npx -y @noblecloak/diagrammar@^0.2 mcp --stdio
```

and noting the root is the client's working directory unless `--root` is passed.

## 3. Plugin

### 3.1 Layout (in this repository)

```
plugin/
  .claude-plugin/plugin.json
  .mcp.json
  skills/diagrammar/SKILL.md      # canonical skill (moved from docs/SKILL.md)
  README.md                        # what you get, install commands, how the server is rooted
.claude-plugin/marketplace.json    # repo root: the "noblecloak" marketplace
docs/SKILL.md                      # three-line pointer to plugin/skills/diagrammar/SKILL.md
docs/plugin-submission.md          # maintainer checklist for the official directory form
```

`plugin.json`:

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

`.mcp.json`:

```json
{
  "diagrammar": {
    "command": "npx",
    "args": ["-y", "@noblecloak/diagrammar@^0.2", "mcp", "--stdio"]
  }
}
```

- `npx -y` fetches the published CLI on first use (Node ≥ 24 is the CLI's engine floor; the plugin
  README states it). No path into the plugin directory is needed, so `${CLAUDE_PLUGIN_ROOT}` is
  not used.
- No `--root`: the spawned server inherits Claude Code's working directory, so the jail is the
  project the session is in. This is the whole point of stdio-for-local.
- Tools surface in Claude Code as `mcp__plugin_diagrammar_diagrammar__diagrammar_<tool>`. The
  skill refers to tools by their bare `diagrammar_*` names, which also match the HTTP server;
  it does not hard-code the plugin prefix.

### 3.2 Skill move

`docs/SKILL.md` moves to `plugin/skills/diagrammar/SKILL.md` with `git mv` (history preserved).
Frontmatter stays `name: diagrammar` with the existing triggering `description`. The old path
becomes:

```md
# Diagrammar skill

The agent-facing authoring guide lives at [`plugin/skills/diagrammar/SKILL.md`](../plugin/skills/diagrammar/SKILL.md)
so the Claude Code plugin can ship it. Read it there.
```

Updates that follow the move: `docs/docs.test.ts` validates the YAML blocks at the new path;
README line "see `docs/SKILL.md`" points at the new path; the MCP `GUIDE` string in
`packages/mcp/src/guide.ts` is independent and unchanged.

### 3.3 Marketplace and directory submission

Repo-root `.claude-plugin/marketplace.json`:

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

Install path for users, documented in the plugin README and the main README:

```sh
claude plugin marketplace add NobleCloak/diagrammar
claude plugin install diagrammar@noblecloak
```

`docs/plugin-submission.md` is a checklist for the maintainer's submission to the official
directory (form at https://clau.de/plugin-directory-submission). It records:

- the `git-subdir` source the form asks for: `url` = `https://github.com/NobleCloak/diagrammar`,
  `path` = `plugin`, `ref` = the release tag of the CLI version pinned in `plugin.json`, `sha` =
  that tag's commit;
- security notes reviewers ask about: file access is jailed to the working directory (lexical +
  symlink resolution), `--no-fs` exists for a no-filesystem mode, local SVG icons pass a
  sanitizer, the server makes no network calls, the only network activity is `npx` fetching the
  CLI from npm with provenance attestations;
- what the plugin does not do: no hooks, no commands, no agents, no env vars read;
- the re-submission rule: resubmit when `plugin.json` changes its version (the form's `sha` must
  move).

Submitting is out of scope for the implementation plan.

## 4. Versioning

`plugin.json`'s `version` always equals `packages/cli/package.json`'s `version`.

The CLI version is bumped by the Changesets bot in the "Version Packages" PR, not by a human
commit, so the plugin version is synced by a script in the same step:

- New `scripts/sync-plugin-version.ts`: reads the CLI manifest version, writes it into
  `plugin/.claude-plugin/plugin.json` (preserving key order and the trailing newline), prints
  the result. Idempotent.
- Root `package.json` gains `"version": "changeset version && bun run scripts/sync-plugin-version.ts"`.
  `release.yml`'s `version-script` changes from `bun run changeset version` to `bun run version`,
  so the bot's PR carries the plugin bump.
- A test (`scripts/plugin.test.ts`, §5.3) asserts equality, so a manual version edit that
  forgets the plugin fails CI on `main`.

The `npx` range in `.mcp.json` (`^0.2`) is a major-line pin, not an exact version. It is edited by
hand when the CLI's caret line changes (pre-1.0 that is the minor, from 1.0 the major); the same
test asserts the range's caret line contains the CLI's current version so the two cannot drift
silently.

## 5. Testing

### 5.1 stdio end-to-end (`packages/mcp/src/stdio.test.ts`)

Uses the SDK's `StdioClientTransport` to spawn `node packages/cli/dist/bin.mjs mcp --stdio --root <tmpdir>`
(the existing `serve.test.ts` already spawns from `dist`, so build-before-test is an established
assumption in this package):

- initialize handshake reports `{ name: 'diagrammar', version: SERVER_VERSION }`;
- `tools/list` returns exactly the tool names an in-process `createApp` client returns for the
  same config (compare the two lists rather than hard-coding eight names a third time);
- `diagrammar_render` with `{ path: 'a.yaml' }` renders a file written into the tmp root, and a
  `path` outside the root is refused with the same error text as over HTTP;
- with `--no-fs`, `diagrammar_render` with `path` is refused and `source` still works;
- closing the client ends the child process (no orphan).

### 5.2 CLI flag exclusivity (`packages/cli/src/commands/mcp.test.ts`)

Runs `run(argv)` in-process (no spawn): `--stdio --port 1234`, `--stdio --host x`,
`--stdio --allow-origin http://a` each print the usage error text from §2.3 to stderr and return 1
before any server starts; `--stdio --root . --no-fs --icons dir` reaches `serveStdio` (mocked).

### 5.3 Plugin packaging (`scripts/plugin.test.ts`)

- `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` parse as JSON;
- `plugin.json.version === packages/cli/package.json.version`;
- `.mcp.json` has exactly one server named `diagrammar` whose `args` contain `mcp` and
  `--stdio`, and whose package caret range contains the CLI version;
- every marketplace `source` path exists and contains `.claude-plugin/plugin.json`;
- `plugin/skills/diagrammar/SKILL.md` has frontmatter with `name: diagrammar` and a non-empty
  `description`;
- `docs/SKILL.md` links to the canonical path.

### 5.4 No stdout writes (`packages/mcp/src/no-stdout.test.ts`)

Greps `packages/mcp/src/**/*.ts` (excluding tests) for `console.log(` and `process.stdout.write(`
and asserts zero matches, with a comment explaining that stdout is the stdio protocol channel.

### 5.5 Unchanged

HTTP tests, goldens, coverage thresholds. `scripts/publishable.test.ts` is unaffected: the plugin
directory is not an npm package.

## 6. Changesets

- `@noblecloak/diagrammar-mcp`: minor — `serveStdio`, exported `buildContext`/`buildServer`.
- `@noblecloak/diagrammar`: minor — `diagrammar mcp --stdio`.
- Core is in the fixed group and moves with them.

## 7. Open follow-ups (not in this plan)

- Hosted MCP entry in the plugin once auth exists.
- Official directory submission (maintainer, using `docs/plugin-submission.md`).
- Whether `@noblecloak/diagrammar-mcp` should publish a `bin` of its own so the plugin can skip the
  CLI package; deferred because the CLI is where `--icons` and root handling already live.
