import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncPluginVersion } from './sync-plugin-version.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'diagrammar-sync-'));
  await mkdir(path.join(root, 'packages/cli'), { recursive: true });
  await mkdir(path.join(root, 'plugin/.claude-plugin'), { recursive: true });
  await writeFile(
    path.join(root, 'packages/cli/package.json'),
    JSON.stringify({ name: '@noblecloak/diagrammar', version: '0.3.1' }, null, 2) + '\n',
  );
  await writeFile(
    path.join(root, 'plugin/.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'diagrammar', version: '0.2.0', license: 'Apache-2.0' }, null, 2) + '\n',
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('syncPluginVersion', () => {
  it('copies the CLI version into plugin.json, keeping key order and the trailing newline', async () => {
    const result = syncPluginVersion(root);
    expect(result).toEqual({ previous: '0.2.0', current: '0.3.1' });
    const text = await readFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), 'utf8');
    expect(text).toBe(
      JSON.stringify({ name: 'diagrammar', version: '0.3.1', license: 'Apache-2.0' }, null, 2) +
        '\n',
    );
  });

  it('is idempotent', async () => {
    syncPluginVersion(root);
    const before = await readFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), 'utf8');
    expect(syncPluginVersion(root)).toEqual({ previous: '0.3.1', current: '0.3.1' });
    const after = await readFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), 'utf8');
    expect(after).toBe(before);
  });
});
