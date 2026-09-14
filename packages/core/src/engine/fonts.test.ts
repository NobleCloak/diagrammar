import { describe, expect, it } from 'vitest';
import opentype from 'opentype.js';
import { FONT_FAMILY, loadFonts } from './fonts.js';
import type { FontSet } from './fonts.js';

function toArrayBuffer(bytes: Uint8Array): ArrayBufferLike {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/**
 * The Semibold TTF's legacy nameID 1 (opentype.js's "fontFamily") reports
 * "Source Sans 3 Semibold"; its nameID 16 (opentype.js's "preferredFamily",
 * the OpenType 1.3+ typographic family) reports "Source Sans 3" like the
 * other three weights. Prefer the typographic family when present, exactly
 * as a real font-matching consumer (resvg, browsers) would.
 */
function effectiveFamily(bytes: Uint8Array): string | undefined {
  const font = opentype.parse(toArrayBuffer(bytes));
  return font.getEnglishName('preferredFamily') ?? font.getEnglishName('fontFamily');
}

describe('loadFonts', () => {
  it('loads all four TTF weights as non-empty buffers', async () => {
    const fonts = await loadFonts();
    expect(fonts.regular.byteLength).toBeGreaterThan(0);
    expect(fonts.italic.byteLength).toBeGreaterThan(0);
    expect(fonts.bold.byteLength).toBeGreaterThan(0);
    expect(fonts.semibold.byteLength).toBeGreaterThan(0);
  });

  it('caches the result across calls', async () => {
    const first = await loadFonts();
    const second = await loadFonts();
    expect(second).toBe(first);
  });

  it.each<[keyof FontSet]>([['regular'], ['italic'], ['bold'], ['semibold']])(
    'reports FONT_FAMILY as the effective parsed family name for the %s weight',
    async (key) => {
      const fonts = await loadFonts();
      expect(effectiveFamily(fonts[key])).toBe(FONT_FAMILY);
    },
  );
});
