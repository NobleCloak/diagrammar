import { describe, expect, it } from 'vitest';
import { getRasterizer } from './Rasterizer.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPngDimensions(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function testSvg(text: string): string {
  const textEl = text
    ? `<text x="10" y="50" font-family="Source Sans 3" font-size="24" fill="black">${text}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="white"/>${textEl}</svg>`;
}

describe('ResvgRasterizer (via getRasterizer)', () => {
  it('produces a valid PNG signature', async () => {
    const rasterizer = getRasterizer();
    const png = await rasterizer.rasterize(testSvg('Hello'), { scale: 1 });
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
  });

  it('doubles pixel dimensions at scale 2', async () => {
    const rasterizer = getRasterizer();
    const png1 = await rasterizer.rasterize(testSvg('Hello'), { scale: 1 });
    const png2 = await rasterizer.rasterize(testSvg('Hello'), { scale: 2 });
    const dim1 = readPngDimensions(png1);
    const dim2 = readPngDimensions(png2);
    expect(dim2.width).toBe(dim1.width * 2);
    expect(dim2.height).toBe(dim1.height * 2);
  });

  it('produces byte-identical PNGs across repeated runs', async () => {
    const rasterizer = getRasterizer();
    const png1 = await rasterizer.rasterize(testSvg('Determinism'), { scale: 1 });
    const png2 = await rasterizer.rasterize(testSvg('Determinism'), { scale: 1 });
    expect(Buffer.from(png1).equals(Buffer.from(png2))).toBe(true);
  });

  it('renders visible text using the bundled font', async () => {
    const rasterizer = getRasterizer();
    const withText = await rasterizer.rasterize(testSvg('Diagrammar'), { scale: 1 });
    const withoutText = await rasterizer.rasterize(testSvg(''), { scale: 1 });
    expect(Buffer.from(withText).equals(Buffer.from(withoutText))).toBe(false);
  });
});
