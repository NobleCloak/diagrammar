import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';
import { parse } from './parse.js';
import { compile } from './compile/index.js';
import { memoryResolver } from './assets/resolver.js';

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

const HOUSE =
  'diagrammar-theme: 1\nbase: light\npalette:\n  background: "#123456"\n  fill: "#abcdef"\n';
const DARK_HOUSE = 'diagrammar-theme: 1\nbase: dark\npalette:\n  background: "#0b0b0b"\n';

describe('render with themes', () => {
  it('fails with asset_resolver_missing when a theme path is used without a resolver', async () => {
    await expect(
      render(fixture, { format: 'svg', theme: './themes/house.yaml' }),
    ).rejects.toMatchObject({
      code: 'asset_resolver_missing',
    });
  }, 30000);

  it('applies a theme file through the resolver: palette colours reach the SVG', async () => {
    const resolver = memoryResolver({ 'themes/house.yaml': HOUSE });
    const result = await render(fixture, { format: 'svg', theme: './themes/house.yaml', resolver });
    expect(result.svg).toContain('#123456');
    expect(result.svg).toContain('#abcdef');
  }, 30000);

  it('a dark-based theme file uses the dark D2 theme and the overridden background', async () => {
    const resolver = memoryResolver({ 'themes/dark.yaml': DARK_HOUSE });
    const result = await render(fixture, { format: 'svg', theme: './themes/dark.yaml', resolver });
    expect(result.svg).toContain('#0b0b0b');
    expect(result.svg).not.toContain('#1E1E2E'); // D2 dark background replaced by the palette
    expect(result.svg).toContain('#CDD6F4'); // D2 dark-theme text colour still present
  }, 30000);

  it('opts.theme accepts any preset and changes the output', async () => {
    const light = await render(fixture, { format: 'svg' });
    const cb = await render(fixture, { format: 'svg', theme: 'colorblind' });
    expect(cb.svg).not.toBe(light.svg);
  }, 30000);

  it('rejects an unknown preset with theme_invalid', async () => {
    await expect(render(fixture, { format: 'svg', theme: 'neon' })).rejects.toMatchObject({
      code: 'theme_invalid',
    });
  }, 30000);

  it('is deterministic with a theme file', async () => {
    const resolver = memoryResolver({ 'themes/house.yaml': HOUSE });
    const a = await render(fixture, { format: 'png', theme: './themes/house.yaml', resolver });
    const b = await render(fixture, { format: 'png', theme: './themes/house.yaml', resolver });
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  }, 30000);
});

const THEMED = `diagrammar: 1
type: flowchart
theme: ./themes/house.yaml
nodes:
  - { id: a }
  - { id: b }
edges:
  - { from: a, to: b }
`;

describe('render with an in-file theme path', () => {
  it('fails with asset_resolver_missing when no resolver is supplied', async () => {
    await expect(render(THEMED, { format: 'svg' })).rejects.toMatchObject({
      code: 'asset_resolver_missing',
    });
  }, 30000);

  it('resolves the file’s own theme: path through the resolver', async () => {
    const resolver = memoryResolver({ 'themes/house.yaml': HOUSE });
    const result = await render(THEMED, { format: 'svg', resolver });
    expect(result.svg).toContain('#123456');
  }, 30000);

  it('opts.theme wins over the file’s theme:', async () => {
    const resolver = memoryResolver({ 'themes/house.yaml': HOUSE });
    const result = await render(THEMED, { format: 'svg', resolver, theme: 'mono' });
    expect(result.svg).not.toContain('#123456');
  }, 30000);
});

const SEQ_THEME =
  'diagrammar-theme: 1\nbase: light\npalette:\n  background: "#f0f0f0"\n  text: "#111111"\n  edge: "#2266aa"\ndefaults:\n  kinds:\n    database:\n      fill: "#33cc99"\n';

describe('render with a themed sequence diagram', () => {
  it('applies theme-overrides vars and a participant kind default to a rendered sequence SVG', async () => {
    const resolver = memoryResolver({ 'themes/seq.yaml': SEQ_THEME });
    const result = await render(sequenceFixture, {
      format: 'svg',
      theme: './themes/seq.yaml',
      resolver,
    });
    expect(result.format).toBe('svg');
    expect(result.svg).toContain('#f0f0f0');
    expect(result.svg).toContain('#111111');
    expect(result.svg).toContain('#2266aa');
    expect(result.svg).toContain('#33cc99');
  }, 30000);
});
