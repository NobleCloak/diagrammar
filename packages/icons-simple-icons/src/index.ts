import { fileURLToPath } from 'node:url';
import { openIconSetDir, type IconSet } from '@noblecloak/diagrammar-core';

/**
 * `..` from either `src/index.ts` or `dist/index.mjs` is the package root,
 * where the generated `index.json` + `icons.json.gz` live.
 */
const packageDir = fileURLToPath(new URL('..', import.meta.url));

/**
 * Simple Icons (CC0-1.0) — `icon: simple-icons/<slug>`; brand marks stay
 * their owners' property, see NOTICE.md; contains no Amazon/AWS marks.
 */
export const simpleIcons: IconSet = openIconSetDir(packageDir);
export default simpleIcons;
