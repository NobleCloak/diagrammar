import { fileURLToPath } from 'node:url';
import { openIconSetDir, type IconSet } from '@noblecloak/diagrammar-core';

/**
 * `..` from either `src/index.ts` or `dist/index.mjs` is the package root,
 * where the generated `index.json` + `icons.json.gz` live.
 */
const packageDir = fileURLToPath(new URL('..', import.meta.url));

/** Lucide (ISC) — `icon: lucide/<name>`, names as in lucide.dev. */
export const lucide: IconSet = openIconSetDir(packageDir);
export default lucide;
