import { afterEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './icons.js';

describe('icons command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('sets lists the bundled sets with license and count', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run(['sets', '--json'])).toBe(0);
    const printed = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      id: string;
      count: number;
      license: { spdx: string };
    }[];
    expect(printed.map((s) => s.id)).toEqual(['lucide', 'simple-icons']);
    expect(printed[0]!.count).toBeGreaterThan(1500);
    expect(printed[1]!.license.spdx).toBe('CC0-1.0');
  });
  it('search prints ranked "<set>/<name>" lines', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run(['search', 'database', '--set', 'lucide', '--limit', '3'])).toBe(0);
    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    expect(lines[0]).toBe('lucide/database');
    expect(lines).toHaveLength(3);
  });
  it('search --json returns the match objects', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run(['search', 'postgres', '--json'])).toBe(0);
    const printed = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      set: string;
      name: string;
      rank: number;
    }[];
    expect(printed[0]).toEqual({ set: 'simple-icons', name: 'postgresql', rank: 2 });
  });
  it('rejects a missing query, an unknown set, and an unknown subcommand with exit 1', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run(['search'])).toBe(1);
    expect(await run(['search', 'x', '--set', 'nope'])).toBe(1);
    expect(await run(['frobnicate'])).toBe(1);
    expect(await run([])).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });
  it('import aws builds a set directory that search can use via --icons', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diagrammar-icons-cmd-'));
    try {
      const zipPath = join(dir, 'Asset-Package_test.zip');
      await writeFile(
        zipPath,
        zipSync({
          'A/Architecture-Service-Icons_x/Arch_Compute/64/Arch_AWS-Lambda_64.svg': strToU8(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>',
          ),
        }),
      );
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(await run(['import', 'aws', zipPath, '--out', join(dir, 'aws')])).toBe(0);
      expect(String(logSpy.mock.calls[0]?.[0])).toContain('wrote 1 icons');
      logSpy.mockClear();
      expect(await run(['search', 'lambda', '--icons', join(dir, 'aws')])).toBe(0);
      expect(logSpy.mock.calls.map((c) => String(c[0]))).toContain('aws/lambda');
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(await run(['import', 'aws', join(dir, 'missing.zip'), '--out', join(dir, 'x')])).toBe(
        1,
      );
      expect(errSpy.mock.calls.flat().join('\n')).toContain('file not found');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
