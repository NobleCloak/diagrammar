import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
