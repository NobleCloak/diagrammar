import type { LegendEntry, ThemeTokens } from './types.js';
import type { TextMetrics } from './text.js';
import { lineHeight } from './text.js';
import { escapeXml } from './svg.js';
import { FONT_FAMILY } from '../engine/fonts.js';
import { LEGEND_FONT_SIZE, MIN_LEGEND_WIDTH } from './geometry.js';

const LEGEND_PADDING = 8;

export function renderLegend(
  entries: LegendEntry[],
  width: number,
  tokens: ThemeTokens,
  measure: TextMetrics,
): { markup: string; height: number } {
  if (entries.length === 0) {
    return { markup: '', height: 0 };
  }
  const lh = lineHeight(LEGEND_FONT_SIZE);
  // Clamp to MIN_LEGEND_WIDTH (M8): a narrow diagram must not force the
  // legend to wrap every word onto its own line.
  const innerWidth = Math.max(width - 2 * LEGEND_PADDING, MIN_LEGEND_WIDTH);
  let y = LEGEND_PADDING;
  const textLines: { text: string; y: number }[] = [];
  for (const entry of entries) {
    const prefixed = `${entry.number}. ${entry.text}`;
    const wrapped = measure.wrap(prefixed, innerWidth, LEGEND_FONT_SIZE);
    for (const line of wrapped) {
      y += lh;
      textLines.push({ text: line, y });
    }
  }
  const height = y + LEGEND_PADDING;
  const textMarkup = textLines
    .map(
      (l) =>
        `<text x="${LEGEND_PADDING}" y="${l.y}" font-family="${FONT_FAMILY}" font-size="${LEGEND_FONT_SIZE}" fill="${tokens.legendText}">${escapeXml(l.text)}</text>`,
    )
    .join('');
  return { markup: `<g class="dg-legend">${textMarkup}</g>`, height };
}
