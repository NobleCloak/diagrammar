import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from './themes.js';

describe('themes command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the four presets with their D2 base and mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run(['list'])).toBe(0);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('light');
    expect(out).toContain('colorblind');
    expect(out).toContain('D2 "Colorblind clear"');
    expect(out).toContain('dark');
  });

  it('prints presets as JSON with --json', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run(['list', '--json'])).toBe(0);
    const printed = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { name: string }[];
    expect(printed.map((p) => p.name)).toEqual(['light', 'dark', 'colorblind', 'mono']);
  });

  it('rejects a missing or unknown subcommand with exit 1', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run([])).toBe(1);
    expect(await run(['frobnicate'])).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });
});
