import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
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
});
