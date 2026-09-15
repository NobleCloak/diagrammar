# @noblecloak/diagrammar-mcp

## 0.3.0

### Minor Changes

- c9dd949: New `serveStdio(config)` runs the same tools and resources over stdio for
  clients that spawn the server themselves. `buildContext` and `buildServer`
  are exported so other transports can reuse the registered server.

### Patch Changes

- 0fefae6: The MCP server now reports its real package version in the `initialize`
  handshake (it was hardcoded to 0.1.0). `SERVER_VERSION` is exported.
- @noblecloak/diagrammar-core@0.3.0
  - @noblecloak/diagrammar-icons-lucide@0.1.1
  - @noblecloak/diagrammar-icons-simple-icons@0.1.1

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

### Patch Changes

- Updated dependencies [372f72d]
- Updated dependencies [372f72d]
- Updated dependencies [372f72d]
- Updated dependencies [704b134]
  - @noblecloak/diagrammar-icons-lucide@0.1.0
  - @noblecloak/diagrammar-icons-simple-icons@0.1.0
  - @noblecloak/diagrammar-core@0.2.0

## 0.1.1

### Patch Changes

- f8c77f3: Releases are now published from CI via npm trusted publishing (OIDC) with provenance attestations. No package code changes.
- Updated dependencies [f8c77f3]
  - @noblecloak/diagrammar-core@0.1.1

## 0.1.0

### Minor Changes

- 6344a1e: Initial public release: YAML diagram schema and parser, typed edit ops and JSON Patch, D2 + resvg rendering to SVG/PNG with the annotation overlay, Markdown walkthroughs, the Streamable HTTP MCP server, and the `diagrammar` CLI.

### Patch Changes

- Updated dependencies [6344a1e]
  - @noblecloak/diagrammar-core@0.1.0
