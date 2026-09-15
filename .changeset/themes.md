---
'@noblecloak/diagrammar-core': minor
'@noblecloak/diagrammar-mcp': minor
'@noblecloak/diagrammar': minor
---

Themes: `theme:` now accepts the presets `light`, `dark`, `colorblind`, `mono`
or a relative path to a reusable theme file (`diagrammar-theme: 1`) carrying a
palette and per-kind style defaults. `render()` gains `resolver` (see
`fileResolver`) for path-form themes; the CLI resolves them beside the
diagram and the MCP server inside its root jail. New: `diagrammar themes
list`, `diagrammar_schema { kind: "theme" }`, `diagrammar://schema/theme-v1`,
`checkThemeRef`. The `Theme` type widens from `'light' | 'dark'` to `string`.
