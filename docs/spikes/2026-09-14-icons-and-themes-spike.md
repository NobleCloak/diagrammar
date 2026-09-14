# Spike: inline icons and theme overrides through D2 WASM + resvg

Date: 2026-09-14
Versions: `@d2lang/d2` 0.1.34 (D2 v0.9.0), `@resvg/resvg-wasm` 2.6.2, Node v25.6.1

## Summary

Both features the themes-and-icons design depends on work on the pinned
toolchain with no network access and no change to the render pipeline's
determinism story:

1. **Inline SVG icons.** `icon: "data:image/svg+xml;base64,..."` compiles,
   D2 emits one `<image href="data:image/svg+xml;base64,...">` per icon, and
   resvg paints it into the PNG. Verified for both an icon inside a
   `rectangle` and `shape: image` (icon-as-node). The D2 WASM binary also
   carries a regex for `href="data:image/svg+xml;base64,..."`, i.e. inlined
   SVG icons are a first-class path in the renderer, not an accident.
2. **Theme overrides.** A `vars: { d2-config: { theme-overrides: { ... } } }`
   block in the D2 source changes the output palette in WASM exactly as in the
   CLI. `themeID` values other than 0/200 also work (8 "Colorblind clear" and
   1 "Neutral grey" were exercised), and `sketch: true` renders.

## Findings that shape the design

- **The data URI must be quoted.** Unquoted, D2 parses `icon: data:image/...`
  as a nested key and fails with the misleading
  `image shapes cannot have children`. `compile/style.ts`'s `d2String()`
  already does the right quoting.
- **Slot mapping observed on theme 0** (`a -> b`, dagre): output fills were
  `#FFFFFF` (background), `#F7F8FE` (node fill), `#0A0F25` (label text),
  `#0D32B2` (stroke). Overriding `B6`, `N1`, `B1` moved node fill, text and
  stroke respectively; `B2` did not appear in this minimal diagram. The
  full slot table (group fill, edge stroke, edge label) is left to the
  implementation plan's first task — this spike only pins the four slots
  above.
- **Cost.** compile+render of a two-node diagram with two ~200-byte icons:
  ~240 ms cold, 6 KB SVG, 4 KB PNG. Icon bytes go through the same
  JSON-stringified bridge as fonts, so large icon sets should be embedded
  per referenced icon, never as a whole set.
- **No remote hrefs** appeared in the SVG, so a diagram that only uses
  inline icons keeps the "no network, byte-identical output" guarantee.

## Slot map (second probe, same day)

One tiny diagram per case, `themeID: 0`, one slot overridden to `#ABCDEF` at
a time; a row lists every slot whose override showed up in the output.

```
rectangle@1       N1 text  N7 background  B1 stroke  B6 fill
oval@1            N1       N7             B1         B6 fill
diamond@1         N1       N7             B1         (no fill slot)
document@1        N1       N7             B1         AB4 fill
parallelogram@1   N1       N7             B1         (no fill slot)
hexagon@1         N1       N7             B1         (no fill slot)
cylinder@1        N1       N7             B1         AA4 fill
queue@1           N1       N7             B1         (no fill slot)
cloud@1           N1       N7 (also cloud body)  B1  (no fill slot)
person@1          N1       N7             B1         B3 fill
package@1         N1       N7             B1         AA4 fill
rectangle@2       container B4, node B5
rectangle@3       containers B4/B5, node B6
cylinder@2        container B4, node AA5
edge + label      N1 + N2 label text, B1 line + arrowhead, B6 endpoint fill
```

`themeID: 200` gives the identical slot assignment. Conclusion: only `N7`,
`N1` and `N2` are usable as palette overrides; fills and strokes must be
emitted as explicit `style.*` lines per element (spec §4.2 was amended).

## What was not tested

- Icons on sequence-diagram participants (D2 actors). The design includes
  them provisionally; the plan's spike task must confirm.
- `theme-overrides` on a dark base (`themeID: 200`).
- Icons larger than a few hundred bytes (the sanitizer cap in the design is
  256 KB and should be exercised in the engine test).

## Reproduction

The probe scripts were run from `packages/core/` so `@d2lang/d2` and
`@resvg/resvg-wasm` resolve from the workspace; they were throwaway and are
not committed. The engine tests added by the implementation plan replace
them.
