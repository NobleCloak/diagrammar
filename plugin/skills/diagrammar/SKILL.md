---
name: diagrammar
description: Author, validate, patch, and render Diagrammar YAML diagrams (flowchart, architecture, sequence) through the diagrammar MCP server or CLI — use whenever a task needs a diagram as a first-class, agent-editable artifact rather than a one-shot image.
---

# Diagrammar

Diagrammar files are YAML, not pictures. Treat the `.yaml` file as the artifact you
read, write, and patch; treat the rendered PNG/SVG as something you regenerate
whenever you want to _see_ the current state, never as something you hand-edit.

## When to use this

Reach for Diagrammar whenever a task calls for a flowchart, an architecture/system
diagram, or a sequence diagram that:

- needs to be revised over multiple turns (add a node, reroute an edge, add a
  callout) rather than produced once and thrown away, or
- should be reviewable as a diff (YAML diffs cleanly; a PNG never does), or
- needs a Markdown walkthrough alongside the picture for readers who won't open
  the image.

If you only need a single, disposable diagram and will never revise it, a
lighter-weight tool may be faster — but if there's any chance of iteration, start
in Diagrammar's format from the beginning rather than converting later.

## The three file skeletons

Every file starts `diagrammar: 1` and a `type:`. Full key reference:
[`docs/format-guide.md`](https://github.com/NobleCloak/diagrammar/blob/main/docs/format-guide.md)
in the diagrammar repository, or the `diagrammar://guide` MCP resource. The
examples below are complete, valid files you can render as-is — swap in your
own ids, labels, and shapes.

**Flowchart** — a process with decisions and branches:

```yaml
diagrammar: 1
type: flowchart
title: Order fulfilment
direction: down

nodes:
  - id: check_stock
    label: Check inventory
    shape: diamond # oval | rect | diamond | document | parallelogram | hexagon
  - id: ship_order
    label: Ship order
    shape: rect

edges:
  - { id: in_stock, from: check_stock, to: ship_order, label: 'in stock' }
```

**Architecture** — a system's components and how they connect:

```yaml
diagrammar: 1
type: architecture
title: Order platform
direction: right

groups:
  - id: platform
    label: Platform

nodes:
  - id: api
    label: API
    shape: rect # rect | cylinder | queue | cloud | person | hexagon | package
    in: platform
  - id: worker
    label: Fulfilment worker
    shape: hexagon
    in: platform

edges:
  - { from: api, to: worker, label: 'dispatch' }
```

**Sequence** — messages between actors over time:

```yaml
diagrammar: 1
type: sequence
title: Place order

participants:
  - id: user
    label: User
    kind: actor # actor | service | database | queue — default service
  - id: api
    label: Order API

messages:
  - { id: place_order, from: user, to: api, label: 'POST /orders', style: sync }
```

To restyle a whole diagram, set `theme:` to a preset or to a theme file
(`diagrammar_schema` with `kind: "theme"` returns its schema); never reach for
per-node `style` to do what a theme can. To put an icon on a node, group or
participant, first call `diagrammar_icons` with a `query`, then set
`icon: <set>/<name>`; `shape: image` makes the icon the node. Never invent
icon names — unknown names fail validation.

## Id rules (read this before you patch anything)

- Every id is unique across the _entire file_ — nodes, groups, participants,
  notes, callouts, views, and any edge/message you gave an explicit id, all share
  one namespace.
- Prefer short, stable, `snake_case` ids you choose deliberately (`check_stock`,
  not `node_1`) — you will reference these ids again in later patches, in notes'
  and callouts' `at:`, and in views' `focus:`. Do not let the tool auto-generate
  ids you then have to look up.
- An edge or message _without_ an id is still addressable — by its `{from, to}`
  pair (edges, only if that pair is unique) or its position path (messages) — but
  giving it an id up front is cheaper than computing a position path later,
  especially before you know whether the pair will stay unique.
- Renaming an id later (`renameId`) rewrites every reference to it automatically
  — every `in`/`from`/`to`, every note/callout `at:`, and every view's `focus`
  entries — so you never have to hunt down references by hand. The one thing
  `renameId` can't do is rename a _view's own_ id; remove and recreate the view
  instead.

## Checking your work: `diagrammar_describe` and `diagrammar_validate`

Before patching, call `diagrammar_describe` to get a compact structural summary —
every element with its kind, id, label, and references, plus the file's current
content hash — without re-reading the whole YAML file. Use that hash as
`expectedHash` on your next `diagrammar_edit` call so a concurrent human edit to
the same file surfaces as a conflict instead of being silently overwritten.

Call `diagrammar_validate` after any edit you're unsure about; every error names a
JSON path and a YAML line number, e.g. `edges[1].to: unknown node "shp" (line 17)`.
An unknown `icon:` reference is validated the same way, and the error lists the
nearest matching names from the registered sets so you can fix a typo without
another `diagrammar_icons` round trip.

## Patching by id: `diagrammar_edit`

`diagrammar_edit` takes `source` (inline YAML) or `path` (relative to the server's
root), an `ops` array, and an optional `expectedHash`. All ops in one call apply
atomically: if any op would produce an invalid file, none of them are applied, and
you get back the same error shape `diagrammar_validate` produces.

The full set of typed operations, grouped by what they touch:

- **Nodes/groups/edges** (flowchart, architecture): `addNode`, `updateNode`,
  `removeNode`, `addGroup`, `updateGroup`, `removeGroup`, `addEdge`, `updateEdge`,
  `removeEdge`.
- **Participants/messages** (sequence): `addParticipant`, `updateParticipant`,
  `removeParticipant`, `insertMessage`, `updateMessage`, `removeMessage`.
- **Annotations**: `addNote`, `updateNote`, `removeNote`, `addCallout`,
  `updateCallout`, `removeCallout`, `setView`, `removeView`.
- **Cross-cutting** (any diagram type): `renameId`, `setMeta`.

That's 25 ops total, published as JSON Schema on the `diagrammar_edit` tool
itself and at the `diagrammar://schema/v1` resource; the `diagrammar://guide`
resource documents every op's exact fields, its selector/anchor rules
(`before`/`after`/`at: "end"`), which ops accept `cascade`, and why `setView` is
a full replacement while `update*` ops are a shallow merge — read that when an
operation's shape isn't covered by the three worked examples below.

**Example 1 — extend a flowchart with a new branch and label the new edge:**

```json
{
  "path": "flow.yaml",
  "expectedHash": "b17a...",
  "ops": [
    {
      "op": "addNode",
      "node": { "id": "escalate", "label": "Escalate to human", "shape": "rect" },
      "after": { "id": "check" }
    },
    {
      "op": "addEdge",
      "edge": { "id": "unclear", "from": "check", "to": "escalate", "label": "unclear" }
    }
  ]
}
```

**Example 2 — annotate an existing edge and add a focused view:**

```json
{
  "path": "flow.yaml",
  "ops": [
    {
      "op": "addCallout",
      "callout": {
        "at": { "from": "check", "to": "ship" },
        "text": "Fast path — no human involved."
      }
    },
    {
      "op": "addNote",
      "note": {
        "at": "check",
        "side": "right",
        "text": "Checks the reservation ledger, not raw stock."
      }
    },
    {
      "op": "setView",
      "view": { "id": "happy", "title": "Happy path", "focus": ["start", "check", "ship"] }
    }
  ]
}
```

**Example 3 — rename an id and remove a node that's no longer needed, cascading
its references:**

```json
{
  "path": "flow.yaml",
  "ops": [
    { "op": "renameId", "from": "check", "to": "check_inventory" },
    { "op": "removeNode", "target": { "id": "legacy_step" }, "cascade": true }
  ]
}
```

`removeNode`/`removeGroup`/`removeParticipant` refuse to apply if anything still
references the target — pass `cascade: true` deliberately when you mean to also
remove the dependents; the tool's response lists everything it removed.
`removeEdge` and `removeMessage` have no `cascade` option at all: they always
refuse outright if a note or callout still targets them, so remove or retarget
that annotation first.

## Seeing the result: `diagrammar_render`

Call `diagrammar_render` with the same `source`/`path` and, optionally, `format`
(`png` default, or `svg`), `view` (render one named view instead of the root),
`scale` (`1` or `2`, PNG only), `theme` (a preset — `light`, `dark`, `colorblind`,
`mono` — or a relative theme-file path), and `legend`. It returns an image content
block by default (`returnImage: true`) so you can look at the result directly in
the conversation; pass `outputPath` to also write the render to disk (only
available when the server has a filesystem root — see below). Render after every
meaningful batch of edits — don't assume a patch did what you intended without
looking. `diagrammar_render` validates icons the same way `diagrammar_validate`
does, so an unresolvable `icon:` fails the render with the same
nearest-match suggestions rather than producing a broken image.

## Filesystem vs. hosted (`--no-fs`) mode

`diagrammar mcp` normally jails path-based tools under `--root` (default: the
current directory). Started with `--no-fs` instead, the server becomes a pure
render-and-edit function service — the shape used for hosting behind a load
balancer, with no authentication in v1:

- `diagrammar_list` and `diagrammar_create` are not registered at all — there is
  no root for them to operate on.
- `diagrammar_describe`, `diagrammar_validate`, `diagrammar_edit`, and
  `diagrammar_render` all still work, but only against inline `source` text —
  their `path` (and `diagrammar_render`'s `outputPath`) arguments are dropped
  from the tool schema entirely rather than being advertised and always
  rejected.
- `diagrammar_schema` and `diagrammar_icons` are unaffected either way — neither
  takes a `path` or `source` argument.

In practice: if you're driving Diagrammar against a project's files on disk, use
a filesystem-mode server and `path`; if you're calling a shared/hosted server, or
just don't want to touch disk, pass full YAML as `source` on every call and read
the returned `yaml` field back instead of re-reading a file.

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

or copy `.mcp.json.example` from the diagrammar repository to `.mcp.json` in a
project that already has the server running. To have a client spawn the server
itself without the plugin:

```bash
claude mcp add diagrammar -- npx -y @noblecloak/diagrammar@^0.3 mcp --stdio
```
