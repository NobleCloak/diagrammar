# @noblecloak/diagrammar-core

Schema-first diagram library: parse and validate a Diagrammar YAML document,
compile it to D2, and render deterministic SVG/PNG plus an optional Markdown
walkthrough — in-process, no Graphviz or browser required.

Install: `bun add @noblecloak/diagrammar-core` (or `npm install @noblecloak/diagrammar-core`)

This package is ESM-only (`"type": "module"`, `.mjs` builds) — there is no
CommonJS `require` entry point. It also locates its bundled Source Sans 3 font
files by walking up from `import.meta.url` to find its own `package.json`
(`src/engine/fonts.ts`), and resolves the `@resvg/resvg-wasm` binary at
runtime via `import.meta.resolve`; both assume the package remains on disk in
its normal, unbundled npm layout, so bundling `@noblecloak/diagrammar-core` into a
single-file application bundle can break asset loading at runtime — keep it as
an external dependency instead (with most bundlers: mark it `external`).

See the [root README](https://github.com/NobleCloak/diagrammar#readme) for the
full YAML format, API reference, and examples.
