# Bundled fonts

Source Sans 3 (SIL Open Font License 1.1), used for every D2 render and PNG
rasterization so output is byte-identical regardless of the fonts installed on
the machine running Diagrammar.

- Upstream: https://github.com/adobe-fonts/source-sans
- Release used: `3.052R` (https://github.com/adobe-fonts/source-sans/releases/tag/3.052R)
- Files taken from that release's `TTF-source-sans-3.052R.zip` asset, `TTF/` folder:
  - `SourceSans3-Regular.ttf`
  - `SourceSans3-It.ttf`
  - `SourceSans3-Bold.ttf`
  - `SourceSans3-Semibold.ttf`
- License text: `OFL.txt` in this directory, copied verbatim from `LICENSE.md`
  at the `3.052R` tag.

To update to a newer release: repeat the download above with the new tag,
replace all four `.ttf` files and `OFL.txt`, update this file's release tag,
and re-run `bun run test` — `packages/core/src/engine/fonts.test.ts` will fail
loudly if the new release changes the parsed family name away from
`Source Sans 3`.
