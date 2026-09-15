# Diagrammar for Claude Code

Diagrams as YAML files your agent can create, validate, patch and render — with
themes and icon sets — through the Diagrammar MCP server.

## What you get

- **Skill `diagrammar`** — the authoring guide Claude loads whenever a task needs
  a diagram as an editable artifact (`skills/diagrammar/SKILL.md`).
- **MCP server `diagrammar`** — eight tools (`diagrammar_list`, `diagrammar_describe`,
  `diagrammar_validate`, `diagrammar_create`, `diagrammar_edit`, `diagrammar_render`,
  `diagrammar_schema`, `diagrammar_icons`) and three resources, spawned on demand
  over stdio with `npx -y @noblecloak/diagrammar@^0.2 mcp --stdio`.

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
