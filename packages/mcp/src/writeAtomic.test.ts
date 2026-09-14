import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `rename` and `link` are wrapped so individual tests can inject a one-off
// failure via `mockRejectedValueOnce` while every other call (including
// every other test file's use of `node:fs/promises`) passes through to the
// real implementation unchanged.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: vi.fn(actual.rename),
    link: vi.fn(actual.link),
  };
});

import { rename, link } from 'node:fs/promises';
import { writeAtomic } from './fs.js';

describe('writeAtomic (I6: atomic writes everywhere)', () => {
  let dir: string;

  afterEach(async () => {
    // Each test's `mockRejectedValueOnce` (if any) is consumed by the single
    // `rename`/`link` call `writeAtomic` makes, so the wrapped mock already
    // falls back to the real implementation for the next test; only the
    // call-count history needs clearing.
    vi.mocked(rename).mockClear();
    vi.mocked(link).mockClear();
    if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it('writes new content and leaves no temp file behind on success (non-exclusive)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-writeatomic-'));
    const path = join(dir, 'f.yaml');
    await writeFile(path, 'ORIGINAL', 'utf8');
    await writeAtomic(path, 'NEW');
    expect(await readFile(path, 'utf8')).toBe('NEW');
    const entries = await readdir(dir);
    expect(entries).toEqual(['f.yaml']);
  });

  it('an interrupted rename leaves the original file byte-identical and cleans up the temp file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-writeatomic-'));
    const path = join(dir, 'f.yaml');
    await writeFile(path, 'ORIGINAL', 'utf8');
    vi.mocked(rename).mockRejectedValueOnce(new Error('simulated rename failure'));

    await expect(writeAtomic(path, 'NEW')).rejects.toThrow('simulated rename failure');

    expect(await readFile(path, 'utf8')).toBe('ORIGINAL');
    const entries = await readdir(dir);
    expect(entries).toEqual(['f.yaml']);
  });

  it('exclusive write succeeds via link, leaving no temp file behind', async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-writeatomic-'));
    const path = join(dir, 'new.yaml');
    await writeAtomic(path, 'CONTENT', { exclusive: true });
    expect(await readFile(path, 'utf8')).toBe('CONTENT');
    const entries = await readdir(dir);
    expect(entries).toEqual(['new.yaml']);
  });

  it('exclusive write fails with EEXIST and never touches the existing file, cleaning up the temp file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-writeatomic-'));
    const path = join(dir, 'existing.yaml');
    await writeFile(path, 'ORIGINAL', 'utf8');

    await expect(writeAtomic(path, 'NEW', { exclusive: true })).rejects.toMatchObject({
      code: 'EEXIST',
    });

    expect(await readFile(path, 'utf8')).toBe('ORIGINAL');
    const entries = await readdir(dir);
    expect(entries).toEqual(['existing.yaml']);
  });

  it('an interrupted exclusive link leaves no temp file behind even though the target never existed', async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-writeatomic-'));
    const path = join(dir, 'never-created.yaml');
    vi.mocked(link).mockRejectedValueOnce(new Error('simulated link failure'));

    await expect(writeAtomic(path, 'NEW', { exclusive: true })).rejects.toThrow(
      'simulated link failure',
    );

    const entries = await readdir(dir);
    expect(entries).toEqual([]);
  });
});
