import type { Box, Point, Side, Placement } from './types.js';
import { DiagrammarError } from '../errors.js';

// Geometry constants — spec section 5, contract section 7.
export const BADGE_RADIUS = 11;
export const BADGE_GAP = 4;
export const NOTE_GAP = 24;
export const NOTE_DEFAULT_WIDTH = 240;
export const NOTE_PADDING = 8;
export const NOTE_RADIUS = 4;
export const COLLISION_STEP = 16;
export const COLLISION_MAX_STEPS = 8;
export const FLOATING_COLUMN_GAP = 32;
export const CANVAS_PAD = 24;
// Minimum legend text-wrap width (M8): a very narrow diagram must not force
// the legend to wrap every word onto its own line.
export const MIN_LEGEND_WIDTH = 120;

// One home for overlay font sizes (I5) — badges, notes, and the legend all
// render at the same 12px size; values unchanged from their prior per-module
// constants.
export const BADGE_FONT_SIZE = 12;
export const NOTE_FONT_SIZE = 12;
export const LEGEND_FONT_SIZE = 12;

export function bboxOf(shape: { pos: Point; width: number; height: number }): Box {
  return { x: shape.pos.x, y: shape.pos.y, width: shape.width, height: shape.height };
}

export function union(boxes: Box[]): Box {
  if (boxes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function expand(box: Box, pad: number): Box {
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + 2 * pad,
    height: box.height + 2 * pad,
  };
}

/** A polyline's midpoint plus the endpoints of the segment it lands on. */
export interface MidpointSegment {
  point: Point;
  from: Point;
  to: Point;
}

/**
 * Walks a polyline by cumulative arc length to its halfway point, returning
 * both that point and the `{ from, to }` endpoints of the segment it falls
 * on — the segment's own direction is what a caller (see `edgeBadgeAnchor`
 * in `callouts.ts`, spec §5.2) needs to offset a badge perpendicular to the
 * line, clear of D2's own edge label.
 */
export function polylineMidpointSegment(points: Point[]): MidpointSegment {
  if (points.length === 0) {
    throw new DiagrammarError('polylineMidpointSegment requires at least one point', 'overlay');
  }
  if (points.length === 1) {
    return { point: points[0]!, from: points[0]!, to: points[0]! };
  }
  const segments: { from: Point; to: Point; length: number }[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, length });
    total += length;
  }
  const half = total / 2;
  let remaining = half;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      if (segment.length === 0) {
        return { point: segment.from, from: segment.from, to: segment.to };
      }
      const t = remaining / segment.length;
      const point = {
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        y: segment.from.y + (segment.to.y - segment.from.y) * t,
      };
      return { point, from: segment.from, to: segment.to };
    }
    remaining -= segment.length;
  }
  const last = segments[segments.length - 1]!;
  return { point: last.to, from: last.from, to: last.to };
}

export function polylineMidpoint(points: Point[]): Point {
  return polylineMidpointSegment(points).point;
}

export function nearestPointOnBox(box: Box, p: Point): Point {
  const clampedX = Math.min(Math.max(p.x, box.x), box.x + box.width);
  const clampedY = Math.min(Math.max(p.y, box.y), box.y + box.height);
  const insideX = p.x > box.x && p.x < box.x + box.width;
  const insideY = p.y > box.y && p.y < box.y + box.height;
  if (!(insideX && insideY)) {
    return { x: clampedX, y: clampedY };
  }
  const distLeft = p.x - box.x;
  const distRight = box.x + box.width - p.x;
  const distTop = p.y - box.y;
  const distBottom = box.y + box.height - p.y;
  const minDist = Math.min(distLeft, distRight, distTop, distBottom);
  if (minDist === distLeft) return { x: box.x, y: p.y };
  if (minDist === distRight) return { x: box.x + box.width, y: p.y };
  if (minDist === distTop) return { x: p.x, y: box.y };
  return { x: p.x, y: box.y + box.height };
}

export function placeBeside(
  target: Box,
  size: { width: number; height: number },
  side: Side,
  gap: number,
): Placement {
  let box: Box;
  switch (side) {
    case 'right':
      box = {
        x: target.x + target.width + gap,
        y: target.y + target.height / 2 - size.height / 2,
        ...size,
      };
      break;
    case 'left':
      box = {
        x: target.x - gap - size.width,
        y: target.y + target.height / 2 - size.height / 2,
        ...size,
      };
      break;
    case 'top':
      box = {
        x: target.x + target.width / 2 - size.width / 2,
        y: target.y - gap - size.height,
        ...size,
      };
      break;
    case 'bottom':
      box = {
        x: target.x + target.width / 2 - size.width / 2,
        y: target.y + target.height + gap,
        ...size,
      };
      break;
  }
  return { box, side };
}

const PUSH_AXIS: Record<Side, { dx: number; dy: number }> = {
  right: { dx: 1, dy: 0 },
  left: { dx: -1, dy: 0 },
  top: { dx: 0, dy: -1 },
  bottom: { dx: 0, dy: 1 },
};

export function pushUntilClear(
  box: Box,
  obstacles: Box[],
  side: Side,
  step: number,
  maxSteps: number,
): { box: Box; cleared: boolean } {
  let current = box;
  const axis = PUSH_AXIS[side];
  const isClear = (b: Box): boolean => obstacles.every((obstacle) => !intersects(b, obstacle));
  if (isClear(current)) {
    return { box: current, cleared: true };
  }
  for (let i = 0; i < maxSteps; i++) {
    current = { ...current, x: current.x + axis.dx * step, y: current.y + axis.dy * step };
    if (isClear(current)) {
      return { box: current, cleared: true };
    }
  }
  return { box: current, cleared: false };
}

export function stackHorizontal(
  anchor: Point,
  count: number,
  radius: number,
  gap: number,
): Point[] {
  const spacing = 2 * radius + gap;
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    points.push({ x: anchor.x + i * spacing, y: anchor.y });
  }
  return points;
}
