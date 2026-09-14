import { describe, it, expect } from 'vitest';
import type { TextMetrics } from './text.js';
import type { ThemeTokens } from './types.js';
import { FONT_FAMILY } from '../engine/fonts.js';
import { renderLegend } from './legend.js';

const tokens: ThemeTokens = {
  accent: '#0D5FBA',
  badgeText: '#FFFFFF',
  noteFill: '#FFF8C5',
  noteStroke: '#E3C55B',
  noteText: '#1F1F1F',
  legendText: '#1F1F1F',
  leader: '#8A8A8A',
  canvas: '#FFFFFF',
};

const noWrapMetrics: TextMetrics = {
  measure: (text) => text.length * 6,
  wrap: (text) => [text],
};

describe('renderLegend', () => {
  it('renders nothing for an empty entry list', () => {
    expect(renderLegend([], 300, tokens, noWrapMetrics)).toEqual({ markup: '', height: 0 });
  });

  it('renders one text line per entry, numbered', () => {
    const result = renderLegend(
      [
        { number: 1, text: 'first' },
        { number: 2, text: 'second' },
      ],
      300,
      tokens,
      noWrapMetrics,
    );
    expect(result.markup).toContain('1. first');
    expect(result.markup).toContain('2. second');
    expect(result.markup).toContain(`fill="${tokens.legendText}"`);
    expect(result.markup).toContain(`font-family="${FONT_FAMILY}"`);
    expect(result.height).toBeGreaterThan(0);
  });
});

describe('renderLegend — wrapping', () => {
  it('wraps a long entry to multiple lines using the supplied measure', () => {
    const wrappingMetrics: TextMetrics = {
      measure: (text) => text.length * 6,
      wrap: (text, _maxWidth) => {
        // split into two roughly-equal halves regardless of content, to prove
        // renderLegend passes maxWidth through and renders every returned line
        const mid = Math.ceil(text.length / 2);
        return [text.slice(0, mid), text.slice(mid)];
      },
    };
    const result = renderLegend(
      [{ number: 1, text: 'a very long legend entry that wraps' }],
      100,
      tokens,
      wrappingMetrics,
    );
    const textTagCount = (result.markup.match(/<text/g) ?? []).length;
    expect(textTagCount).toBe(2);
  });

  it('clamps the wrap width to MIN_LEGEND_WIDTH for a very narrow diagram', () => {
    let capturedMaxWidth = -1;
    const capturingMetrics: TextMetrics = {
      measure: (text) => text.length * 6,
      wrap: (text, maxWidth) => {
        capturedMaxWidth = maxWidth;
        return [text];
      },
    };
    // width=10 -> raw innerWidth would be 10 - 2*8 = -6; clamped to 120.
    renderLegend([{ number: 1, text: 'x' }], 10, tokens, capturingMetrics);
    expect(capturedMaxWidth).toBe(120);
  });
});
