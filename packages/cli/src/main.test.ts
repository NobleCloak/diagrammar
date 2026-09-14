import { describe, it, expect, vi, afterEach } from 'vitest';
import { main } from './main.js';

describe('cli dispatcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints top-level help to stderr and returns 1 when no command is given (M13: failure-path usage on stderr)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main([]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('diagrammar <command> [options]'));
    const printed = String(errSpy.mock.calls[0]![0]);
    expect(printed).toContain('render <files...>');
    expect(printed).toContain('validate <files...>');
    expect(printed).toContain('new <file>');
    expect(printed).toContain('describe <file>');
    expect(printed).toContain('edit <file>');
    expect(printed).toContain('mcp');
    expect(printed).toContain('Run "diagrammar <command> --help" for command-specific options.');
  });

  it('prints top-level help and returns 0 for --help', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await main(['--help']);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('diagrammar <command> [options]'));
    const printed = String(logSpy.mock.calls[0]![0]);
    expect(printed).toContain('render <files...>');
    expect(printed).toContain('validate <files...>');
    expect(printed).toContain('new <file>');
    expect(printed).toContain('describe <file>');
    expect(printed).toContain('edit <file>');
    expect(printed).toContain('mcp');
    expect(printed).toContain('Run "diagrammar <command> --help" for command-specific options.');
  });

  it('returns 1 and prints an error and usage (both to stderr) for an unknown command', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await main(['nope']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith('Unknown command: nope');
    expect(
      errSpy.mock.calls.some((c) => String(c[0]).includes('diagrammar <command> [options]')),
    ).toBe(true);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('dispatches --help to a registered command', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await main(['validate', '--help']);
    expect(code).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('diagrammar validate'));
  });
});
