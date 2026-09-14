# Contributing to Diagrammar

## Setup

```bash
bun install
bun run build
bun run test
```

Requires Bun ≥ 1.4.2 to install and run every script, and Node ≥ 24 on `PATH`
regardless: `examples/determinism.test.ts` spawns a real `node` child process
to prove determinism survives a fresh process, so `bun run test` fails locally
without a `node` binary available even if you otherwise never invoke it
directly. CI exercises Node 24 and Node 26. Using a worktree for feature work
is a good habit but is not required.

## The five gates

Every change must pass all five before a commit, and CI enforces all five on
every pull request. On a fresh clone, `bun run build` must run first, before
`lint` — lint's type-aware rules read the built type declarations
(typescript-eslint resolves cross-package types through each package's
`exports` → `dist/*.d.mts`, which don't exist until `build` produces them):

```bash
bun run build         # tsdown, ESM output + .d.ts, per package — run first, see above
bun run lint          # eslint 10, typescript-eslint 8, type-checked rules
bun run format:check  # prettier 3.9.6, exact pin — run `bun run format` to fix
bun run typecheck     # tsc -b across all package project references
bun run test          # vitest run — never `bun test`, which is Bun's own runner
                       # with different semantics and can produce phantom failures
```

## Test-driven development

Write the failing test before the implementation, for every change — a schema
rule, a compiler mapping, an overlay geometry function, a document operation, an
MCP tool, a CLI command. Existing `*.test.ts` files next to each module are the
model for the shape a new test should take. `docs/spikes/` records the
empirical findings (D2 and resvg behaviour) the engine and overlay code depend
on.

Coverage thresholds (80% lines/branches/functions/statements, one global floor over the merged report, via
`@vitest/coverage-v8`, configured in `vitest.config.ts`) are enforced by
Vitest's own config, not just watched in CI — `bun run test` fails locally the
same way it fails in CI if you drop below the floor.

## Render goldens

`examples/goldens/**` are committed, byte-exact SVG/PNG/Markdown fixtures.
`examples/goldens.test.ts` compares every render against them; a diff there means
either a real regression (the fix is in your code, not the goldens) or an
intentional visual change (the fix is regenerating the goldens).

**Never hand-edit a file under `examples/goldens/`.** To regenerate them
deliberately:

```bash
bun run build
bun run goldens:update
```

(`goldens:update` runs `scripts/goldens-update.ts`.) Only run it when you mean to
change what a render looks like, and only in a commit that also adds a Changeset
(see below) describing the visual change — a goldens diff with no changeset is a
red flag in review, since it means either an accidental change slipped through or
a real one wasn't documented for consumers.

## Developer Certificate of Origin

Every commit must be signed off (`git commit -s`), which adds a
`Signed-off-by: Your Name <you@example.com>` trailer certifying the
[Developer Certificate of Origin](https://developercertificate.org/) — that
you have the right to contribute the change under this project's Apache-2.0
licence. CI rejects pull requests containing unsigned commits; fix a branch
with `git rebase --signoff main`. No CLA is required.

## Changesets

This repo uses [Changesets](https://github.com/changesets/changesets)
(`.changeset/config.json`) to version and release published packages:
`@noblecloak/diagrammar-core`, `@noblecloak/diagrammar-mcp`, and `@noblecloak/diagrammar` (the CLI) release in
lockstep through one `fixed` Changesets group, and
`updateInternalDependencies: "patch"` keeps each package's internal
dependency ranges on the others in step automatically. Every pull request
that changes published package behavior needs a changeset:

```bash
bunx changeset
```

Follow the prompts; it writes a Markdown file under `.changeset/` describing the
bump (`patch`/`minor`/`major`) and a one-paragraph summary that becomes the
changelog entry. Docs-only or CI-only changes don't need one.

## Commit style

Conventional prefixes: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`. Small,
focused commits — one logical change per commit, five gates green at each one.

## Pull requests

Open against `main`. CI runs the five gates across a Node 24 / Node 26 × Linux
(`ubuntu-latest`) / macOS (`macos-latest`) matrix (`.github/workflows/ci.yml`),
using Bun to install dependencies and run every script — Bun itself is the
tool runner in every cell of that matrix, not a separate dimension of it. One
cell (`ubuntu-latest`, Node 24) additionally runs the test suite directly
under Node (`node node_modules/vitest/vitest.mjs run`), so the goldens'
byte-identical claim is verified under Bun on Linux/macOS and under Node 24 on
Linux, not just under Bun everywhere. There is no `bun audit` (or other
dependency-audit) step in CI today. The release workflow
(`.github/workflows/release.yml`) runs after CI finishes successfully on
`main` (triggered by CI's `workflow_run`, not by the push itself, so a release
never proceeds against a commit CI hasn't passed) and opens (or updates) a
"Version Packages" pull request when a changeset is pending; merging _that_ PR
is what actually publishes to npm.
