import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileResolver, memoryResolver } from './resolver.js';

describe('memoryResolver', () => {
  it('returns the UTF-8 bytes of a known file, keyed by normalized path', async () => {
    const r = memoryResolver({ 'themes/house.yaml': 'base: light\n' });
    const bytes = await r.read('./themes/house.yaml');
    expect(new TextDecoder().decode(bytes)).toBe('base: light\n');
  });
  it('rejects an unknown file with asset_not_found', async () => {
    const r = memoryResolver({});
    await expect(r.read('nope.yaml')).rejects.toMatchObject({ code: 'asset_not_found' });
  });
});

describe('fileResolver', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-resolver-'));
    await mkdir(join(dir, 'root', 'diagrams'), { recursive: true });
    await mkdir(join(dir, 'root', 'themes'), { recursive: true });
    await writeFile(join(dir, 'root', 'themes', 'house.yaml'), 'base: light\n', 'utf8');
    await writeFile(join(dir, 'outside.yaml'), 'base: dark\n', 'utf8');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads relative to baseDir, allowing .. when no root is set', async () => {
    const r = fileResolver(join(dir, 'root', 'diagrams'));
    const bytes = await r.read('../themes/house.yaml');
    expect(new TextDecoder().decode(bytes)).toBe('base: light\n');
  });

  it('allows .. that stays inside root', async () => {
    const r = fileResolver(join(dir, 'root', 'diagrams'), { root: join(dir, 'root') });
    await expect(r.read('../themes/house.yaml')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('rejects a path that escapes root with asset_outside_base', async () => {
    const r = fileResolver(join(dir, 'root', 'diagrams'), { root: join(dir, 'root') });
    await expect(r.read('../../outside.yaml')).rejects.toMatchObject({
      code: 'asset_outside_base',
    });
  });

  it('does not resolve symlinks itself (the MCP jail does)', async () => {
    await symlink(join(dir, 'outside.yaml'), join(dir, 'root', 'themes', 'link.yaml'));
    const r = fileResolver(join(dir, 'root', 'diagrams'), { root: join(dir, 'root') });
    const bytes = await r.read('../themes/link.yaml');
    expect(new TextDecoder().decode(bytes)).toBe('base: dark\n');
  });

  it('surfaces a missing file as asset_not_found', async () => {
    const r = fileResolver(join(dir, 'root', 'diagrams'));
    await expect(r.read('missing.yaml')).rejects.toMatchObject({ code: 'asset_not_found' });
  });

  it('rejects malformed paths before touching the disk', async () => {
    const r = fileResolver(join(dir, 'root'));
    await expect(r.read('/etc/passwd')).rejects.toMatchObject({ code: 'asset_outside_base' });
  });
});
