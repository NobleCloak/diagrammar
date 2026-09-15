import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync, unzipSync } from 'fflate';
import { gunzipSync } from 'node:zlib';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAwsIconSet, importAwsZip } from './awsImport.js';

const SVG = (fill: string): string =>
  `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="${fill}"/></svg>`;

function fixtureZip(): Uint8Array {
  return zipSync({
    'Asset-Package_01312026/Architecture-Service-Icons_01312026/Arch_Compute/64/Arch_AWS-Lambda_64.svg':
      strToU8(SVG('#f90')),
    'Asset-Package_01312026/Architecture-Service-Icons_01312026/Arch_Compute/48/Arch_AWS-Lambda_48.svg':
      strToU8(SVG('#f90')),
    'Asset-Package_01312026/Architecture-Service-Icons_01312026/Arch_Compute/64/Arch_AWS-Lambda_64.png':
      new Uint8Array([1, 2, 3]),
    'Asset-Package_01312026/Architecture-Service-Icons_01312026/Arch_Storage/64/Arch_Amazon-Simple-Storage-Service_64.svg':
      strToU8(SVG('#3f8624')),
    'Asset-Package_01312026/Architecture-Service-Icons_01312026/Arch_Storage/64/Arch_AWS-Backup_64.svg':
      strToU8(SVG('#3f8624')),
    'Asset-Package_01312026/Architecture-Service-Icons_01312026/Arch_Analytics/64/Arch_Amazon-Backup_64.svg':
      strToU8(SVG('#8c4fff')),
    'Asset-Package_01312026/Resource-Icons_01312026/Res_Compute/Res_48_Light/Res_AWS-Lambda_Lambda-Function_48_Light.svg':
      strToU8(SVG('#000')),
  });
}

describe('buildAwsIconSet', () => {
  it('selects only Arch_*/64/*.svg entries, derives names and aliases, sanitizes, and counts skips', () => {
    const result = buildAwsIconSet(unzipSync(fixtureZip()), {
      zipName: 'Asset-Package_01312026.zip',
      sha256: 'abc',
    });
    expect(result.index.id).toBe('aws');
    expect(result.index.version).toBe('Asset-Package_01312026.zip');
    expect(result.index.license.spdx).toBe('LicenseRef-AWS-Architecture-Icons');
    // Entries are processed in sorted path order, so Arch_Analytics/Amazon-Backup claims
    // "backup" first and Arch_Storage/AWS-Backup falls back to its full stem.
    expect(result.index.names).toEqual([
      'aws-backup',
      'backup',
      'lambda',
      'simple-storage-service',
    ]);
    expect(result.index.aliases['lambda']).toEqual(['aws-lambda', 'compute']);
    expect(result.index.aliases['simple-storage-service']).toEqual([
      'amazon-simple-storage-service',
      'storage',
    ]);
    expect(result.index.aliases['backup']).toEqual(['amazon-backup', 'analytics']);
    expect(result.index.aliases['aws-backup']).toEqual(['storage']);
    expect(result.icons['lambda']).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#f90"/></svg>',
    );
    expect(result.skipped).toBe(3);
    expect(result.sourceMd).toContain('Asset-Package_01312026.zip');
    expect(result.sourceMd).toContain('abc');
  });
  it('fails with icon_set_invalid when no architecture icons are found', () => {
    expect(() =>
      buildAwsIconSet(unzipSync(zipSync({ 'readme.txt': strToU8('x') })), {
        zipName: 'x.zip',
        sha256: 'a',
      }),
    ).toThrowError(expect.objectContaining({ code: 'icon_set_invalid' }));
  });
});

describe('importAwsZip', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-aws-import-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  it('writes index.json, icons.json.gz and SOURCE.md into --out', async () => {
    const zipPath = join(dir, 'Asset-Package_01312026.zip');
    await writeFile(zipPath, fixtureZip());
    const out = join(dir, 'aws');
    const result = await importAwsZip(zipPath, out);
    expect(result.count).toBe(4);
    const index = JSON.parse(await readFile(join(out, 'index.json'), 'utf8')) as {
      names: string[];
    };
    expect(index.names).toHaveLength(4);
    const icons = JSON.parse(
      gunzipSync(await readFile(join(out, 'icons.json.gz'))).toString('utf8'),
    ) as Record<string, string>;
    expect(Object.keys(icons)).toEqual(index.names);
    await expect(readFile(join(out, 'SOURCE.md'), 'utf8')).resolves.toContain('sha256');
  });
});
