import type { Diagram } from '../model/types.js';
import type { LaidOutDiagram } from '../engine/types.js';
import type { OverlayOptions, OverlayResult, KeyMap, Badge, PlacedNote, Box } from './types.js';
import {
  union,
  expand,
  BADGE_RADIUS,
  CANVAS_PAD,
  NOTE_PADDING,
  NOTE_RADIUS,
  BADGE_FONT_SIZE,
  NOTE_FONT_SIZE,
} from './geometry.js';
import { tokensFor } from './theme.js';
import { escapeXml, parseViewBox, setViewBox, insertGroup, prependToOuterSvg } from './svg.js';
import { loadTextMetrics, lineHeight } from './text.js';
import { FONT_FAMILY } from '../engine/fonts.js';
import { placeCallouts } from './callouts.js';
import { placeNotes } from './notes.js';
import { renderLegend } from './legend.js';
import { buildSidecar, stampAll } from './stamp.js';

// SVG text baselines sit on the text's bottom edge, not its vertical center,
// so both badge and note text need a small manual nudge to look centered /
// aligned against the shapes drawn around them (hand-tuned against real
// renders, not derived from font metrics).
/** Nudges a badge's number down from its circle's mathematical center so it looks vertically centered. */
const BADGE_BASELINE_OFFSET = 4;
/** Nudges each note text line up off the bottom of its line-height box so the first line clears the top padding. */
const NOTE_BASELINE_OFFSET = -3;

function renderBadge(badge: Badge, tokens: ReturnType<typeof tokensFor>): string {
  const title = badge.text ?? `Callout ${badge.number}`;
  return (
    `<g id="${badge.id}" data-dg-id="${escapeXml(badge.key)}" data-dg-kind="callout">` +
    `<title>${escapeXml(title)}</title>` +
    `<circle cx="${badge.center.x}" cy="${badge.center.y}" r="${BADGE_RADIUS}" fill="${tokens.accent}" />` +
    `<text x="${badge.center.x}" y="${badge.center.y + BADGE_BASELINE_OFFSET}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${BADGE_FONT_SIZE}" fill="${tokens.badgeText}">${badge.number}</text>` +
    `</g>`
  );
}

function renderNote(note: PlacedNote, tokens: ReturnType<typeof tokensFor>): string {
  const leader =
    note.leaderFrom !== undefined && note.leaderTo !== undefined
      ? `<line x1="${note.leaderFrom.x}" y1="${note.leaderFrom.y}" x2="${note.leaderTo.x}" y2="${note.leaderTo.y}" stroke="${tokens.leader}" stroke-dasharray="4 3" />`
      : '';
  const lh = lineHeight(NOTE_FONT_SIZE);
  const textLines = note.lines
    .map(
      (line, i) =>
        `<text x="${note.box.x + NOTE_PADDING}" y="${note.box.y + NOTE_PADDING + lh * (i + 1) + NOTE_BASELINE_OFFSET}" font-family="${FONT_FAMILY}" font-size="${NOTE_FONT_SIZE}" fill="${tokens.noteText}">${escapeXml(line)}</text>`,
    )
    .join('');
  return (
    `<g id="${note.id}" data-dg-id="${escapeXml(note.key)}" data-dg-kind="note">` +
    `<title>${escapeXml(note.lines.join(' '))}</title>` +
    leader +
    `<rect x="${note.box.x}" y="${note.box.y}" width="${note.box.width}" height="${note.box.height}" rx="${NOTE_RADIUS}" fill="${tokens.noteFill}" stroke="${tokens.noteStroke}" />` +
    textLines +
    `</g>`
  );
}

export async function applyOverlay(
  svg: string,
  laidOut: LaidOutDiagram,
  model: Diagram,
  keyMap: KeyMap,
  opts: OverlayOptions,
): Promise<OverlayResult> {
  const tokens = tokensFor(opts.theme);
  const metrics = await loadTextMetrics();

  const {
    badges,
    legend,
    warnings: calloutWarnings,
  } = placeCallouts(model, laidOut, keyMap, opts.view);
  const { notes, warnings: noteWarnings } = placeNotes(model, laidOut, keyMap, opts.view, metrics);

  const diagramBox = parseViewBox(svg);
  const showLegend = opts.legend;
  const { markup: legendMarkup, height: legendHeight } = showLegend
    ? renderLegend(legend, diagramBox.width, tokens, metrics)
    : { markup: '', height: 0 };

  const visibleBadges = badges.filter((b) => !b.hidden);
  const visibleNotes = notes.filter((n) => !n.hidden);

  const badgeMarkup = visibleBadges.map((b) => renderBadge(b, tokens)).join('');
  const noteMarkup = visibleNotes.map((n) => renderNote(n, tokens)).join('');

  const legendY = diagramBox.y + diagramBox.height + CANVAS_PAD;
  const legendGroup =
    legendMarkup !== ''
      ? `<g class="dg-legend-group" transform="translate(${diagramBox.x}, ${legendY})">${legendMarkup}</g>`
      : '';

  const noteBoxes = visibleNotes.map((n) => n.box);
  const badgeBoxes = visibleBadges.map((b) => ({
    x: b.center.x - BADGE_RADIUS,
    y: b.center.y - BADGE_RADIUS,
    width: 2 * BADGE_RADIUS,
    height: 2 * BADGE_RADIUS,
  }));
  const legendBoxes: Box[] =
    legendMarkup !== ''
      ? [{ x: diagramBox.x, y: legendY, width: diagramBox.width, height: legendHeight }]
      : [];
  const extraBoxes = [...noteBoxes, ...badgeBoxes, ...legendBoxes];

  // Only grow the canvas when there is actually something drawn outside the
  // original viewBox — a diagram with no visible callouts/notes/legend must
  // come back with an unchanged viewBox (spec ruling), not padded by
  // CANVAS_PAD for nothing.
  const canvasGrew = extraBoxes.length > 0;
  const grownBox = canvasGrew ? expand(union([diagramBox, ...extraBoxes]), CANVAS_PAD) : diagramBox;

  const groupMarkup = `<g id="diagrammar-annotations">${badgeMarkup}${noteMarkup}${legendGroup}</g>`;
  let outSvg = insertGroup(svg, groupMarkup);
  // Spec §5.5: "The grown canvas is filled with the theme's canvas colour."
  // Painted before D2's own content (prependToOuterSvg inserts right after
  // the outer <svg> open tag) so D2's own background rect — drawn later in
  // the document — stays on top of it rather than covering it.
  if (canvasGrew) {
    outSvg = prependToOuterSvg(
      outSvg,
      `<rect x="${grownBox.x}" y="${grownBox.y}" width="${grownBox.width}" height="${grownBox.height}" fill="${tokens.canvas}"/>`,
    );
  }
  outSvg = setViewBox(outSvg, grownBox);
  outSvg = stampAll(outSvg, laidOut, model, keyMap);

  const layout = buildSidecar(model, laidOut, keyMap, badges, notes);

  return {
    svg: outSvg,
    layout,
    warnings: [...calloutWarnings, ...noteWarnings],
  };
}

export type { LayoutSidecar, LayoutEntry, KeyMap, OverlayOptions, OverlayResult } from './types.js';
