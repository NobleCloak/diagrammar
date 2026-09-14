import { ResvgRasterizer } from './ResvgRasterizer.js';

export interface Rasterizer {
  rasterize(svg: string, opts: { scale: 1 | 2 }): Promise<Uint8Array>;
}

let singleton: Rasterizer | undefined;

/** Process-wide resvg-backed rasterizer singleton. */
export function getRasterizer(): Rasterizer {
  singleton ??= new ResvgRasterizer();
  return singleton;
}
