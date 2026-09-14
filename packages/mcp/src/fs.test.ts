import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiagrammarError, ValidationError } from '@noblecloak/diagrammar-core';
import {
  assertFsEnabled,
  resolveInRoot,
  listDiagrams,
  resolveSource,
  type ToolContext,
} from './fs.js';

describe('resolveInRoot', () => {
  it('resolves a plain relative path inside root', () => {
    const resolved = resolveInRoot('/tmp/root', 'a/b.yaml');
    expect(resolved).toBe(join('/tmp/root', 'a/b.yaml'));
  });

  it('rejects an absolute path', () => {
    expect(() => resolveInRoot('/tmp/root', '/etc/passwd')).toThrow(DiagrammarError);
  });

  it('rejects a path that escapes root via ..', () => {
    expect(() => resolveInRoot('/tmp/root', '../../etc/passwd')).toThrow(DiagrammarError);
  });

  it('the escape error carries code path_outside_root', () => {
    try {
      resolveInRoot('/tmp/root', '../escape.yaml');
      throw new Error('expected resolveInRoot to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DiagrammarError);
      expect((err as DiagrammarError).code).toBe('path_outside_root');
    }
  });

  it('rejects a path containing a null byte', () => {
    expect(() => resolveInRoot('/tmp/root', 'a\0b.yaml')).toThrow(DiagrammarError);
  });

  it('the null byte error carries code invalid_path', () => {
    try {
      resolveInRoot('/tmp/root', 'a\0b.yaml');
      throw new Error('expected resolveInRoot to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DiagrammarError);
      expect((err as DiagrammarError).code).toBe('invalid_path');
    }
  });
});

describe('resolveInRoot symlink jail', () => {
  let root: string;
  let outsideDir: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-fs-root-'));
    outsideDir = await mkdtemp(join(tmpdir(), 'diagrammar-fs-outside-'));
    await writeFile(join(outsideDir, 'secret.yaml'), 'diagrammar: 1\n', 'utf8');
    await symlink(outsideDir, join(root, 'escape'), 'dir');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  it('rejects a path that resolves outside root via a symlink', () => {
    expect(() => resolveInRoot(root, 'escape/secret.yaml')).toThrow(DiagrammarError);
  });

  it('the symlink escape error carries code path_outside_root', () => {
    try {
      resolveInRoot(root, 'escape/secret.yaml');
      throw new Error('expected resolveInRoot to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DiagrammarError);
      expect((err as DiagrammarError).code).toBe('path_outside_root');
    }
  });
});

describe('listDiagrams', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-fs-'));
    await mkdir(join(root, 'nested'), { recursive: true });
    await writeFile(
      join(root, 'a.yaml'),
      'diagrammar: 1\ntype: flowchart\nnodes: []\nedges: []\n',
      'utf8',
    );
    await writeFile(
      join(root, 'nested', 'b.yml'),
      'diagrammar: 1\ntype: sequence\nparticipants: []\nmessages: []\n',
      'utf8',
    );
    await writeFile(join(root, 'not-a-diagram.yaml'), 'foo: bar\n', 'utf8');
    await writeFile(join(root, 'ignore.txt'), 'diagrammar: 1\n', 'utf8');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds .yaml and .yml files with a diagrammar: 1 header, ignoring others', async () => {
    const files = await listDiagrams(root);
    expect(files.sort()).toEqual(['a.yaml', 'nested/b.yml']);
  });

  it('filters by glob when given', async () => {
    const files = await listDiagrams(root, 'nested/**');
    expect(files).toEqual(['nested/b.yml']);
  });
});

describe('listDiagrams symlink and exclusion jail', () => {
  let root: string;
  let outsideDir: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-fs-jail-'));
    outsideDir = await mkdtemp(join(tmpdir(), 'diagrammar-fs-jail-outside-'));

    // A directory symlink pointing OUTSIDE root, containing a file that
    // would pass the header probe if it were ever read.
    await writeFile(join(outsideDir, 'secret.yaml'), 'diagrammar: 1\n', 'utf8');
    await symlink(outsideDir, join(root, 'escape'), 'dir');

    // A real directory INSIDE root, plus a symlink to it also inside root.
    // The real directory is walked normally; the symlink to it is not.
    await mkdir(join(root, 'real'), { recursive: true });
    await writeFile(join(root, 'real', 'x.yaml'), 'diagrammar: 1\n', 'utf8');
    await symlink(join(root, 'real'), join(root, 'linked'), 'dir');

    // node_modules and dotfile directories should be skipped entirely.
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'x.yaml'), 'diagrammar: 1\n', 'utf8');
    await mkdir(join(root, '.hidden'), { recursive: true });
    await writeFile(join(root, '.hidden', 'x.yaml'), 'diagrammar: 1\n', 'utf8');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  });

  it('never descends into a symlinked directory that escapes root, so its file is never listed', async () => {
    const files = await listDiagrams(root);
    expect(files).not.toContain('escape/secret.yaml');
  });

  it('never descends into a symlinked directory even when its target is inside root', async () => {
    const files = await listDiagrams(root);
    expect(files).toContain('real/x.yaml');
    expect(files).not.toContain('linked/x.yaml');
  });

  it('excludes node_modules and dotfile directories', async () => {
    const files = await listDiagrams(root);
    expect(files).not.toContain('node_modules/x.yaml');
    expect(files).not.toContain('.hidden/x.yaml');
  });
});

describe('assertFsEnabled', () => {
  it('does not throw when noFs is false and root is defined', () => {
    expect(() => assertFsEnabled({ root: '/tmp/root', noFs: false })).not.toThrow();
  });

  it('throws fs_disabled when noFs is true', () => {
    expect(() => assertFsEnabled({ root: undefined, noFs: true })).toThrow(DiagrammarError);
    try {
      assertFsEnabled({ root: undefined, noFs: true });
      throw new Error('expected assertFsEnabled to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DiagrammarError);
      expect((err as DiagrammarError).code).toBe('fs_disabled');
    }
  });

  it('throws fs_disabled when noFs is false but root is undefined', () => {
    expect(() => assertFsEnabled({ root: undefined, noFs: false })).toThrow(DiagrammarError);
  });
});

describe('resolveSource', () => {
  const ctxWithFs: ToolContext = { root: '/tmp/does-not-matter', noFs: false };
  const ctxNoFs: ToolContext = { root: undefined, noFs: true };

  it('returns inline source text unchanged', async () => {
    const result = await resolveSource(ctxWithFs, { source: 'diagrammar: 1\n' });
    expect(result).toEqual({ text: 'diagrammar: 1\n' });
  });

  it('rejects when both source and path are given', async () => {
    await expect(resolveSource(ctxWithFs, { source: 'x', path: 'y.yaml' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rejects when neither source nor path is given', async () => {
    await expect(resolveSource(ctxWithFs, {})).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a path argument when noFs is true', async () => {
    await expect(resolveSource(ctxNoFs, { path: 'a.yaml' })).rejects.toMatchObject({
      code: 'fs_disabled',
    });
  });

  it('reads and returns the file at path, resolved against root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diagrammar-fs-'));
    await writeFile(join(root, 'x.yaml'), 'diagrammar: 1\n', 'utf8');
    const result = await resolveSource({ root, noFs: false }, { path: 'x.yaml' });
    expect(result.text).toBe('diagrammar: 1\n');
    expect(result.resolvedPath).toBe(join(root, 'x.yaml'));
    await rm(root, { recursive: true, force: true });
  });
});
