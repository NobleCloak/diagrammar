import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './validate.js';

describe('validate command', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-validate-cmd-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns 0 and prints JSON for a valid file with --json', async () => {
    const file = join(dir, 'ok.yaml');
    await writeFile(
      file,
      'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\n',
      'utf8',
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await run([file, '--json']);
    expect(code).toBe(0);
    const printed = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? '[]') as { ok: boolean }[];
    expect(printed[0]?.ok).toBe(true);
  });

  it('returns 1 for an invalid file', async () => {
    const file = join(dir, 'bad.yaml');
    await writeFile(
      file,
      'diagrammar: 1\ntype: flowchart\nnodes: []\nedges:\n  - { from: a, to: b }\n',
      'utf8',
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await run([file, '--json']);
    expect(code).toBe(1);
  });

  it('returns 1 with a usage error when no files are given', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('returns 1 and reports a readable message when a file does not exist', async () => {
    const file = join(dir, 'missing.yaml');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await run([file, '--json']);
    expect(code).toBe(1);
  });

  it('reports a broken theme file as an issue at path "theme" (exit 1)', async () => {
    await writeFile(join(dir, 'house.yaml'), 'diagrammar-theme: 1\nbase: neon\n', 'utf8');
    const file = join(dir, 't.yaml');
    await writeFile(
      file,
      'diagrammar: 1\ntype: flowchart\ntheme: ./house.yaml\nnodes:\n  - { id: a }\n',
      'utf8',
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await run([file, '--json']);
    expect(code).toBe(1);
    const printed = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? '[]') as {
      ok: boolean;
      issues: { path: string; message: string }[];
    }[];
    expect(printed[0]?.ok).toBe(false);
    expect(printed[0]?.issues[0]?.path).toBe('theme');
    expect(printed[0]?.issues[0]?.message).toContain('house.yaml');
  });

  it('reports an io_error on the theme ref (not a crash) and still validates the rest of the batch', async () => {
    // `checkThemeRef` only maps ENOENT to a DiagrammarError (asset_not_found);
    // pointing the theme ref at a directory makes the resolver's readFile
    // throw a raw EISDIR that would otherwise escape validate.ts's per-file
    // loop and abort the whole run.
    await mkdir(join(dir, 'themes'));
    const brokenFile = join(dir, 'broken.yaml');
    await writeFile(
      brokenFile,
      'diagrammar: 1\ntype: flowchart\ntheme: ./themes\nnodes:\n  - { id: a }\n',
      'utf8',
    );
    await writeFile(join(dir, 'ok.theme.yaml'), 'diagrammar-theme: 1\nbase: mono\n', 'utf8');
    const okFile = join(dir, 'ok.yaml');
    await writeFile(
      okFile,
      'diagrammar: 1\ntype: flowchart\ntheme: ./ok.theme.yaml\nnodes:\n  - { id: a }\n',
      'utf8',
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await run([brokenFile, okFile, '--json']);
    expect(code).toBe(1);
    const printed = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? '[]') as {
      file: string;
      ok: boolean;
      issues: { path: string; message: string }[];
    }[];
    expect(printed[0]?.file).toBe(brokenFile);
    expect(printed[0]?.ok).toBe(false);
    expect(printed[0]?.issues[0]?.path).toBe('theme');
    expect(printed[1]?.file).toBe(okFile);
    expect(printed[1]?.ok).toBe(true);
  });

  it('passes a valid theme file', async () => {
    await writeFile(join(dir, 'ok.theme.yaml'), 'diagrammar-theme: 1\nbase: mono\n', 'utf8');
    const file = join(dir, 'ok.yaml');
    await writeFile(
      file,
      'diagrammar: 1\ntype: flowchart\ntheme: ./ok.theme.yaml\nnodes:\n  - { id: a }\n',
      'utf8',
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run([file])).toBe(0);
  });
});
