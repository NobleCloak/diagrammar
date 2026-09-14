import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';
import { parse } from './parse.js';
import { compile } from './compile/index.js';

const fixture = readFileSync(
  fileURLToPath(new URL('../test/fixtures/compile/flowchart-view.yaml', import.meta.url)),
  'utf-8',
);

const sequenceFixture = readFileSync(
  fileURLToPath(new URL('../test/fixtures/compile/sequence-fragments.yaml', import.meta.url)),
  'utf-8',
);

describe('render (integration, real D2/resvg WASM)', () => {
  it('renders SVG containing the node labels', async () => {
    const result = await render(fixture, { format: 'svg' });
    expect(result.format).toBe('svg');
    expect(result.svg).toContain('Start');
    expect(result.svg).toContain('Check stock');
    expect(result.svg).toContain('Ship order');
  }, 30000);

  it('renders PNG bytes with a valid PNG signature', async () => {
    const result = await render(fixture, { format: 'png' });
    expect(result.format).toBe('png');
    expect(Array.from(result.bytes.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  }, 30000);

  it('renders a named view differently from the root', async () => {
    const root = await render(fixture, { format: 'svg' });
    const view = await render(fixture, { format: 'svg', view: 'happy' });
    expect(view.svg).not.toEqual(root.svg);
  }, 30000);

  it('emitD2 returns the same text compile() would produce', async () => {
    const parsed = parse(fixture);
    if (!parsed.ok) throw new Error('fixture failed to parse');
    const { d2 } = compile(parsed.diagram);
    const result = await render(fixture, { format: 'svg', emitD2: true });
    expect(result.d2).toBe(d2);
  }, 30000);

  it('omits d2 from the result when emitD2 is not set', async () => {
    const result = await render(fixture, { format: 'svg' });
    expect(result.d2).toBeUndefined();
  }, 30000);

  it('rejects an unknown view with a DiagrammarError code unknown_view', async () => {
    await expect(render(fixture, { view: 'nope' })).rejects.toMatchObject({ code: 'unknown_view' });
  }, 30000);

  it('is deterministic: two render() calls on the same YAML give byte-identical svg and bytes', async () => {
    const first = await render(fixture, { format: 'svg' });
    const second = await render(fixture, { format: 'svg' });
    expect(second.svg).toBe(first.svg);
    expect(second.bytes).toEqual(first.bytes);
  }, 30000);

  it('for format svg, bytes equals the UTF-8 encoding of svg', async () => {
    const result = await render(fixture, { format: 'svg' });
    expect(result.bytes).toEqual(new TextEncoder().encode(result.svg));
  }, 30000);

  it('scale 2 PNG bytes differ from scale 1', async () => {
    const scale1 = await render(fixture, { format: 'png', scale: 1 });
    const scale2 = await render(fixture, { format: 'png', scale: 2 });
    expect(scale2.bytes).not.toEqual(scale1.bytes);
  }, 30000);

  it('rejects invalid YAML with a ValidationError', async () => {
    // `diagrammar: 1\ntype: flowchart\n` (the brief's original literal) is
    // actually valid per Plan 02's schema — nodes/edges/views all default to
    // `[]` — so it does not exercise this path. Use a string with a genuine
    // schema violation (unknown shape) instead; same fixture pattern as
    // `parse.test.ts`'s "parse — schema failure with line numbers" case.
    await expect(
      render('diagrammar: 1\ntype: flowchart\nnodes:\n  - id: start\n    shape: star\n'),
    ).rejects.toMatchObject({ code: 'validation' });
  }, 30000);

  it('does not render a text element reading the literal "seq" for a sequence diagram\'s root container (X)', async () => {
    const result = await render(sequenceFixture, { format: 'svg' });
    expect(result.svg).not.toContain('>seq<');
  }, 30000);
});
