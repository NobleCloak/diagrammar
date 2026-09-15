# @noblecloak/diagrammar-core

## 0.2.0

### Minor Changes

- 372f72d: Icons: nodes, groups and participants accept `icon: <set>/<name>` (from an
  installed icon set) or a relative `.svg` path, embedded inline for offline,
  deterministic renders; `shape: image` makes the icon the node. Core gains the
  `IconRegistry`/`IconSet` contracts, an SVG sanitizer, `resolveIcons` and
  `checkIconRefs`; `render()` takes `icons`. The MCP server bundles the Lucide and
  Simple Icons sets, adds `diagrammar_icons` (search/list), and validates icons.
  The CLI adds `icons search`, `icons sets`, `icons import aws <zip>`, and a
  repeatable `--icons <dir>` on `render`, `validate` and `mcp`.
- 704b134: Themes: `theme:` now accepts the presets `light`, `dark`, `colorblind`, `mono`
  or a relative path to a reusable theme file (`diagrammar-theme: 1`) carrying a
  palette and per-kind style defaults. `render()` gains `resolver` (see
  `fileResolver`) for path-form themes; the CLI resolves them beside the
  diagram and the MCP server inside its root jail. New: `diagrammar themes
list`, `diagrammar_schema { kind: "theme" }`, `diagrammar://schema/theme-v1`,
  `checkThemeRef`. The `Theme` type widens from `'light' | 'dark'` to `string`.

## 0.1.1

### Patch Changes

- f8c77f3: Releases are now published from CI via npm trusted publishing (OIDC) with provenance attestations. No package code changes.

## 0.1.0

### Minor Changes

- 6344a1e: Initial public release: YAML diagram schema and parser, typed edit ops and JSON Patch, D2 + resvg rendering to SVG/PNG with the annotation overlay, Markdown walkthroughs, the Streamable HTTP MCP server, and the `diagrammar` CLI.
