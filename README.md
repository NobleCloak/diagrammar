# Diagrammar

Diagrammar turns a small, hand-writable YAML file into a rendered diagram (PNG or
SVG) plus an optional Markdown walkthrough — with a first-class annotation layer
(callouts, notes, and focused views) and an MCP server so agents can create, patch,
validate, and render diagrams by element id.

The YAML file is the artifact of record. The PNG is a derived export. No Java, no
Graphviz install, no browser, and no third-party rendering service — Diagrammar
runs entirely in-process on Node or Bun and produces byte-identical output across
machines.

> **Status: pre-1.0.** The schema, CLI, and MCP surface are usable today but may
> still change before a 1.0 release. Breaking changes are called out in each
> release's Changesets-generated changelog.

## 30-second example

Write `flow.yaml`:

```yaml
diagrammar: 1
type: flowchart
title: Order fulfilment
direction: down

nodes:
  - id: start
    label: Order received
    shape: oval
  - id: check
    label: Check inventory
    shape: diamond
  - id: ship
    label: Ship order
    shape: rect

edges:
  - { id: yes, from: check, to: ship, label: 'in stock' }
  - { from: start, to: check }
```

Render it:

```bash
bunx @noblecloak/diagrammar render flow.yaml
```

That writes `flow.png` beside the input: a three-shape flowchart with one labeled
edge, laid out automatically — no manual positioning, ever.

## Features

- **Three diagram families, one schema shape** — `flowchart`, `architecture`, and
  `sequence`. See [`docs/format-guide.md`](docs/format-guide.md) for the full
  vocabulary of each.
- **Annotation layer** — numbered callouts, side-anchored or floating notes, and
  named _views_ that dim everything outside a focus set, all drawn without
  perturbing the underlying diagram's layout.
- **Deterministic rendering** — bundled fonts, a single serialized layout-engine
  instance, and no randomness anywhere in the render path. The same YAML produces
  byte-identical PNGs — checked in CI against committed goldens under Bun on
  Linux and macOS, and under Node 24 on Linux.
- **Agent-editable by id** — every node, edge, group, participant, message, note,
  callout, and view can be patched by a stable id through `diagrammar edit` or the
  `diagrammar_edit` MCP tool, never by rewriting the whole file.
- **Comment-preserving** — hand-written comments, blank lines, and formatting
  choices in the YAML survive programmatic edits outside the lines that actually
  changed.
- **Markdown walkthroughs** — every diagram can emit a `.md` companion: title,
  image reference, the callout legend, and an element-by-element description list,
  for docs that read well without the reader ever opening the image.
- **Themes** — four built-in presets plus reusable theme files (palette +
  per-kind style defaults).
- **Icons** — `icon: lucide/database` or `simple-icons/postgresql` on nodes,
  groups and participants (Lucide and Simple Icons bundled; local SVGs and an
  AWS importer), embedded inline for offline, deterministic renders.

## Install

```bash
bun add @noblecloak/diagrammar
# or
npm install @noblecloak/diagrammar
```

The `@noblecloak/diagrammar` package depends on `@noblecloak/diagrammar-core` and `@noblecloak/diagrammar-mcp` and
re-exports core, so one install gives you the CLI, the library, and the MCP server.

All packages are ESM-only (`"type": "module"`, `.mjs` builds) — there is no
CommonJS `require` entry point. `@noblecloak/diagrammar-core` also locates its bundled
Source Sans 3 font files by walking up from `import.meta.url` to find its own
`package.json` (`packages/core/src/engine/fonts.ts`), and resolves the
`@resvg/resvg-wasm` binary at runtime via `import.meta.resolve`; both assume
the package remains on disk in its normal, unbundled npm layout, so bundling
`@noblecloak/diagrammar-core` into a single-file application bundle can break asset
loading at runtime — keep it as an external dependency instead (with most
bundlers: mark it `external`).

## CLI

```
diagrammar render <files...> [-o <dir>] [--format png|svg|md|d2] [--view <id>] [--scale 1|2] [--theme <preset|path>] [--icons <dir>]... [--no-legend]
diagrammar validate <files...> [--icons <dir>]... [--json]
diagrammar new <file> --type flowchart|architecture|sequence [--title "..."]
diagrammar describe <file> [--json]
diagrammar edit <file> --ops <ops.json|-> [--expected-hash <sha256>]
diagrammar mcp [--root <dir>] [--port 3737] [--host 127.0.0.1] [--no-fs] [--allow-origin <origin>]... [--icons <dir>]...
diagrammar themes list [--json]
diagrammar icons search <query> [--set <id>] [--limit n] [--icons <dir>]... [--json]
diagrammar icons sets [--icons <dir>]... [--json]
diagrammar icons import aws <zip> --out <dir>
```

- `render` accepts globs. `-o <dir>` is an output _directory_ (created
  recursively if it doesn't exist) — without it, output is written beside each
  input file: `<stem>.png` (or `.svg`/`.md`/`.d2`) by default. `--view <id>`
  renders that view **instead of** the root diagram, to `<stem>.<view>.<ext>`
  rather than `<stem>.<ext>` — so running the command once for the root and
  once per view never overwrites a previous view's output.
- `validate` exits `1` if any file has errors, `0` otherwise; `--json` emits the
  full error list, each entry carrying a JSON path and a YAML line number.
- `edit` is the CLI face of the same typed operations the MCP `diagrammar_edit`
  tool uses, so scripted edits and agent edits can never drift apart. Its
  `--ops` file is a JSON array of either typed operations or an RFC 6902 JSON
  Patch — the shape is auto-detected.
- Every command exits `0` on success and `1` on any usage, validation, or I/O
  error.
- `themes list` prints the built-in presets. A file can also reference a theme
  file by relative path (`theme: ./themes/house.yaml`) — see the format guide
  §6.1.

See [`docs/format-guide.md`](docs/format-guide.md) for the full YAML schema and
[`plugin/skills/diagrammar/SKILL.md`](plugin/skills/diagrammar/SKILL.md) for an agent-facing authoring guide.

## MCP server

Diagrammar ships an MCP server (Streamable HTTP, or stdio with `--stdio`) with eight tools
(`diagrammar_list`, `diagrammar_describe`, `diagrammar_validate`,
`diagrammar_create`, `diagrammar_edit`, `diagrammar_render`, `diagrammar_schema`,
`diagrammar_icons`) and three resources (`diagrammar://schema/v1`,
`diagrammar://schema/theme-v1`, `diagrammar://guide`).

Start it:

```bash
diagrammar mcp --root . --port 3737
```

Then point Claude Code at it:

```bash
claude mcp add --transport http diagrammar http://127.0.0.1:3737/mcp
```

The server binds `127.0.0.1` by default and checks the `Origin` header against
localhost origins to block DNS rebinding. Pass `--no-fs` to disable path-based
tools and run it as a pure render-and-edit function service — the shape used for
hosting behind a load balancer (v1 ships no authentication for that mode). Under
`--no-fs`, `diagrammar_list` and `diagrammar_create` are not registered at all
(there is no filesystem root for them to operate on); of the remaining six,
`diagrammar_describe`, `diagrammar_validate`, `diagrammar_edit`, and
`diagrammar_render` work purely against inline `source` text, while
`diagrammar_schema` and `diagrammar_icons` take no `path` or `source`
argument and never touch the server root.

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

TypeScript consumers building an MCP client under `exactOptionalPropertyTypes`
will need a one-line `as Transport` bridge when passing a
`StreamableHTTPClientTransport` to `Client.connect` — the SDK's transport
type declares `sessionId?: string` while `StreamableHTTPClientTransport`
exposes `sessionId: string | undefined`, which `exactOptionalPropertyTypes`
treats as incompatible shapes (see `asTransport` in
`packages/mcp/src/mcp.integration.test.ts`).

## License

[Apache-2.0](LICENSE). Diagrammar consumes [D2](https://d2lang.com) (MPL-2.0),
[resvg](https://github.com/RazrFalcon/resvg) (MPL-2.0), and
[opentype.js](https://github.com/opentypejs/opentype.js) (MIT) unmodified, as
dependencies — none of them impose any obligation on Diagrammar's own code — and
bundles [Source Sans 3](packages/core/fonts/README.md) (SIL OFL 1.1).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development setup, the five CI
gates, and the goldens-update policy. Security issues: see
[`SECURITY.md`](SECURITY.md). Community expectations: see
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
