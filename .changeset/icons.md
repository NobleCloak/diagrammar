---
'@noblecloak/diagrammar-core': minor
'@noblecloak/diagrammar-mcp': minor
'@noblecloak/diagrammar': minor
---

Icons: nodes, groups and participants accept `icon: <set>/<name>` (from an
installed icon set) or a relative `.svg` path, embedded inline for offline,
deterministic renders; `shape: image` makes the icon the node. Core gains the
`IconRegistry`/`IconSet` contracts, an SVG sanitizer, `resolveIcons` and
`checkIconRefs`; `render()` takes `icons`. The MCP server bundles the Lucide and
Simple Icons sets, adds `diagrammar_icons` (search/list), and validates icons.
The CLI adds `icons search`, `icons sets`, `icons import aws <zip>`, and a
repeatable `--icons <dir>` on `render`, `validate` and `mcp`.
