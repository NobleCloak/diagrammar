import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultIconRegistry, registryWithDirs } from './icons.js';

describe('defaultIconRegistry', () => {
  it('registers lucide and simple-icons', () => {
    expect(
      defaultIconRegistry()
        .sets()
        .map((s) => s.id),
    ).toEqual(['lucide', 'simple-icons']);
  });
});

describe('registryWithDirs', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-mcp-icons-'));
    await writeFile(
      join(dir, 'index.json'),
      JSON.stringify({
        'diagrammar-icons': 1,
        id: 'aws',
        version: 'test',
        license: { spdx: 'LicenseRef-AWS', url: 'https://aws.amazon.com/architecture/icons/' },
        names: ['lambda'],
        aliases: {},
      }),
    );
    await writeFile(
      join(dir, 'icons.json.gz'),
      gzipSync(
        Buffer.from(
          JSON.stringify({ lambda: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>' }),
        ),
      ),
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  it('adds a directory set after the defaults', async () => {
    const r = registryWithDirs([dir]);
    expect(r.sets().map((s) => s.id)).toEqual(['lucide', 'simple-icons', 'aws']);
    expect((await r.resolve('aws/lambda')).name).toBe('lambda');
  });
  it('rejects a directory without index.json with icon_set_invalid', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'diagrammar-mcp-empty-'));
    try {
      expect(() => registryWithDirs([empty])).toThrowError(
        expect.objectContaining({ code: 'icon_set_invalid' }),
      );
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
