import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface FontSet {
  regular: Uint8Array;
  italic: Uint8Array;
  bold: Uint8Array;
  semibold: Uint8Array;
}

/**
 * Exact family name reported by the bundled TTFs' name table (nameID 1 for
 * three of the four weights, nameID 16 for Semibold — see
 * packages/core/src/engine/fonts.test.ts). Used as resvg's
 * `defaultFontFamily` so text we draw ourselves (not D2's own, which embeds
 * its own @font-face) matches the bundled font.
 */
export const FONT_FAMILY = 'Source Sans 3';

/**
 * Walks up from `startFile` to find the directory containing this package's
 * own `package.json`. Used instead of a fixed `../fonts/`-style relative
 * path from `import.meta.url` because that depth differs between running
 * from source (`src/engine/fonts.ts`, two directories below the package
 * root) and running from the built, single-file bundle
 * (`dist/index.mjs`, one directory below the package root) — this walk
 * gives the same, correct answer in both cases without depending on
 * tsdown's exact bundling shape.
 * @internal Exported for unit tests only; not part of the public API.
 */
export function findPackageRoot(startFile: string): string {
  let dir = path.dirname(startFile);
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate package.json above ${startFile}`);
    }
    dir = parent;
  }
}

const PACKAGE_ROOT = findPackageRoot(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(PACKAGE_ROOT, 'fonts');

function readFontFile(fileName: string): Promise<Uint8Array> {
  return readFile(path.join(FONTS_DIR, fileName));
}

let cached: Promise<FontSet> | undefined;

/** Loads the bundled Source Sans 3 TTFs once per process. Safe to call repeatedly. */
export function loadFonts(): Promise<FontSet> {
  cached ??= (async () => {
    const [regular, italic, bold, semibold] = await Promise.all([
      readFontFile('SourceSans3-Regular.ttf'),
      readFontFile('SourceSans3-It.ttf'),
      readFontFile('SourceSans3-Bold.ttf'),
      readFontFile('SourceSans3-Semibold.ttf'),
    ]);
    return { regular, italic, bold, semibold };
  })().catch((error: unknown) => {
    // Reset the cache on failure so a transient read error is retryable
    // instead of permanently poisoning every later loadFonts() call with
    // the same rejected promise.
    cached = undefined;
    throw error;
  });
  return cached;
}
