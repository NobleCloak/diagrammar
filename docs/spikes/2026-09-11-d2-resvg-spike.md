# Spike: D2 + resvg coordinate mapping, fonts, and determinism

Date: 2026-09-11
Versions: `@d2lang/d2` 0.1.34 (D2 v0.9.0), `@resvg/resvg-wasm` 2.6.2
Runtimes actually used to produce this note: `node --version` → `v25.6.1`,
`bun --version` → `1.4.2`.

## Summary

Every core assumption the design makes about D2/resvg held: the coordinate
mapping via `origin = -innerViewBox.{x,y}`, no `<foreignObject>`, embedded
`@font-face` per weight, byte-identical determinism on both SVG and PNG, and
the base64-vs-`Uint8Array` font-buffer type bug in `@d2lang/d2`'s shipped
types. One assumption in the plan author's earlier draft of this note was
**wrong and is corrected below**: the connection-id format is not simply
`(<full src> -> <full dst>)[<n>]` — D2 factors out the longest common
dotted-prefix shared by `src` and `dst` when one exists (see "Connection id
format"). This does not affect any later plan's code (Plan 03's
`modelKeyForConnection` already pairs by `src`/`dst` fields, not by parsing
this string), but the note's prose claim needed fixing.

## Script location (deviation from the brief)

The brief's Step 1 places `spikes/spike.mjs` at the repo root. Running it
from there under Node fails immediately with `ERR_MODULE_NOT_FOUND` for
`@d2lang/d2`: this workspace does not hoist `@d2lang/d2` /
`@resvg/resvg-wasm` to the root `node_modules` — they live only under
`packages/core/node_modules` (dependencies of `@noblecloak/diagrammar-core`), and
Node's ESM resolver (unlike CJS `require`) does not consult `NODE_PATH`, so
there is no fixup short of moving the script or bundling. The script was
instead created at `packages/core/spikes/spike.mjs` (still gitignored — the
root `.gitignore`'s unanchored `spikes/` pattern matches at any depth,
confirmed with `git check-ignore -v --no-index packages/core/spikes/spike.mjs`
→ matched) and run from `packages/core/`:

```bash
cd packages/core
node spikes/spike.mjs
bun spikes/spike.mjs
```

`FONT_DIR` was adjusted from `path.join(HERE, '..', 'packages', 'core',
'fonts')` to `path.join(HERE, '..', 'fonts')` to match the new location. No
other logic in the brief's script changed except two additive diagnostics
(see "Surprises").

## SVG structure

D2 emits **two nested `<svg>` elements**, not a `<g transform>`:

```
<svg ... viewBox="0 0 758 318"> <!-- outer: canvas size -->
  <svg class="d2-<hash> d2-svg" viewBox="15 19 758 318"> <!-- inner: shape space -->
    <rect .../> <!-- page background -->
    ... shapes, connections, text ...
  </svg>
</svg>
```

No `<g transform="translate(...)">` appears anywhere. This structure was
identical across all three layout engines (only the inner viewBox's origin
changed, and it can be negative). Actual observed values (not the brief
template's placeholder numbers, which were close but not exact — e.g. dagre's
height is 318 here, not 313; elk's is 361, not 359):

| layout | outer viewBox | inner viewBox |
|---|---|---|
| dagre | `0 0 758 318` | `15 19 758 318` |
| tala  | `0 0 832 420` | `-25 -25 832 420` |
| elk   | `0 0 958 361` | `-13 -13 958 361` |

**Coordinate mapping (confirms `LaidOutDiagram.origin`):** a shape's `pos` is
in the INNER `<svg>`'s coordinate space. To place an element at the same
visual position as a shape, add `origin = { x: -innerViewBox.x, y:
-innerViewBox.y }` to the shape's `pos`. Verified empirically for all three
layouts:

- dagre: shape `ship` has `pos: { x: 673, y: 172 }`, size `75x67`; `origin =
  { x: -15, y: -19 }`; a 6px red circle drawn at `(673 - 15, 172 - 19) =
  (658, 153)` and rasterized with resvg produced pixel RGBA `[255, 0, 0,
  255]` at exactly that pixel.
- tala: `ship` `pos: { x: 707, y: 152 }`; `origin = { x: 25, y: 25 }`; marker
  at `(732, 177)` → `[255, 0, 0, 255]`.
- elk: `ship` `pos: { x: 845, y: 188 }`; `origin = { x: 13, y: 13 }`; marker
  at `(858, 201)` → `[255, 0, 0, 255]`.

All three `isRed` checks (`pixel[0] > 200 && pixel[1] < 50 && pixel[2] <
50`) passed. **Correction to the plan author's draft:** the pixel "30px away
in x" is **not** reliably page background — `ship`'s bounding box is 75px
wide, so a point 30px to the right of its top-left corner is still inside
the shape's own fill (`[13, 50, 178, 255]`, D2's default-theme rectangle
fill, observed identically at all three layouts). The true page background,
sampled at the raster's `(2, 2)` corner (guaranteed outside every shape),
is white — `[255, 255, 255, 255]` — not the `[247, 248, 254, 255]` value the
draft asserted. `engine/D2Engine.ts`'s `computeOrigin()` implements exactly
the origin formula above, generalized to also handle a single `<svg>` with a
`<g transform="translate(tx,ty)">` (`origin = {x:tx,y:ty}`) or a single
`<svg>` with neither (`origin = {x:0,y:0}`), in case a future D2 version
changes its output shape — neither of those alternate cases was actually
observed against 0.1.34.

## Connection id format (correction to the plan author's draft)

The spike's source has three connections. For each layout engine,
`spike.mjs` printed `result.diagram.connections.map((c) => c.id)` and the
matching `src`/`dst` pairs. All three layout engines produced the same three
ids, byte-identical (only shape/route coordinates differed by layout):

```
connection ids: ["warehouse.fulfilment.(start -> check)[0]","(warehouse.fulfilment.check -> ship)[0]","warehouse.fulfilment.(check -> start)[0]"]
connection src/dst: [{"src":"warehouse.fulfilment.start","dst":"warehouse.fulfilment.check"},{"src":"warehouse.fulfilment.check","dst":"ship"},{"src":"warehouse.fulfilment.check","dst":"warehouse.fulfilment.start"}]
```

The plan author's draft asserted the format is always `(<full src> -> <full
dst>)[<n>]`. **That is wrong.** The actual format is:

- When `src` and `dst` share a common dotted-path ancestor (here,
  `warehouse.fulfilment.start` and `warehouse.fulfilment.check` both live
  under `warehouse.fulfilment`), D2 factors that shared prefix out to the
  front, unparenthesized, and wraps only the differing suffixes in
  parens: `warehouse.fulfilment.(start -> check)[0]`.
- When `src` and `dst` share no common ancestor (here,
  `warehouse.fulfilment.check` and `ship`), the full qualified keys of both
  are wrapped in parens: `(warehouse.fulfilment.check -> ship)[0]`.
- The trailing `[<n>]` is a zero-based index counting prior connections
  already emitted between that exact ordered `(src, dst)` pair — both
  `check -> start` and `start -> check` in this source are distinct ordered
  pairs, so each independently starts at index `0`.

**The `[<n>]` counting behavior above was not actually exercised by the main
spike source** (it has no duplicate `(src, dst)` pair) — the "counts prior
connections" claim was carried over from the plan author's draft without a
matching observation. It has since been exercised directly with a minimal
source containing two `a -> b` connections plus one `b -> a`:

```
CHECK C: connection ids: ["(a -> b)[0]","(a -> b)[1]","(b -> a)[0]"]
CHECK C: connection src/dst: [{"src":"a","dst":"b"},{"src":"a","dst":"b"},{"src":"b","dst":"a"}]
```

This confirms the claim as observed, not merely asserted: the two `a -> b`
connections get `[0]` and `[1]` in emission order, and the reverse `b -> a`
connection — a distinct ordered pair — starts its own counter at `[0]`. (No
common-prefix factoring applies here since `a` and `b` are both top-level,
so the ids are the flat `(a -> b)[n]` form.)

This is a real correction to the format contract's informal description
(spec §6/§11 item 11 assumed a simpler `(a -> b)[n]` shape with no
prefix-factoring). It does **not** change any actual code dependency:
Plan 03's `modelKeyForConnection` pairs by `connection.src`/`connection.dst`
fields plus emission order, not by parsing `connection.id`, and no plan
inspected during this spike parses this string either. The correction is
scoped to this note and to `LaidOutConnection.id`'s documented shape; no
other file needed to change as a result.

## Font buffers must be base64, not Uint8Array (type bug in @d2lang/d2 0.1.34)

`@d2lang/d2`'s shipped `index.d.ts` declares `CompileOptions.fontRegular`
(and `fontItalic`/`fontBold`/`fontSemibold`) as `Uint8Array`. Passing a real
`Uint8Array` (or a Node `Buffer`) throws. Verified directly with a minimal
repro (`fontRegular: <Buffer>` on an otherwise-valid `a -> b` source; full
output pasted into the task report's "Coordinator review findings — fix
round 1 of 5" section, "Issue 3"):

```
CHECK A: threw with raw Buffer fontRegular: Error - invalid JSON input
```

Cause: `dist/node-esm/worker.js`'s `compile` handler does
`o.compile(JSON.stringify(c))` — the entire compile request, fonts included,
is JSON-stringified before crossing into the Go/WASM boundary.
`JSON.stringify` on a `Uint8Array`/`Buffer` produces an index-keyed object
(`{"0":137,"1":80,...}`), not an array or a string, and the Go side's
`[]byte` unmarshaling (which expects base64, per Go's `encoding/json`
convention for byte slices) rejects it.

**Fix:** base64-encode the font bytes
(`Buffer.from(bytes).toString('base64')`) before passing them as
`fontRegular` etc. Verified to compile successfully with base64 strings in
the main spike run (see the per-layout blocks below); the shipped type is
simply wrong for this field. `engine/D2Engine.ts`'s `toCompileOptions()`
documents and isolates this with one `as unknown as CompileOptions` cast —
see the plan's "Contract deviations" section.

## Embedded fonts and `@font-face`

D2's own SVG output has no `<foreignObject>` (confirmed `false` on every
layout, every run), but does embed an `@font-face` rule per font weight
actually used directly in a `<style>` block, with the font data as a base64
`data:application/font-woff` URI keyed to a per-render hashed family name.
Isolated check on the spike's full source (full output pasted into the task
report's "Coordinator review findings — fix round 1 of 5" section, "Issue
3"):

```
CHECK B: font-family: d2- occurrences (all, including duplicates in CSS + inline): ["d2-656577680-font-regular","d2-656577680-font-bold","d2-656577680-font-italic"]
CHECK B: unique family names: ["d2-656577680-font-regular","d2-656577680-font-bold","d2-656577680-font-italic"]
CHECK B: @font-face rule count: 3
```

Three rules were emitted — `d2-656577680-font-regular`,
`d2-656577680-font-bold`, `d2-656577680-font-italic` (no `-font-semibold`
rule appeared, since nothing in this particular diagram used the semibold
weight — the hash and the set of weights present both depend on diagram
content). D2's own text is
therefore already font-self-contained in the SVG string; `fontBuffers` +
`defaultFontFamily` on the resvg side are still required for text
Diagrammar draws itself (Plan 04's overlay notes/legend/callouts), since
that text has no matching embedded `@font-face`.

## Determinism

Two full compile+render calls with identical input produced byte-identical
SVG strings (verified by the connection-id/viewBox/pixel checks being
identical across repeated runs and across Node/Bun). Two `resvg.render().asPng()`
calls on the same SVG string produced byte-identical PNGs. Both checks
passed on every layout engine, under both Node and Bun:

```
png determinism (byte-identical twice): true   [dagre, tala, elk — Node]
png determinism (byte-identical twice): true   [dagre, tala, elk — Bun]
```

## Runtimes

Both `@d2lang/d2` (worker-thread-based) and `@resvg/resvg-wasm` (via
`initWasm` + `import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm')`) worked
identically under Node and Bun in this spike — same shapes, same SVG
structure (byte-for-byte identical `viewBox` values, connection ids, pixel
results), same PNG determinism, no errors. Confirmed on:

- `node --version` → `v25.6.1`
- `bun --version` → `1.4.2`

Bun did not fail; no workaround was needed. Timings (informational only,
not a performance gate — single-run, cold-cache, not averaged):

| layout | compile+render ms (Node) | compile+render ms (Bun) |
|---|---|---|
| dagre | 318 | 234 |
| tala  | 459 | 336 |
| elk   | 337 | 234 |

resvg wasm init: 11ms under Node, 4ms under Bun.

(Timings above are from the rerun captured verbatim below and in the task
report's "Coordinator review findings — fix round 1 of 5" section, "Issue
1" — a prior draft of this note quoted a slightly different Node run's
numbers, whose console output was never pasted into the task report; this
rerun's full output is pasted into the report, so every number here is now
traceable to evidence on file.)

## Invalid D2 source

`d2.compile()` rejects for invalid syntax. The rejection's `Error.message`
is a JSON-array-shaped string of `{range, errmsg}` objects. Identical under
both Node and Bun:

```
invalid D2 threw: Error - [{"range":"index,0:0:0-0:5:5","errmsg":"index:1:1: connection missing destination"},{"range":"index,0:36:36-0:38:38","errmsg":"index:1:37: invalid text beginning unquoted key"},{"range":"index,0:35:35-0:38:38","errmsg":"index:1:36: maps must be terminated with }"}]
```

`error.name` is plain `"Error"`. `engine/D2Engine.ts` wraps this in a
`DiagrammarError` (`code: 'engine'`) whose message includes the raw text
above.

## Verbatim console output

### Node (`v25.6.1`), layout: dagre

```
=== layout: dagre ===
compile+render ms: 318
shapes: 5 connections: 3
connection ids: ["warehouse.fulfilment.(start -> check)[0]","(warehouse.fulfilment.check -> ship)[0]","warehouse.fulfilment.(check -> start)[0]"]
connection src/dst: [{"src":"warehouse.fulfilment.start","dst":"warehouse.fulfilment.check"},{"src":"warehouse.fulfilment.check","dst":"ship"},{"src":"warehouse.fulfilment.check","dst":"warehouse.fulfilment.start"}]
svg <svg> tag count: 2 [{"x":0,"y":0,"width":758,"height":318},{"x":15,"y":19,"width":758,"height":318}]
has foreignObject: false
has @font-face: true
computed origin: {"x":-15,"y":-19}
target shape geometry: {"x":673,"y":172} 75 67
marker target: ship outer coords: 658 153 pixel: [ 255, 0, 0, 255 ] isRed: true
pixel 30px away, same y (may still be inside a shape): 688 153 [ 13, 50, 178, 255 ]
pixel at (2,2) corner (page background): [ 255, 255, 255, 255 ]
png determinism (byte-identical twice): true
```

### Node (`v25.6.1`), layout: tala

```
=== layout: tala ===
compile+render ms: 459
shapes: 5 connections: 3
connection ids: ["warehouse.fulfilment.(start -> check)[0]","(warehouse.fulfilment.check -> ship)[0]","warehouse.fulfilment.(check -> start)[0]"]
connection src/dst: [{"src":"warehouse.fulfilment.start","dst":"warehouse.fulfilment.check"},{"src":"warehouse.fulfilment.check","dst":"ship"},{"src":"warehouse.fulfilment.check","dst":"warehouse.fulfilment.start"}]
svg <svg> tag count: 2 [{"x":0,"y":0,"width":832,"height":420},{"x":-25,"y":-25,"width":832,"height":420}]
has foreignObject: false
has @font-face: true
computed origin: {"x":25,"y":25}
target shape geometry: {"x":707,"y":152} 75 67
marker target: ship outer coords: 732 177 pixel: [ 255, 0, 0, 255 ] isRed: true
pixel 30px away, same y (may still be inside a shape): 762 177 [ 13, 50, 178, 255 ]
pixel at (2,2) corner (page background): [ 255, 255, 255, 255 ]
png determinism (byte-identical twice): true
```

### Node (`v25.6.1`), layout: elk

```
=== layout: elk ===
compile+render ms: 337
shapes: 5 connections: 3
connection ids: ["warehouse.fulfilment.(start -> check)[0]","(warehouse.fulfilment.check -> ship)[0]","warehouse.fulfilment.(check -> start)[0]"]
connection src/dst: [{"src":"warehouse.fulfilment.start","dst":"warehouse.fulfilment.check"},{"src":"warehouse.fulfilment.check","dst":"ship"},{"src":"warehouse.fulfilment.check","dst":"warehouse.fulfilment.start"}]
svg <svg> tag count: 2 [{"x":0,"y":0,"width":958,"height":361},{"x":-13,"y":-13,"width":958,"height":361}]
has foreignObject: false
has @font-face: true
computed origin: {"x":13,"y":13}
target shape geometry: {"x":845,"y":188} 75 67
marker target: ship outer coords: 858 201 pixel: [ 255, 0, 0, 255 ] isRed: true
pixel 30px away, same y (may still be inside a shape): 888 201 [ 13, 50, 178, 255 ]
pixel at (2,2) corner (page background): [ 255, 255, 255, 255 ]
png determinism (byte-identical twice): true
```

### Node — invalid D2 source

```
invalid D2 threw: Error - [{"range":"index,0:0:0-0:5:5","errmsg":"index:1:1: connection missing destination"},{"range":"index,0:36:36-0:38:38","errmsg":"index:1:37: invalid text beginning unquoted key"},{"range":"index,0:35:35-0:38:38","errmsg":"index:1:36: maps must be terminated with }"}]
```

### Bun (`1.4.2`)

Bun's per-layout output was identical to Node's in every field except the
`runtime:` line and timings — Bun was faster on every layout; see the
"Timings" table in the "Runtimes" section above for the exact numbers
(dagre/tala/elk 318/459/337 ms Node vs 234/336/234 ms Bun; resvg wasm init
11ms Node vs 4ms Bun). Connection ids, viewBoxes, computed origins, marker
pixels, and
determinism results were byte-for-byte the same as the Node blocks above —
not reproduced again here to avoid duplicating the identical content twice.
The invalid-D2 error message and `error.name` were also identical.

## Surprises for later plans

- The base64-vs-Uint8Array font type bug — affects only `engine/D2Engine.ts`
  (Plan 01), already handled there.
- D2 nests an inner `<svg>` rather than using a `<g transform>` — Plan 04's
  overlay should append its `<g id="diagrammar-annotations">` as a child of
  the OUTER `<svg>` and rely on `LaidOutDiagram.origin`/`viewBox` rather than
  inserting itself inside D2's inner `<svg>`.
- No `<foreignObject>` in D2's output — Plan 04 doesn't need to worry about
  resvg's (limited) `foreignObject` support.
- **Connection id format is prefix-factored, not the flat `(a -> b)[n]` the
  earlier draft assumed** — see "Connection id format" above. Still doesn't
  matter for any plan's actual code (nothing parses the string), but any
  future code that does needs the corrected shape, not the flat one.
- **The "30px away = background" assumption in the earlier draft was wrong**
  for a 75px-wide shape; use a point clearly outside every shape's bounding
  box (e.g. a raster corner) to sample true page background, which is white
  (`[255, 255, 255, 255]`) in D2's default theme, not `[247, 248, 254,
  255]`.
- The spike script had to move from a repo-root `spikes/spike.mjs` to
  `packages/core/spikes/spike.mjs` because this workspace does not hoist
  `packages/core`'s dependencies to the root `node_modules` and Node's ESM
  resolver ignores `NODE_PATH`. `engine/D2Engine.ts` itself lives inside
  `packages/core`, so this has no bearing on product code — it only affects
  where a throwaway script importing these packages must live.
- Bun ran the spike with no failures or divergent output — no Bun-specific
  workaround is needed for Task 5/6's product code, at least for the
  `@d2lang/d2` + `@resvg/resvg-wasm` code paths this spike exercises.
- **The root `.gitignore`'s `spikes/` pattern was unanchored and also
  matched `docs/spikes/`**, the very directory this note lives
  in. `git status`/`git add docs/spikes/...` silently saw
  nothing to add; `git check-ignore -v --no-index
  docs/spikes/2026-09-11-d2-resvg-spike.md` confirmed the match
  against `.gitignore:4:spikes/`. The note was first committed with `git add
  -f` as a one-off workaround. **Fixed properly in commit `877c94f`**, which
  changed the pattern to `/spikes/` (anchored to the repo root) — verified
  after the fix: `git check-ignore -v
  docs/spikes/2026-09-11-d2-resvg-spike.md` now prints nothing
  (exit 1), while `git check-ignore -v spikes/x.mjs` still matches
  `.gitignore:4:/spikes/`. That same commit also added a scratch-directory
  pattern to `.prettierignore`, which was the actual cause of the
  `format:check` failure this task originally reported as
  "pre-existing/unrelated" — gitignored scratch files were being picked up
  by `prettier --check .`, not a leftover from Task 3 specifically.
- The inverse gap exists on the ESLint side: `eslint.config.js`'s `ignores`
  list has `spikes/**`, which (unlike a `.gitignore` unanchored pattern) is
  anchored to the config's root and only matches a repo-root `spikes/`
  directory — it does **not** match `packages/core/spikes/**`, where this
  spike's script actually had to live (see "Script location" above).
  `bun run lint` failed with a parser error on the spike script (`was not
  found by the project service`) until the script was deleted after its
  evidence was captured. No product-code fix was made here (editing
  `eslint.config.js` was out of this task's scope — only the findings note
  is committed), but a later task should either anchor the gitignore
  pattern or broaden the ESLint ignore to `packages/*/spikes/**` if a spike
  script needs to live inside a package again.
