import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './describe.js';

describe('describe command', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-describe-cmd-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('prints a JSON description including hash, type, and valid', async () => {
    const file = join(dir, 'f.yaml');
    await writeFile(
      file,
      'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\n',
      'utf8',
    );
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await run([file, '--json']);
    expect(code).toBe(0);
    const printed = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as {
      type: string;
      valid: boolean;
      hash: string;
    };
    expect(printed.type).toBe('flowchart');
    expect(printed.valid).toBe(true);
    expect(typeof printed.hash).toBe('string');
  });

  it('returns 1 when no file is given', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('returns 1 and reports a readable message when the file does not exist', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([join(dir, 'missing.yaml')]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });
});
