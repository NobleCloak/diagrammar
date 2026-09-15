# Diagrammar format guide

This is the full reference for the Diagrammar YAML format (schema version `1`).
Every key here matches `packages/core/schema/diagrammar-v1.json`, the generated
JSON Schema — if the two ever disagree, the generated schema is authoritative and
this file has drifted.

## 1. The envelope

Every file starts with these top-level keys. Unknown top-level keys are a
validation error.

```yaml
diagrammar: 1 # schema version — required, always 1 today
type: flowchart # flowchart | architecture | sequence — required
title: Order fulfilment # optional; shown in the walkthrough and window titles
direction: down # down | right | up | left — graph families only
layout: dagre # dagre | elk | tala — optional; each family has its own default
theme: light # a preset (light | dark | colorblind | mono) or ./path/to/theme.yaml — optional, default light
```

`direction` is rejected on `type: sequence` files — sequence diagrams have a
fixed top-to-bottom lifeline layout, so there is no direction to choose.
`layout` _is_ accepted on a sequence file (it's part of the envelope every
diagram type shares), but it has no effect there: a sequence diagram always
compiles to a fixed D2 sequence-diagram shape regardless of which layout
engine is named.

## 2. Flowchart and architecture

`flowchart` and `architecture` share one schema shape (nodes, groups, edges) with
different defaults and a different shape vocabulary:

|                   | flowchart                                                                          | architecture                                                                          |
| ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| default layout    | `dagre`                                                                            | `tala`                                                                                |
| default direction | `down`                                                                             | `right`                                                                               |
| shape vocabulary  | `oval`, `rect`, `diamond`, `document`, `parallelogram`, `hexagon`, `image`[^image] | `rect`, `cylinder`, `queue`, `cloud`, `person`, `hexagon`, `package`, `image`[^image] |
| groups            | flat (no nesting)                                                                  | can nest via `in`                                                                     |

[^image]: `image` requires `icon`; the icon becomes the node and the label sits below it.

### Groups

```yaml
diagrammar: 1
type: architecture
groups:
  - id: warehouse
    label: Warehouse
  - id: fulfilment
    label: Fulfilment
    in: warehouse # architecture only — nests this group inside another group
```

Flowchart groups may not use `in` — flowchart groups are always flat, one level.
Architecture groups can nest to any depth.

### Nodes

```yaml
diagrammar: 1
type: flowchart
groups:
  - id: fulfilment
    label: Fulfilment
nodes:
  - id: start # required; unique across the whole file
    label: Order received # optional; defaults to the id
    shape: oval # must be in the family's shape vocabulary; default rect
    in: fulfilment # optional; must name an existing group
    description: | # optional prose; picked up by the walkthrough emitter
      Submitted via web or MCP.
    style: # see "Style subset" below
      fill: '#eef'
```

### Icons

Nodes, groups and participants accept `icon:`. The value is either `<set>/<name>`
from an installed icon set (`diagrammar icons search <query>` finds names;
`lucide/…` and `simple-icons/…` are bundled with the CLI and MCP server) or a
relative path to a local `.svg` resolved against the diagram's directory:

```yaml
diagrammar: 1
type: architecture
nodes:
  - id: db
    shape: cylinder
    icon: lucide/database # icon drawn inside the shape
  - id: pg
    shape: image # the icon is the node, label below
    icon: simple-icons/postgresql
  - id: legacy
    icon: ./icons/custom.svg # local SVG, sanitized on load
```

Local SVGs pass a sanitizer (no scripts, `<foreignObject>`, `<style>` or
event-handler attributes, no external references, DOCTYPE/ENTITY
declarations rejected, 256 KB cap) and every icon is embedded inline, so
renders stay offline and byte-identical.
Simple Icons contains no Amazon/AWS marks; build a local `aws/` set from the
official download with `diagrammar icons import aws <zip> --out ./icons/aws`
and register it with `--icons ./icons/aws`, and search it with
`diagrammar icons search <query> --icons ./icons/aws`.

### Edges

```yaml
diagrammar: 1
type: flowchart
nodes:
  - id: start
  - id: check
  - id: ship
edges:
  - { from: start, to: check } # id is optional
  - { id: yes, from: check, to: ship, label: 'yes', style: { dashed: true } }
```

An edge without an `id` is addressable later (by notes, callouts, views, or a
`diagrammar edit` selector) by its `{from, to}` pair — **but only if that pair is
unique in the file.** Two parallel edges between the same two nodes must both
carry explicit `id`s, or validation rejects the file.

## 3. Sequence

```yaml
diagrammar: 1
type: sequence
participants:
  - id: user
    label: User
    kind: actor # actor | service | database | queue — default service
    icon: lucide/user # participants accept icon too
  - id: api
    label: API
  - id: db
    label: Database
    kind: database

messages:
  - { id: m1, from: user, to: api, label: 'POST /orders', style: sync } # sync | async | return
  - fragment: alt # alt | loop | opt | par
    label: in stock
    messages:
      - { from: api, to: db, label: reserve }
  - { from: api, to: user, label: '201 Created', style: return }
```

`messages` is a flat list where each item is either a message object or a
_fragment_ (an `alt`/`loop`/`opt`/`par` block with a nested, non-empty `messages`
list of its own — fragments can nest inside fragments). A message without an `id`
is addressed by its position path, e.g. `messages[1].messages[0]` for the `reserve`
message above — `describe()` always reports this path so you never have to compute
it by hand.

## 4. Selector rules

Everything addressable in a Diagrammar file — by `diagrammar edit`, by the
`diagrammar_edit` MCP tool, or by a note/callout/view's target — resolves through
one of three selector shapes:

1. `{ id: "check" }` — for anything with an explicit `id`: nodes, groups,
   participants, notes, callouts, views, and edges/messages that were given one.
2. `{ from: "check", to: "ship" }` — for an id-less edge, valid only when that
   `{from, to}` pair is unique among the file's edges.
3. `{ path: "messages[1].messages[0]" }` — for an id-less message, using its
   position path.

A selector that doesn't resolve to exactly one element is an error (`not_found` if
nothing matches, `ambiguous` if more than one element would).

## 5. Annotations

Annotations never change the underlying diagram's layout — D2 lays out nodes,
groups, and edges with no knowledge that notes or callouts exist; Diagrammar draws
all of them afterward, on top, using the coordinates D2 already computed.

### Notes

```yaml
diagrammar: 1
type: flowchart
nodes:
  - id: check
    label: Check inventory
notes:
  - id: n1 # optional
    at: check # a selector (section 4); omit entirely for a floating note
    side: right # left | right | top | bottom — default right
    width: 240 # max box width in px — default 240
    text: Checks the reservation ledger, not raw stock.
```

A note with an `at` is drawn as a small rounded box 24px beyond its target's edge,
on the side you chose, connected to the target by a dashed leader line — the box
wraps its text to `width` using the same font metrics D2 used, so the wrap matches
what's on the page. A note with no `at` — a _floating_ note — is stacked instead in
a column to the right of the whole diagram, in file order; use it for context that
doesn't belong to any one element (an overall caveat, a legend-style aside). If a
note's box would overlap another shape, Diagrammar nudges it outward a few times
before giving up and emitting a warning naming the note — dense diagrams may need
you to shorten a note's text or pick a different `side` by hand; there's no
automatic global layout for notes.

### Callouts

```yaml
diagrammar: 1
type: flowchart
nodes:
  - id: check
  - id: ship
edges:
  - id: yes
    from: check
    to: ship
callouts:
  - id: c1 # optional
    at: yes # a selector — required, no floating callouts
    number: 1 # optional; defaults to this callout's 1-based position in the list
    text: Happy path continues here. # optional — omit for a badge with no legend line
```

Callouts are numbered badges (small filled circles) pinned to the corner of their
target — or, for an edge or message target, to the midpoint of its route. Put two
or more callouts on the same target and their badges line up side by side in
number order. Below the diagram, a legend lists every callout that has `text`, one
line per number, in number order (a callout with no `text` gets a badge on the
diagram but no legend line — use that for "see the diagram" markers that don't
need explaining). Pass `--no-legend` (CLI) or `legend: false` (`RenderOptions`) to
suppress the legend entirely; the badges still render. Every callout's `number` —
explicit or auto-assigned — must be unique across the file; two callouts that
resolve to the same number is a validation error.

### Views

```yaml
diagrammar: 1
type: flowchart
nodes:
  - id: start
  - id: check
  - id: ship
edges:
  - { from: start, to: check }
  - { id: yes, from: check, to: ship }
views:
  - id: happy # required
    title: Happy path # optional
    focus: [start, check, ship, yes] # selectors — everything else dims to 25% opacity
```

A view doesn't change what's _in_ the diagram — it renders the same file with
everything outside `focus` dimmed, and hides (rather than dims) any note or
callout whose target isn't in focus. Callout numbers never change between the
root render and a view's render — they stay tied to the callout's position in the
file, not to what's currently visible. Render a specific view with `--view <id>`
(CLI) or `{ view: 'happy' }` (`RenderOptions`); it produces a sibling output file,
e.g. `annotated.happy.png` next to `annotated.png`, never replacing the root
render.

## 6. Style subset

`style` is accepted on nodes, groups, edges, participants, and messages, and is
deliberately small — it never leaks the underlying rendering engine's own styling
language into your file:

| Key           | Type         | Meaning                                               |
| ------------- | ------------ | ----------------------------------------------------- |
| `fill`        | color string | background fill                                       |
| `stroke`      | color string | border color                                          |
| `strokeWidth` | number       | border thickness                                      |
| `dashed`      | boolean      | dashed border/line                                    |
| `bold`        | boolean      | bold label text                                       |
| `italic`      | boolean      | italic label text                                     |
| `fontColor`   | color string | label text color                                      |
| `opacity`     | number, 0–1  | element opacity (this is also how views dim elements) |

Anything beyond this list is rejected at validation time — if you need something
the style subset can't express, that's a real gap; open an issue rather than
reaching for engine-specific syntax that doesn't exist in this file format.

### 6.1 Theme files

`theme:` names a built-in preset (`light`, `dark`, `colorblind`, `mono`; run
`diagrammar themes list`) or, when it contains a `/` or ends in `.yaml`/`.yml`,
a theme file resolved relative to the diagram's own directory (`..` is fine —
a shared theme usually lives above the diagrams that use it):

```yaml
diagrammar: 1
type: architecture
theme: ../themes/house.yaml
nodes:
  - id: db
    shape: cylinder
```

A theme file sets a base preset, an optional palette, and optional style
defaults. Every key is optional except `diagrammar-theme` and `base`:

```yaml
diagrammar-theme: 1
base: light # the preset to start from; never another file
palette:
  background: '#f6f3ee' # page background
  fill: '#fffdf8' # node and participant fill
  stroke: '#4a3f35' # node, group and participant border
  text: '#2b2520' # every label
  groupFill: '#efe8dc' # group background
  edge: '#8c5a2b' # edge and message lines
defaults: # values use the style subset above
  nodes: { strokeWidth: 2 }
  groups: { dashed: true }
  edges: {}
  participants: {}
  shapes: { cylinder: { fill: '#e6efe3' } } # per graph shape
  kinds: { database: { fill: '#e6efe3' } } # per participant kind
  messages: { return: { dashed: true } } # per message style
```

Precedence, strongest first: an element's own `style`, then its per-kind
default (`shapes`/`kinds`/`messages`), then its family default
(`nodes`/`groups`/`edges`/`participants`), then the palette, then the base
preset. View dimming still wins over any resulting `opacity`.

`diagrammar validate` and the MCP `diagrammar_validate` tool load the theme
file and report its problems as an issue at `theme`, prefixed with the theme
file's path and its own line number. The library's `validate()` only checks
the reference's syntax; pass `RenderOptions.resolver` (for example
`fileResolver(dirname(file))`) to `render()` so it can read the file, and see
`schema/diagrammar-theme-v1.json` for the generated JSON Schema.

## 7. Validation

Every validation error names a JSON path into your file and, where available, the
1-based YAML line number it came from:

```
edges[1].to: unknown node "shp" (line 17)
```

Beyond the schema shape itself, these are checked:

1. Every id (nodes, groups, participants, notes, callouts, views, and any
   explicit edge/message id) is unique across the whole file.
2. Every `from`, `to`, `in`, `at`, and `focus` entry names an element that
   actually exists.
3. Group parenting has no cycles.
4. Id-less edges have unique `{from, to}` pairs.
5. A fragment's `messages` list is never empty.
6. `shape` is in the current family's vocabulary; `kind` is in the participant
   vocabulary (`actor | service | database | queue`).
7. `nodes`/`edges` in a `sequence` file, or `participants`/`messages` in a graph
   file, is a family mismatch and is rejected.
8. `groups[].in` is only accepted in `architecture` — flowchart groups are flat.
9. Every callout's `number` (explicit or auto-assigned by position) is unique
   across the file.
10. A path-form `theme` is a well-formed relative path (no absolute paths,
    drive letters or backslashes).
11. `shape: image` requires `icon`.
12. A path-form `icon` is a well-formed relative path ending in `.svg`.

`diagrammar validate` and `diagrammar_validate` also check that every set-form
icon exists (unknown names list the nearest matches); the library's
`validate()` checks the reference syntax only — pass `RenderOptions.icons` (an
`IconRegistry`) and `resolver` to `render()`.

## 8. The Markdown walkthrough

`walkthrough(yaml)` (library) or `diagrammar render file.yaml --format md` (CLI)
emits a companion Markdown document: an `# <title>` heading, a reference to the
rendered image, the callout legend as an ordered list (in number order), and an
`## Elements` section listing every node/participant and every labeled edge or
message, alongside its `description` when it has one (elements without a
`description` are listed by label only). Ordering throughout is file order — the
walkthrough is deterministic for the same input, just like the image.

## 9. Determinism

Diagrammar bundles its own copy of the Source Sans 3 (SIL OFL 1.1) font family and
never falls back to a system font, uses exactly one serialized instance of the layout engine
per process, and introduces no randomness anywhere in the seven-stage render
pipeline (load → validate → model → compile → engine → overlay → raster). The same
YAML text produces byte-identical SVG and PNG output every time, on every machine —
this is asserted directly by `examples/determinism.test.ts` (same process, twice,
and a fresh Node child process) and, once the repository has a remote, by CI's
matrix comparing Node 24 and Node 26 on both Linux and macOS (four combinations,
all driven by Bun) against the same committed goldens.

## 10. A complete worked example

`examples/annotated.yaml` in this repository exercises every feature in this
guide at once: two groups, three notes (including one floating note), four
callouts (two of them sharing a single edge as their target), two views, and a
`description` on every node. Read it alongside its rendered goldens in
`examples/goldens/annotated.*` to see exactly how each key in this guide turns
into pixels. `examples/themed.yaml` alongside `examples/themes/house.yaml` is
the themed worked example: a path-form `theme:` reference and the theme file
it resolves to, with a palette and per-shape style defaults (§6.1).
`examples/icons.yaml` is the icons worked example: set-form icons on groups and
`shape: rect` nodes, `shape: image` icons (`simple-icons/kubernetes`,
`simple-icons/postgresql`), and a local `./icons/custom.svg` path-form icon.
