import { describe, it, expect, vi } from 'vitest';
import * as fontsModule from '../engine/fonts.js';
import { lineHeight, measure, wrap } from './text.js';

describe('getFont retry after a failed load', () => {
  it('does not poison the module-level font cache: a rejected loadFonts() leaves the next call able to succeed', async () => {
    // Must run before any other test in this file has populated text.ts's
    // module-level `cachedFont` — once that is set, getFont() never calls
    // loadFonts() again, and this spy would never be exercised.
    const spy = vi
      .spyOn(fontsModule, 'loadFonts')
      .mockRejectedValueOnce(new Error('simulated transient font read failure'));
    await expect(measure('x', 16)).rejects.toThrow('simulated transient font read failure');
    // The spy's queued rejection is consumed; this call falls through to the
    // real loadFonts() implementation and must succeed.
    await expect(measure('Hello', 16)).resolves.toBeGreaterThan(0);
    spy.mockRestore();
  });
});

describe('lineHeight', () => {
  it('scales font size by 1.3', () => {
    expect(lineHeight(12)).toBeCloseTo(15.6, 5);
    expect(lineHeight(20)).toBeCloseTo(26, 5);
  });
});

describe('measure', () => {
  it('measures a known string within +/-1px of the value pinned against the bundled font', async () => {
    // Pinned against packages/core/fonts/SourceSans3-Regular.ttf; if the bundled
    // font file ever changes, re-derive this constant by logging measure('Hello', 16)
    // once and updating the literal below.
    const PINNED_WIDTH_HELLO_16PX = 35.2;
    const width = await measure('Hello', 16);
    expect(width).toBeGreaterThan(PINNED_WIDTH_HELLO_16PX - 1);
    expect(width).toBeLessThan(PINNED_WIDTH_HELLO_16PX + 1);
  });
});

describe('wrap', () => {
  it('greedily wraps at word boundaries', async () => {
    // Derived from the LONGER of the two expected lines (not the shorter 'one two'):
    // Source Sans 3 is proportional, so 'three four' (66.336px) is wider than 'one two'
    // (54.144px) — a maxWidth sized to the shorter line would hard-wrap 'three four' too.
    const maxWidth = await measure('three four', 16);
    const lines = await wrap('one two three four', maxWidth, 16);
    expect(lines).toEqual(['one two', 'three four']);
  });

  it('hard-breaks a single word longer than maxWidth', async () => {
    const charWidth = await measure('m', 16);
    const maxWidth = charWidth * 3;
    const lines = await wrap('mmmmmmmmmm', maxWidth, 16);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('mmmmmmmmmm');
    for (const line of lines) {
      const w = await measure(line, 16);
      expect(w).toBeLessThanOrEqual(maxWidth + 0.01);
    }
  });

  it('preserves explicit newlines as paragraph breaks', async () => {
    const wide = await measure('one two three four five', 16);
    const lines = await wrap('one two\nthree four', wide, 16);
    expect(lines).toEqual(['one two', 'three four']);
  });
});
