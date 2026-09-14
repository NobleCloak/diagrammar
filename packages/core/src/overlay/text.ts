import opentype, { type Font } from 'opentype.js';
import { loadFonts } from '../engine/fonts.js';

/**
 * Synchronous text-measurement helpers bound to the bundled font, returned
 * by {@link loadTextMetrics} once the font has been loaded. Prefer this over
 * the standalone {@link measure}/{@link wrap} functions when measuring many
 * strings, since it avoids re-awaiting the (cached, but still async) font
 * load on every call.
 */
export interface TextMetrics {
  /** Advance width, in px, of `text` set at `fontSize` in the bundled font. */
  measure(text: string, fontSize: number): number;
  /**
   * Greedily wraps `text` at word boundaries so no line exceeds `maxWidth`
   * px at `fontSize`; explicit `\n` characters are preserved as paragraph
   * breaks. A single word wider than `maxWidth` is hard-broken character by
   * character.
   */
  wrap(text: string, maxWidth: number, fontSize: number): string[];
}

let cachedFont: Font | undefined;

function toArrayBuffer(bytes: Uint8Array): ArrayBufferLike {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

/**
 * Loads and parses the bundled regular-weight font once per process.
 * `cachedFont` is only assigned after `loadFonts()` and `opentype.parse`
 * both succeed, so a rejected `loadFonts()` call leaves it `undefined` and
 * the next call retries from scratch instead of being poisoned by the
 * earlier failure.
 */
async function getFont(): Promise<Font> {
  if (cachedFont === undefined) {
    const fonts = await loadFonts();
    cachedFont = opentype.parse(toArrayBuffer(fonts.regular));
  }
  return cachedFont;
}

/** Line height, in px, for text set at `fontSize` (spec: 1.3x font size). */
export function lineHeight(fontSize: number): number {
  return fontSize * 1.3;
}

function wrapWithFont(font: Font, text: string, maxWidth: number, fontSize: number): string[] {
  const widthOf = (s: string): number => font.getAdvanceWidth(s, fontSize);
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (widthOf(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current.length > 0) {
        lines.push(current);
      }
      if (widthOf(word) > maxWidth) {
        let piece = '';
        for (const ch of word) {
          const next = piece + ch;
          if (widthOf(next) > maxWidth && piece.length > 0) {
            lines.push(piece);
            piece = ch;
          } else {
            piece = next;
          }
        }
        current = piece;
      } else {
        current = word;
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }
  }
  return lines;
}

/**
 * Loads the bundled font (once per process, via {@link loadFonts}'s own
 * cache) and returns a bound {@link TextMetrics}. A rejected load is not
 * cached — see `getFont` above — so a transient failure here is retryable
 * on the next call.
 */
export async function loadTextMetrics(): Promise<TextMetrics> {
  const font = await getFont();
  return {
    measure: (text, fontSize) => font.getAdvanceWidth(text, fontSize),
    wrap: (text, maxWidth, fontSize) => wrapWithFont(font, text, maxWidth, fontSize),
  };
}

/** One-shot convenience wrapper around {@link TextMetrics.measure}. */
export async function measure(text: string, fontSize: number): Promise<number> {
  const font = await getFont();
  return font.getAdvanceWidth(text, fontSize);
}

/** One-shot convenience wrapper around {@link TextMetrics.wrap}. */
export async function wrap(text: string, maxWidth: number, fontSize: number): Promise<string[]> {
  const font = await getFont();
  return wrapWithFont(font, text, maxWidth, fontSize);
}
