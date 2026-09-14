import type { ElementModel } from '../model/types.js';
import type { LaidOutConnection } from '../engine/types.js';
import type { Theme } from '../model/types.js';
import type { Warning } from '../errors.js';

/**
 * One entry in the render() layout sidecar (spec §5.7): the element's kind
 * plus either a bounding box (shapes, groups, notes, callouts) or a route
 * (edges, messages).
 */
export interface LayoutEntry {
  kind: ElementModel['kind'];
  bbox?: Box;
  route?: Point[];
}

/** Keyed by model key (contract §3), covering every addressable element. */
export type LayoutSidecar = Record<string, LayoutEntry>;

export interface OverlayOptions {
  theme: Theme;
  legend: boolean;
  view?: string;
}

export interface OverlayResult {
  svg: string;
  layout: LayoutSidecar;
  warnings: Warning[];
}

/** Bridges D2's laid-out ids back to model keys — built by `compile()` (Task 8) and `render()` (Task 11). */
export interface KeyMap {
  shapeKey(d2Id: string): string | undefined;
  connectionKey(connection: LaidOutConnection): string | undefined;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface Placement {
  box: Box;
  side: Side;
}

export interface ThemeTokens {
  accent: string;
  badgeText: string;
  noteFill: string;
  noteStroke: string;
  noteText: string;
  legendText: string;
  leader: string;
  /** Fill for the rect painted under the grown canvas (spec §5.5). */
  canvas: string;
}

export interface Badge {
  id: string; // "dg-callout-<n>"
  key: string; // the callout's own model key
  number: number;
  center: Point;
  text?: string;
  targetKey: string;
  hidden: boolean;
}

export interface LegendEntry {
  number: number;
  text: string;
}

export interface PlacedNote {
  id: string; // "dg-note-<n>"
  key: string; // the note's own model key
  box: Box;
  lines: string[];
  leaderFrom?: Point;
  leaderTo?: Point;
  hidden: boolean;
}
