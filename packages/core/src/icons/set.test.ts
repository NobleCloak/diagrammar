import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryIconSet, openIconSetDir, svgDataUri } from './set.js';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>';

describe('svgDataUri', () => {
  it('base64-encodes as an svg+xml data URI', () => {
    expect(svgDataUri('<svg/>')).toBe(
      `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
    );
  });
});

describe('memoryIconSet', () => {
  it('serves names sorted, aliases, and svgs after load', async () => {
    const set = memoryIconSet('t', { zeta: SVG, alpha: SVG }, { alpha: ['first'] });
    expect(set.id).toBe('t');
    expect(set.get('alpha')).toBeUndefined();
    await set.load();
    expect(set.names()).toEqual(['alpha', 'zeta']);
    expect(set.get('alpha')).toBe(SVG);
    expect(set.aliases('alpha')).toEqual(['first']);
    expect(set.aliases('zeta')).toEqual([]);
  });
});

describe('openIconSetDir', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-iconset-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeSet(
    names: Record<string, string>,
    aliases: Record<string, string[]> = {},
  ): Promise<void> {
    await writeFile(
      join(dir, 'index.json'),
      JSON.stringify({
        'diagrammar-icons': 1,
        id: 'demo',
        version: '1.2.3',
        license: { spdx: 'MIT', url: 'https://example.test/license' },
        names: Object.keys(names).sort(),
        aliases,
      }),
    );
    await writeFile(join(dir, 'icons.json.gz'), gzipSync(Buffer.from(JSON.stringify(names))));
  }

  it('reads metadata synchronously and icons lazily from icons.json.gz', async () => {
    await writeSet({ box: SVG, disc: SVG }, { disc: ['database'] });
    const set = openIconSetDir(dir);
    expect(set.id).toBe('demo');
    expect(set.version).toBe('1.2.3');
    expect(set.license.spdx).toBe('MIT');
    expect(set.names()).toEqual(['box', 'disc']);
    expect(set.get('box')).toBeUndefined();
    await set.load();
    await set.load();
    expect(set.get('box')).toBe(SVG);
    expect(set.aliases('disc')).toEqual(['database']);
  });

  it('throws icon_set_invalid when index.json is missing or malformed', async () => {
    expect(() => openIconSetDir(dir)).toThrowError(
      expect.objectContaining({ code: 'icon_set_invalid' }),
    );
    await writeFile(join(dir, 'index.json'), '{"id":"x"}');
    expect(() => openIconSetDir(dir)).toThrowError(
      expect.objectContaining({ code: 'icon_set_invalid' }),
    );
  });

  it('names the bad field when index.json fails schema validation', async () => {
    await writeFile(
      join(dir, 'index.json'),
      JSON.stringify({
        'diagrammar-icons': 1,
        id: 'demo',
        version: '1.2.3',
        license: { spdx: 'MIT', url: 'https://example.test/license' },
        names: 'not-an-array',
        aliases: {},
      }),
    );
    expect(() => openIconSetDir(dir)).toThrowError(
      expect.objectContaining({
        code: 'icon_set_invalid',
        message: expect.stringContaining('names') as string,
      }),
    );
  });

  it('rejects at load() when icons.json.gz is missing', async () => {
    await writeSet({});
    await rm(join(dir, 'icons.json.gz'));
    const set = openIconSetDir(dir);
    await expect(set.load()).rejects.toMatchObject({ code: 'icon_set_invalid' });
  });

  it('sanitizes icons lazily in get(): a bad icon throws icon_invalid, a clean sibling still resolves', async () => {
    await writeSet({
      evil: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><script/></svg>',
      box: SVG,
    });
    const set = openIconSetDir(dir);
    await set.load();
    expect(() => set.get('evil')).toThrowError(expect.objectContaining({ code: 'icon_invalid' }));
    expect(set.get('box')).toBe(SVG);
  });

  it('memoizes a sanitized icon: repeated get() calls return the same value without re-throwing', async () => {
    await writeSet({ box: SVG });
    const set = openIconSetDir(dir);
    await set.load();
    const first = set.get('box');
    const second = set.get('box');
    expect(first).toBe(SVG);
    expect(second).toBe(first);
  });

  it('does not resolve prototype-chain keys as icons', async () => {
    await writeSet({ box: SVG });
    const set = openIconSetDir(dir);
    await set.load();
    expect(set.get('constructor')).toBeUndefined();
    expect(set.aliases('constructor')).toEqual([]);
  });
});
