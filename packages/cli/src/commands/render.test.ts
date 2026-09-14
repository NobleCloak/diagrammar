import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './render.js';

const FLOWCHART =
  'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\n';
const FLOWCHART_WITH_VIEW =
  'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\nviews:\n  - { id: only-a, focus: [a] }\n';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('render command', () => {
  let dir: string;
  let cwd: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-render-cmd-'));
    await writeFile(join(dir, 'f.yaml'), FLOWCHART, 'utf8');
    cwd = process.cwd();
    process.chdir(dir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes a PNG beside the input by default', async () => {
    const code = await run(['f.yaml']);
    expect(code).toBe(0);
    const bytes = await readFile(join(dir, 'f.png'));
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  }, 30000);

  it('writes an SVG for --format svg', async () => {
    const code = await run(['f.yaml', '--format', 'svg']);
    expect(code).toBe(0);
    const text = await readFile(join(dir, 'f.svg'), 'utf8');
    expect(text).toContain('<svg');
  }, 30000);

  it('writes D2 source for --format d2', async () => {
    const code = await run(['f.yaml', '--format', 'd2']);
    expect(code).toBe(0);
    const text = await readFile(join(dir, 'f.d2'), 'utf8');
    expect(text.length).toBeGreaterThan(0);
  }, 30000);

  it('writes Markdown for --format md', async () => {
    const code = await run(['f.yaml', '--format', 'md']);
    expect(code).toBe(0);
    const text = await readFile(join(dir, 'f.md'), 'utf8');
    expect(text.length).toBeGreaterThan(0);
  });

  it('writes <stem>.<view>.md for --format md --view, never clobbering <stem>.md (I4)', async () => {
    await writeFile(join(dir, 'v.yaml'), FLOWCHART_WITH_VIEW, 'utf8');
    const rootCode = await run(['v.yaml', '--format', 'md']);
    const viewCode = await run(['v.yaml', '--format', 'md', '--view', 'only-a']);
    expect(rootCode).toBe(0);
    expect(viewCode).toBe(0);
    await expect(readFile(join(dir, 'v.md'), 'utf8')).resolves.toContain('# Untitled diagram');
    await expect(readFile(join(dir, 'v.only-a.md'), 'utf8')).resolves.toContain(
      '# Untitled diagram',
    );
  });

  it('expands a glob positional', async () => {
    await writeFile(join(dir, 'g.yaml'), FLOWCHART, 'utf8');
    const code = await run(['*.yaml', '--format', 'svg']);
    expect(code).toBe(0);
    await expect(readFile(join(dir, 'f.svg'), 'utf8')).resolves.toContain('<svg');
    await expect(readFile(join(dir, 'g.svg'), 'utf8')).resolves.toContain('<svg');
  }, 30000);

  it('respects -o for output directory', async () => {
    const outDir = join(dir, 'out');
    await import('node:fs/promises').then((fsp) => fsp.mkdir(outDir));
    const code = await run(['f.yaml', '--format', 'svg', '-o', outDir]);
    expect(code).toBe(0);
    await expect(readFile(join(outDir, 'f.svg'), 'utf8')).resolves.toContain('<svg');
  }, 30000);

  it('creates a nonexistent -o directory (recursively) instead of failing (I3)', async () => {
    const outDir = join(dir, 'brand', 'new', 'nested');
    const code = await run(['f.yaml', '--format', 'svg', '-o', outDir]);
    expect(code).toBe(0);
    await expect(readFile(join(outDir, 'f.svg'), 'utf8')).resolves.toContain('<svg');
  }, 30000);

  it('returns 1 for an unknown --format', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run(['f.yaml', '--format', 'bogus']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('returns 1 when no files match', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run(['nothing-*.yaml']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('resolves a theme file relative to the diagram (not the cwd)', async () => {
    await mkdir(join(dir, 'sub', 'themes'), { recursive: true });
    await writeFile(
      join(dir, 'sub', 'themes', 'house.yaml'),
      'diagrammar-theme: 1\nbase: light\npalette:\n  background: "#123456"\n',
      'utf8',
    );
    await writeFile(
      join(dir, 'sub', 't.yaml'),
      'diagrammar: 1\ntype: flowchart\ntheme: ./themes/house.yaml\nnodes:\n  - { id: a }\n',
      'utf8',
    );
    const code = await run(['sub/t.yaml', '--format', 'svg']);
    expect(code).toBe(0);
    await expect(readFile(join(dir, 'sub', 't.svg'), 'utf8')).resolves.toContain('#123456');
  }, 30000);

  it('accepts any preset for --theme and rejects an unknown one with exit 1', async () => {
    expect(await run(['f.yaml', '--format', 'svg', '--theme', 'colorblind'])).toBe(0);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run(['f.yaml', '--format', 'svg', '--theme', 'neon'])).toBe(1);
    expect(errSpy.mock.calls.flat().join('\n')).toContain('unknown theme "neon"');
  }, 30000);

  it('reports a missing theme file by name with exit 1', async () => {
    await writeFile(
      join(dir, 'm.yaml'),
      'diagrammar: 1\ntype: flowchart\ntheme: ./nope.yaml\nnodes:\n  - { id: a }\n',
      'utf8',
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run(['m.yaml', '--format', 'svg'])).toBe(1);
    expect(errSpy.mock.calls.flat().join('\n')).toContain('nope.yaml');
  }, 30000);
});
