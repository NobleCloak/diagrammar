# Design: themes and icon sets

Date: 2026-09-14
Status: approved design, awaiting implementation plan
Depends on: `docs/spikes/2026-09-14-icons-and-themes-spike.md`

## 1. Goal

Add two independent axes to the Diagrammar format without breaking any
existing file, golden, or determinism guarantee:

- **Themes** — a reusable theme file (or a built-in preset) that sets the
  palette and per-kind style defaults for a whole diagram.
- **Icons** — an `icon:` reference on nodes, groups, and participants that
  resolves to an SVG from an installed icon set or a local file, embedded
  inline so rendering stays offline and byte-identical.

Open-licensed icon sets ship as separate npm packages. Vendor-owned sets
(AWS, Azure, GCP architecture icons) are generated locally from the vendor's
own download and are **not** published until their terms are confirmed.

## 2. Decisions already made

| Question                 | Decision                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Themes vs icons          | Two independent axes. A theme never changes which icons appear.                             |
| Where resolution happens | Before D2 ("resolve" stage between model and compile). D2 draws icons natively.             |
| Theme reference          | `theme:` holds a preset name **or** a relative path; no search paths, no second key.        |
| Theme file scope         | Base preset + palette + per-family and per-kind style defaults. No fonts, layout, or icons. |
| Icon placement           | Icon inside the shape by default; `shape: image` makes the icon the node.                   |
| Discovery                | CLI search + MCP tool + validation errors that name the nearest matches.                    |
| Packaging                | One optional package per open set; CLI and MCP depend on two of them by default.            |
| Vendor sets              | Local importer only this cycle. Nothing vendor-owned is published.                          |

## 3. Format changes (schema version stays `1`)

All changes are additive. A file that validates today validates and renders
identically after this work; the committed goldens do not change.

### 3.1 `theme:`

```yaml
theme: dark # preset name
theme: ./themes/house.yaml # relative path to a theme file
```

- Preset names match `^[a-z][a-z0-9-]*$` and must be one of: `light` (D2
  theme 0), `dark` (200), `colorblind` (8, "Colorblind clear"), `mono` (1,
  "Neutral grey"). Default remains `light`.
- Path form is any value containing `/` or ending in `.yaml`/`.yml`. It must
  be relative (no leading `/`, no drive letter) and is resolved against the
  diagram's base directory through the asset resolver (§6). A path that
  escapes the base directory is a validation error.
- A preset name that is not in the list, or a path form that fails to load or
  validate, is a validation error at `theme` with the loader's message.
- The model's `Theme` type changes from `'light' | 'dark'` to a resolved
  `ResolvedTheme` object (§4.4). Internal only; `RenderOptions` and the CLI do
  not gain a theme flag this cycle.

### 3.2 `icon:`

Accepted on `nodes[]`, `groups[]`, and `participants[]`.

```yaml
nodes:
  - id: db
    icon: lucide/database # <set>/<name>
  - id: fn
    icon: simple-icons/postgresql # brand set
    shape: image # icon is the node, label below
  - id: custom
    icon: ./icons/legacy.svg # relative path, sanitized at load
```

- Set form matches `^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$`. The set id
  is the registered `IconSet.id`; the name is the upstream slug unchanged.
- Path form follows the same rules as theme paths and must end in `.svg`.
- Unknown set, unknown name, or unreadable path is a validation error at the
  element's `icon` path. For an unknown name the message lists up to five
  nearest names from the same set (search ranking, §5.2). Icon checks run only
  when a registry/resolver is supplied (see §6.3 for the no-registry case).
- Simple Icons carries no Amazon/AWS marks (removed at the brand's request);
  AWS icons come only through the local importer (§5.5).
- Participants accept `icon` (verified on the engine, see the spike note).

### 3.3 `shape: image`

`image` joins both graph shape vocabularies (flowchart and architecture).
Semantic rule: `shape: image` without `icon` is a validation error
(`nodes[i].shape: image requires icon`). D2 renders the image at its default
image-shape size with the label beneath; no size control this cycle.

### 3.4 Compile output

For a node with an icon the compiler emits, in this order after the existing
`shape:` line:

```
icon: "<data:image/svg+xml;base64,...>"
```

quoted via `d2String()` (the spike shows an unquoted data URI is a D2 parse
error). For `shape: image` the shape line becomes `shape: image`. Theme
palette slots emit one `vars: { d2-config: { theme-overrides: { ... } } }`
block at the top of the D2 source, keys in a fixed order for determinism.
Per-kind defaults never appear in the D2 source as their own block; they are
merged into each element's style lines (§4.3).

## 4. Theme file

### 4.1 Schema (`diagrammar-theme` version 1)

```yaml
diagrammar-theme: 1
base: light # required; a preset name, never a path
palette: # all optional; color strings as in Style
  background: '#ffffff' # page background
  fill: '#f7f8fe' # node fill
  stroke: '#0d32b2' # node + group stroke
  text: '#0a0f25' # label text
  groupFill: '#eef1fb' # group/container fill
  edge: '#0d32b2' # edge/message stroke and arrowheads
defaults: # all optional; values are the existing Style subset
  nodes: {} # every node
  groups: {} # every group
  edges: {} # every edge
  participants: {} # every participant
  shapes: {} # keyed by graph shape: rect, cylinder, image, ...
  kinds: {} # keyed by participant kind: actor, service, database, queue
  messages: {} # keyed by message style: sync, async, return
```

Unknown keys anywhere in the file are errors (`.strict()`, matching the
diagram schema). `opacity` is accepted in defaults but a view's dimming still
wins (existing `styleLines(style, dim)` behavior). A theme file cannot name
another theme file: `base` is a preset only. This keeps resolution to exactly
one file read and avoids inheritance chains.

Every theme-file validation error is reported with the theme file's path
prefixed to the JSON path and the theme file's own YAML line number, e.g.
`themes/house.yaml: palette.fill: invalid color (line 6)`, so it cannot be
mistaken for an error in the diagram.

### 4.2 Palette lowering

A second probe (recorded in the spike note, "Slot map") showed that D2's
`theme-overrides` slots are **not** a stable way to recolor shapes: the slot a
shape's fill comes from depends on its nesting level and shape type (a
level-1 rectangle is `B6`, a level-2 one `B5`, a container `B4` or `B5`, a
cylinder `AA4`/`AA5`, a person `B3`, a document `AB4`, and diamonds,
hexagons, queues, clouds and parallelograms answer to no fill slot at all).
Only three slots are reliable across every element and both light and dark
bases: `N7` (page background), `N1` (all shape, container and fragment label
text) and `N2` (edge/message label text).

So the palette lowers two ways:

| palette slot | lowered to                                          |
| ------------ | --------------------------------------------------- |
| background   | D2 override `N7`; also the overlay's canvas colour  |
| text         | D2 overrides `N1` and `N2`                          |
| fill         | `style.fill` on every node and participant          |
| stroke       | `style.stroke` on every node, group and participant |
| groupFill    | `style.fill` on every group                         |
| edge         | `style.stroke` on every edge and message            |

The per-element lowering is implemented as the weakest layer of the same
family-defaults merge described in §4.3, so a palette slot behaves exactly
like a family default that the file's own `defaults:` block can override.
The `theme-overrides` block is emitted only when `background` or `text` is
set, and its keys are written in the fixed order `N1`, `N2`, `N7`.

### 4.3 Precedence

Strongest first, merged per key (a key set at a stronger level hides the same
key at a weaker one; other keys still flow through):

1. the element's own `style:`
2. per-kind default: `shapes[<shape>]`, `kinds[<kind>]`, `messages[<style>]`
3. per-family default: `nodes`, `groups`, `edges`, `participants`
4. palette slot (lowered per §4.2: `background`/`text` as D2 overrides,
   everything else folded under the matching family default)
5. base preset

View dimming (`DIM_OPACITY_LINE`) still overrides any resulting `opacity`.
The merge lives in one pure function, `mergeStyle(theme, element)`, called by
the graph and sequence compilers; it is the only place precedence is encoded.

### 4.4 Resolved theme

```ts
interface ResolvedTheme {
  name: string; // preset name, or the path as written
  base: PresetName;
  d2ThemeId: number;
  overrides: Partial<Record<D2Slot, string>>;
  defaults: ThemeDefaults; // normalized: every block present, possibly empty
}
```

Presets resolve to a `ResolvedTheme` with empty `overrides`, `palette` and
`defaults`. The diagram model itself carries only the reference string
(`theme: string`, the preset name or path as written); resolution is async
and happens in `render()`, so `parse()` and `validate()` stay synchronous.
`describe()` reports the reference string as `theme`.

### 4.5 JSON Schema

`packages/core/schema/diagrammar-theme-v1.json` is generated next to
`diagrammar-v1.json` by the existing `schema:generate` script and checked by
the existing drift test. `diagrammar_schema` (MCP) gains an optional
`kind: 'diagram' | 'theme'` argument, default `diagram`.

## 5. Icon registry and set packages

### 5.1 Core contracts

```ts
interface IconSet {
  id: string; // 'lucide', 'simple-icons', 'aws'
  version: string; // upstream version
  license: { spdx: string; url: string; notice?: string };
  load(): Promise<void>; // lazy; idempotent
  get(name: string): string | undefined; // sanitized SVG text
  names(): readonly string[];
  aliases(name: string): readonly string[];
}

class IconRegistry {
  register(set: IconSet): void; // duplicate id is an error
  sets(): readonly IconSet[];
  resolve(ref: string): Promise<{ set: IconSet; name: string; svg: string }>;
  search(query: string, opts?: { set?: string; limit?: number }): Promise<IconMatch[]>;
}
```

Core ships **no icons** and no default registry; `render`, `validate`, and
`describe` take an optional `icons: IconRegistry`. Set packages export a
single `IconSet` instance. Sets load lazily on first `resolve`/`search`, so
registering ten sets costs nothing until one is used.

### 5.2 Search ranking

Case-insensitive, per set, stable: exact name (1), name prefix (2), name
substring (3), alias exact (4), alias prefix/substring (5); ties broken by
name. `limit` defaults to 20. The same function produces the "nearest
matches" in validation errors (`limit: 5`, restricted to the referenced set).

### 5.3 Sanitizer

Applied at set build time and again to every local `.svg` at load:

- Reject: `<script>`, `<foreignObject>`, any `on*` attribute, any `href`/
  `xlink:href` that is not a `#fragment`, `<style>` outright (not only those
  with `@import`), and DTD declarations. Element and attribute checks use
  name-boundary assertions (e.g. a negative lookbehind/lookahead around the
  matched name) rather than a fixed list of delimiter characters, so a
  prefixed or namespaced form (`svg:script`) is still caught and a longer
  name that merely starts the same way (`data-href`, `on-brand`) is not a
  false positive.
- Normalize: drop root `width`/`height` when a `viewBox` exists (add a
  `viewBox` from them when it does not), ensure the SVG namespace is
  declared, strip XML comments and `<?xml ... ?>`, collapse whitespace.
- Cap: 256 KB after normalization. Over-cap is a validation error naming the
  icon and the cap.

The sanitizer is a pure function with a fixture-based test suite; it is the
security boundary for the path form under the MCP server.

### 5.4 Open-set packages (published)

| package                                     | upstream        | license | approx. icons |
| ------------------------------------------- | --------------- | ------- | ------------- |
| `@noblecloak/diagrammar-icons-lucide`       | `lucide-static` | ISC     | 1,500         |
| `@noblecloak/diagrammar-icons-simple-icons` | `simple-icons`  | CC0-1.0 | 3,300         |

Each is generated by `scripts/build-icon-set.ts <set>` from the pinned
upstream devDependency and publishes:

- `icons.json.gz` — gzip of `{ [name]: svg }`, sanitized and minified
- `index.json` — `{ version, names: string[], aliases: { [name]: string[] } }`
  (Simple Icons aliases come from its `_data`; Lucide from its `tags.json`)
- `LICENSE` (upstream, verbatim) and, for Simple Icons, `NOTICE.md` carrying
  the project's trademark disclaimer verbatim
- `index.mjs` exporting the `IconSet`

These packages are **not** in the Changesets fixed group; they bump on their
own when upstream is bumped. Target size is 1–3 MB unpacked each; the build
fails if a set exceeds 5 MB **gzipped** so a bad upstream change cannot
silently bloat installs.

### 5.5 Vendor sets (local only)

`diagrammar icons import aws <zip> --out <dir>` unpacks the official AWS
Architecture Icons zip, keeps the SVG variants only, derives names from the
file names (`Arch_AWS-Lambda_64.svg` → `lambda`; service-category directories
become aliases), runs the sanitizer, and writes the same `icons.json` +
`index.json` layout plus a `SOURCE.md` recording the zip's name and hash.
The directory is registered with `--icons <dir>` (CLI) or `--icons <dir>`
under the root (MCP) and is addressed as `aws/<name>`. Azure and GCP
importers reuse the machinery once the AWS importer has proven the format;
they are not part of this cycle.

## 6. Asset resolver and root jail

### 6.1 Contract

```ts
interface AssetResolver {
  read(relPath: string): Promise<Uint8Array>; // relative, POSIX separators
}
function fileResolver(baseDir: string, options?: { root?: string }): AssetResolver;
function memoryResolver(files: Record<string, string>): AssetResolver; // tests and docs
```

A path reference is validated lexically at parse time (semantic rule 10):
it must be relative, use `/` separators, and contain no null byte, drive
letter or backslash. `..` segments are allowed, because a shared theme file
normally lives above the diagrams that use it. Containment is enforced by
the resolver against a jail root chosen by the caller: `fileResolver`
rejects any resolved path outside `options.root` with `asset_outside_base`
and enforces nothing when `root` is omitted (trusted local use). It does
**not** resolve symlinks; the MCP server wraps it with the real-path jail
already in `packages/mcp/src/fs.ts` (`resolveInRoot`), so symlink escapes
are caught in the one place that already handles them.

### 6.2 Who supplies it

| caller             | base directory                         | notes                                   |
| ------------------ | -------------------------------------- | --------------------------------------- |
| CLI, file argument | `dirname(file)`                        | no jail root (local, trusted)           |
| CLI, stdin         | `process.cwd()`                        | documented in `render --help`           |
| MCP, `--root`      | the diagram's directory under the root | jail-wrapped                            |
| MCP, `--no-fs`     | none                                   | any path-form ref → `asset_fs_disabled` |
| library            | whatever the caller passes             | none passed → see §6.3                  |

### 6.3 Error codes (new `DiagrammarError` stages)

- `asset_resolver_missing` — the file uses a path-form theme or icon and no
  resolver was supplied. Message tells library callers to pass `resolver`.
- `asset_fs_disabled` — same situation under `--no-fs`.
- `asset_outside_base` — path is malformed or escapes the jail root.
- `asset_not_found` — the resolver could not find the file.
- `icon_unknown` — unknown set or name (message carries nearest matches).
- `icon_invalid` — sanitizer rejection or over-cap, with the reason.
- `theme_invalid` — theme file failed to parse or validate.

`validate()` is synchronous and checks syntax only: a theme path or icon ref
is accepted if well formed. Existence and content are checked by the async
`checkThemeRef(ref, resolver)` (and, in plan 2, the icon registry); the CLI
and MCP always run those after a successful `validate()` so validation there
is complete. This is the one deliberate difference between library and
tool behavior and is stated in the format guide.

## 7. CLI and MCP surface

### 7.1 CLI

- `diagrammar icons search <query> [--set <id>] [--limit n] [--icons <dir>]...` —
  one `set/name` per line, ranked.
- `diagrammar icons sets [--icons <dir>]...` — id, version, license, icon count
  per registered set.
- `diagrammar icons import aws <zip> --out <dir>` — §5.5.
- `diagrammar themes list` — preset names with their D2 base.
- `--icons <dir>` — repeatable; registers a local set directory. Accepted by
  `render`, `validate`, and `mcp`.
- The CLI package depends on both open-set packages and registers them by
  default, so `icon: lucide/...` works after `npm i -g @noblecloak/diagrammar`.

### 7.2 MCP

- New tool `diagrammar_icons` — input `{ query?: string; set?: string;
limit?: number }`. Without `query` it returns the registered sets with
  license info. Output mirrors the CLI.
- `diagrammar_schema` gains `kind`.
- `diagrammar_render`, `diagrammar_validate`, `diagrammar_describe`,
  `diagrammar_edit` resolve themes and icons through the root automatically.
  `--icons <dir>` on `diagrammar mcp` must point inside the root.
- `guide.ts` / `docs/SKILL.md` gain the discover-then-reference workflow:
  search for a name, then write `icon: set/name`, then validate.

### 7.3 `describe()` and the walkthrough

`describe()` keeps `theme` as the reference string as written (preset name or
path) and adds `icon` on every element that has one. The Markdown walkthrough is unchanged.

## 8. Testing

- **Unit (core):** theme schema incl. strictness and line numbers; palette to
  D2 slot table (one test per row); `mergeStyle` precedence (every level
  beats the one below it, per key); icon ref parsing; registry search ranking
  and nearest-match; sanitizer fixtures (accept and reject cases); resolver
  containment; each new error code.
- **Engine:** the spike scenarios as permanent tests: inline icon in a
  rectangle, `shape: image`, participant icon, theme-overrides asserted via
  output colors on both light and dark bases, 256 KB icon.
- **Goldens:** `examples/themed.yaml` + `examples/themes/house.yaml`, and
  `examples/icons.yaml` (architecture; Lucide, Simple Icons, and
  `examples/icons/custom.svg`). Both join the determinism test and the
  four-cell CI matrix. Existing goldens must be byte-identical before and
  after.
- **MCP integration:** theme path escaping the root is rejected; symlinked
  theme path is rejected; `--no-fs` rejects path-form refs; `diagrammar_icons`
  search returns ranked results; unknown icon error carries suggestions.
- **CLI:** `icons search`, `icons sets`, `themes list`, `--icons` with the
  importer's output on a small fixture zip; `icons import aws` on that
  fixture.
- **Set packages:** build test asserts icon count within an expected range,
  every SVG passes the sanitizer, and a random sample of 25 rasterizes through
  resvg without error. Package size gate (§5.4).
- Coverage floors are unchanged; the icon set packages are excluded from the
  coverage floor (generated data plus a thin loader).

## 9. Versioning and rollout

- Core, MCP, CLI: one minor bump (0.2.0) via a single changeset; additive
  format, no breaking API change. `Theme` type change is internal.
- New packages `diagrammar-icons-lucide` and `diagrammar-icons-simple-icons`
  start at 0.1.0, outside the fixed group, each with its own trusted
  publisher on npmjs.com (same workflow file; see the release notes in
  `CLAUDE.md`).
- README gets an "Icons and themes" section; format guide gains §2.4 (`icon`,
  `image`), §6.1 (theme files), and an entry in §7 for the new validation
  rules.

## 10. Out of scope (deliberate)

- An in-file `palette:` block on the diagram itself.
- Theme inheritance (`base:` pointing at another theme file).
- Default icons per shape or kind inside a theme.
- Icon tinting or recoloring; icon size control.
- Publishing any vendor-owned icon pack; Azure and GCP importers.
- Fonts, layout, direction, or sketch mode in theme files.
- Search across sets that are installed but not registered.

## 11. Suggested sequencing

Two implementation plans, in this order, each shippable on its own:

1. **Resolver + themes** — §3.1, §4, §6, `themes list`, `describe().theme`,
   the themed golden. Lands the asset resolver and the jail wrapping that the
   icon work then reuses.
2. **Icons** — §3.2–3.4, §5, §7, the icons golden, the two set packages, and
   the AWS importer. Starts with the participant-icon spike (§3.2) and the
   slot-table spike is already done by plan 1.
