import type { LayoutEngine, Theme } from '../model/types.js';

export type { LayoutEngine, Theme } from '../model/types.js';

export interface Point {
  x: number;
  y: number;
}

export interface LaidOutShape {
  id: string;
  type: string;
  pos: Point;
  width: number;
  height: number;
  level: number;
}

export interface LaidOutConnection {
  id: string;
  src: string;
  dst: string;
  route: Point[];
}

export interface LaidOutDiagram {
  shapes: LaidOutShape[];
  connections: LaidOutConnection[];
  /** Offset to add to shape/connection coordinates to land in SVG viewBox space. */
  origin: Point;
  viewBox: { x: number; y: number; width: number; height: number };
}

export interface EngineOptions {
  layout: LayoutEngine;
  theme: Theme;
}

export interface EngineResult {
  svg: string;
  laidOut: LaidOutDiagram;
}
