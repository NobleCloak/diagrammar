import { afterAll, describe, expect, it } from 'vitest';
import { compileAndRender, shutdown } from './D2Engine.js';
import { DiagrammarError } from '../errors.js';

const SAMPLE_D2 = `direction: right
a: {shape: rectangle}
b: {shape: rectangle}
a -> b: hello
`;

const OTHER_D2 = `direction: down
x: {shape: circle}
y: {shape: circle}
x -> y: world
`;

const INVALID_D2 = `a -> : this is not valid d2 syntax {{{`;

describe('D2Engine', () => {
  afterAll(async () => {
    await shutdown();
  });

  it('compiles and renders a diagram to SVG with laid-out coordinates', async () => {
    const result = await compileAndRender(SAMPLE_D2, { layout: 'dagre', themeId: 0 });
    expect(result.svg).toContain('<svg');
    expect(result.laidOut.shapes.length).toBeGreaterThanOrEqual(2);
    for (const shape of result.laidOut.shapes) {
      expect(typeof shape.pos.x).toBe('number');
      expect(typeof shape.pos.y).toBe('number');
      expect(shape.width).toBeGreaterThan(0);
      expect(shape.height).toBeGreaterThan(0);
    }
    expect(result.laidOut.connections.length).toBeGreaterThanOrEqual(1);
    for (const connection of result.laidOut.connections) {
      expect(connection.route.length).toBeGreaterThanOrEqual(2);
    }
    expect(result.laidOut.viewBox.width).toBeGreaterThan(0);
    expect(result.laidOut.viewBox.height).toBeGreaterThan(0);
  }, 30_000);

  it('supports a second call after the first completes', async () => {
    const first = await compileAndRender(SAMPLE_D2, { layout: 'dagre', themeId: 0 });
    const second = await compileAndRender(SAMPLE_D2, { layout: 'dagre', themeId: 200 });
    expect(first.svg).toContain('<svg');
    expect(second.svg).toContain('<svg');
    expect(second.svg).not.toBe(first.svg);
  }, 30_000);

  it('derives origin from the inner <svg> viewBox and viewBox from the outer', async () => {
    const result = await compileAndRender(SAMPLE_D2, { layout: 'dagre', themeId: 0 });
    const viewBoxes = [
      ...result.svg.matchAll(/viewBox="([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+) ([-\d.eE]+)"/g),
    ].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
    }));
    const outer = viewBoxes[0];
    const inner = viewBoxes[1];
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    if (outer === undefined || inner === undefined) {
      return;
    }
    expect(result.laidOut.origin).toEqual({ x: -inner.x, y: -inner.y });
    expect(result.laidOut.viewBox).toEqual(outer);
  }, 30_000);

  it('re-creates the engine after shutdown', async () => {
    await compileAndRender(SAMPLE_D2, { layout: 'dagre', themeId: 0 });
    await shutdown();
    const result = await compileAndRender(SAMPLE_D2, { layout: 'dagre', themeId: 0 });
    expect(result.svg).toContain('<svg');
  }, 30_000);

  it('rejects invalid D2 source with a DiagrammarError including D2 error text', async () => {
    expect.assertions(3);
    try {
      await compileAndRender(INVALID_D2, { layout: 'dagre', themeId: 0 });
    } catch (error) {
      expect(error).toBeInstanceOf(DiagrammarError);
      expect(error instanceof DiagrammarError ? error.message.length : 0).toBeGreaterThan(0);
      expect(error instanceof DiagrammarError ? error.code : undefined).toBe('engine');
    }
  }, 30_000);

  it('serializes concurrent compileAndRender calls without cross-talk', async () => {
    const [resultA, resultB] = await Promise.all([
      compileAndRender(SAMPLE_D2, { layout: 'dagre', themeId: 0 }),
      compileAndRender(OTHER_D2, { layout: 'dagre', themeId: 0 }),
    ]);
    expect(resultA.svg).toContain('<svg');
    expect(resultB.svg).toContain('<svg');
    expect(resultA.svg).not.toBe(resultB.svg);
  }, 30_000);

  it('waits for an in-flight render before shutdown disposes the engine', async () => {
    const pending = compileAndRender(SAMPLE_D2, { layout: 'dagre', themeId: 0 });
    const closing = shutdown();
    const [renderResult] = await Promise.all([pending, closing]);
    expect(renderResult.svg).toContain('<svg');
  }, 30_000);
});
