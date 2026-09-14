import { readFile } from 'node:fs/promises';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
import { FONT_FAMILY, loadFonts } from '../engine/fonts.js';
import type { Rasterizer } from './Rasterizer.js';

let wasmReady: Promise<void> | undefined;

function ensureWasmInitialized(): Promise<void> {
  wasmReady ??= (async () => {
    const wasmUrl = import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm');
    const wasmBytes = await readFile(new URL(wasmUrl));
    await initWasm(wasmBytes);
  })().catch((error: unknown) => {
    // Reset the cache on failure so a transient error (e.g. a momentary
    // filesystem hiccup) doesn't permanently poison every later rasterize()
    // call with the same rejected promise.
    wasmReady = undefined;
    throw error;
  });
  return wasmReady;
}

export class ResvgRasterizer implements Rasterizer {
  async rasterize(svg: string, opts: { scale: 1 | 2 }): Promise<Uint8Array> {
    await ensureWasmInitialized();
    const fonts = await loadFonts();
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'zoom', value: opts.scale },
      font: {
        loadSystemFonts: false,
        fontBuffers: [fonts.regular, fonts.italic, fonts.bold, fonts.semibold],
        defaultFontFamily: FONT_FAMILY,
      },
    });
    try {
      const rendered = resvg.render();
      try {
        return rendered.asPng();
      } finally {
        rendered.free();
      }
    } finally {
      resvg.free();
    }
  }
}
