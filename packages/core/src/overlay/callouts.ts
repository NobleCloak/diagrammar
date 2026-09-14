import type { Diagram } from '../model/types.js';
import type { LaidOutDiagram, LaidOutConnection } from '../engine/types.js';
import type { Warning } from '../errors.js';
import type { Box, Point, Badge, LegendEntry, KeyMap } from './types.js';
import {
  bboxOf,
  polylineMidpointSegment,
  stackHorizontal,
  BADGE_RADIUS,
  BADGE_GAP,
} from './geometry.js';

// Spec §5.2: "badge offset from the route midpoint by badge radius + 4px,
// clear of D2's own edge label."
const BADGE_CLEARANCE = BADGE_RADIUS + BADGE_GAP;

/**
 * Anchors an edge/message callout badge at the route's midpoint, offset
 * straight down so it doesn't sit on top of D2's own edge/message label
 * (spec §5.2).
 *
 * Deviation from the original ruling (documented in final-fix-report.md):
 * the ruling assumed D2 draws a horizontal edge's label above the line and a
 * vertical edge's label to its left, and offset perpendicular to the
 * midpoint segment accordingly (down for a horizontal-ish segment, right for
 * a vertical-ish one). Rendering real fixtures (a horizontal flowchart edge,
 * a vertical one, and a sequence message arrow — see the report) showed
 * that's not what D2 0.9.0 does: every edge/message label is a single line
 * of horizontal text centered ON the route's own coordinate, regardless of
 * the segment's orientation. That makes the label's cross-axis (vertical)
 * extent bounded by the font's line height no matter how long the label
 * text is, while its along-axis (horizontal) extent grows with the label —
 * so a fixed horizontal offset (the "vertical-ish -> +x" branch) does NOT
 * reliably clear a long label, and was observed overlapping a 3-character
 * label in a real render. Offsetting straight down by `BADGE_CLEARANCE`
 * clears the label regardless of the route segment's own orientation, since
 * that's always the label's small, bounded dimension.
 *
 * `polylineMidpointSegment` (rather than the plainer `polylineMidpoint`) is
 * still used for the midpoint itself, keeping the segment endpoints
 * available to a future caller that needs the route's own direction (e.g. to
 * lay out something along the edge) without a second walk of the polyline.
 */
function edgeBadgeAnchor(route: Point[]): Point {
  const { point } = polylineMidpointSegment(route);
  return { x: point.x, y: point.y + BADGE_CLEARANCE };
}

export function focusKeysFor(model: Diagram, view: string | undefined): Set<string> | undefined {
  if (view === undefined) {
    return undefined;
  }
  const found = model.views.find((v) => v.id === view);
  if (found === undefined) {
    return undefined;
  }
  return new Set(found.focus);
}

// Both helpers add `laidOut.origin` before building boxes/routes. A shape's
// `pos` and a connection's `route` points are in D2's INNER <svg> coordinate
// space; `origin` (computed by Plan 01's D2Engine from the inner viewBox, see
// "Before you start") translates them into the OUTER <svg> coordinate space
// that the annotation group (Task 3's `insertGroup`) is appended into and
// that the layout sidecar (Task 8) is documented to use (spec section 5.7:
// "same coordinate space as the SVG viewBox"). Every other function in this
// plan that needs a shape box or a connection route goes through these two
// helpers rather than reading `laidOut.shapes`/`laidOut.connections`
// directly, specifically so this translation happens in exactly one place.

export function indexShapeBoxes(laidOut: LaidOutDiagram, keyMap: KeyMap): Map<string, Box> {
  const map = new Map<string, Box>();
  for (const shape of laidOut.shapes) {
    const key = keyMap.shapeKey(shape.id);
    if (key !== undefined) {
      const pos = { x: shape.pos.x + laidOut.origin.x, y: shape.pos.y + laidOut.origin.y };
      map.set(key, bboxOf({ pos, width: shape.width, height: shape.height }));
    }
  }
  return map;
}

export function indexConnections(
  laidOut: LaidOutDiagram,
  keyMap: KeyMap,
): Map<string, LaidOutConnection> {
  const map = new Map<string, LaidOutConnection>();
  for (const connection of laidOut.connections) {
    const key = keyMap.connectionKey(connection);
    if (key !== undefined) {
      const route = connection.route.map((p) => ({
        x: p.x + laidOut.origin.x,
        y: p.y + laidOut.origin.y,
      }));
      map.set(key, { ...connection, route });
    }
  }
  return map;
}

export function placeCallouts(
  model: Diagram,
  laidOut: LaidOutDiagram,
  keyMap: KeyMap,
  view: string | undefined,
): { badges: Badge[]; legend: LegendEntry[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const focusSet = focusKeysFor(model, view);
  const shapeBoxByKey = indexShapeBoxes(laidOut, keyMap);
  const connectionByKey = indexConnections(laidOut, keyMap);

  const byTarget = new Map<string, typeof model.callouts>();
  for (const callout of model.callouts) {
    const list = byTarget.get(callout.at) ?? [];
    list.push(callout);
    byTarget.set(callout.at, list);
  }

  const badges: Badge[] = [];
  const legend: LegendEntry[] = [];

  for (const [targetKey, callouts] of byTarget) {
    const shapeBox = shapeBoxByKey.get(targetKey);
    const connection = connectionByKey.get(targetKey);
    if (shapeBox === undefined && connection === undefined) {
      for (const callout of callouts) {
        warnings.push({
          code: 'callout_target_not_found',
          path: callout.key,
          message: `callout target "${targetKey}" not found in layout`,
        });
      }
      continue;
    }
    const hidden = focusSet !== undefined && !focusSet.has(targetKey);
    const anchor =
      shapeBox !== undefined
        ? { x: shapeBox.x + shapeBox.width, y: shapeBox.y }
        : edgeBadgeAnchor(connection!.route);
    const ordered = [...callouts].sort((a, b) => a.number - b.number);
    const centers = stackHorizontal(anchor, ordered.length, BADGE_RADIUS, BADGE_GAP);
    ordered.forEach((callout, i) => {
      const badge: Badge = {
        id: `dg-callout-${callout.number}`,
        key: callout.key,
        number: callout.number,
        center: centers[i]!,
        targetKey,
        hidden,
        ...(callout.text !== undefined ? { text: callout.text } : {}),
      };
      badges.push(badge);
      if (callout.text !== undefined && !hidden) {
        legend.push({ number: callout.number, text: callout.text });
      }
    });
  }

  legend.sort((a, b) => a.number - b.number);
  return { badges, legend, warnings };
}
