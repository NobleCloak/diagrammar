import { describe, expect, it } from 'vitest';
import { memoryResolver } from '../assets/resolver.js';
import { checkThemeRef, parseThemeFile, resolveTheme } from './load.js';

describe('parseThemeFile', () => {
  it('parses a valid theme file into a ResolvedTheme named after the reference', () => {
    const result = parseThemeFile(
      'diagrammar-theme: 1\nbase: mono\npalette:\n  fill: "#eee"\n',
      './themes/house.yaml',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.name).toBe('./themes/house.yaml');
    expect(result.theme.d2ThemeId).toBe(1);
    expect(result.theme.defaults.nodes).toEqual({ fill: '#eee' });
  });

  it('reports schema issues with the theme file’s own line numbers', () => {
    const result = parseThemeFile(
      'diagrammar-theme: 1\nbase: light\npalette:\n  accent: "#000"\n',
      'x.yaml',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: 'palette.accent', message: 'Unrecognized key "accent"', line: 4 },
    ]);
  });

  it('reports a YAML syntax error', () => {
    const result = parseThemeFile('diagrammar-theme: 1\nbase: [\n', 'x.yaml');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe('');
    expect(result.issues[0]?.message.length).toBeGreaterThan(0);
  });

  it('rejects a diagram file handed in as a theme', () => {
    const result = parseThemeFile('diagrammar: 1\ntype: flowchart\n', 'x.yaml');
    expect(result.ok).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('returns the preset for a preset name without touching the resolver', async () => {
    const theme = await resolveTheme('colorblind', undefined);
    expect(theme).toMatchObject({ name: 'colorblind', d2ThemeId: 8 });
  });
  it('rejects an unknown bare name with theme_invalid naming the presets', async () => {
    await expect(resolveTheme('neon', undefined)).rejects.toMatchObject({
      code: 'theme_invalid',
      message: expect.stringContaining('light, dark, colorblind, mono') as string,
    });
  });
  it('rejects a path reference with no resolver with asset_resolver_missing', async () => {
    await expect(resolveTheme('./themes/house.yaml', undefined)).rejects.toMatchObject({
      code: 'asset_resolver_missing',
    });
  });
  it('loads and names a theme file through the resolver', async () => {
    const resolver = memoryResolver({
      'themes/house.yaml': 'diagrammar-theme: 1\nbase: dark\npalette:\n  background: "#000"\n',
    });
    const theme = await resolveTheme('./themes/house.yaml', resolver);
    expect(theme.name).toBe('./themes/house.yaml');
    expect(theme.mode).toBe('dark');
    expect(theme.overrides).toEqual({ N7: '#000' });
  });
  it('wraps theme-file issues into theme_invalid with the file name and line', async () => {
    const resolver = memoryResolver({
      'bad.yaml': 'diagrammar-theme: 1\nbase: light\npalette:\n  accent: "#000"\n',
    });
    await expect(resolveTheme('bad.yaml', resolver)).rejects.toMatchObject({
      code: 'theme_invalid',
      message:
        'theme file "bad.yaml" is invalid: palette.accent: Unrecognized key "accent" (line 4)',
    });
  });
  it('passes resolver errors through unchanged', async () => {
    await expect(resolveTheme('missing.yaml', memoryResolver({}))).rejects.toMatchObject({
      code: 'asset_not_found',
    });
  });
});

describe('checkThemeRef', () => {
  it('returns no issues for a preset or a good file', async () => {
    expect(await checkThemeRef('light', undefined)).toEqual([]);
    const resolver = memoryResolver({ 't.yaml': 'diagrammar-theme: 1\nbase: light\n' });
    expect(await checkThemeRef('t.yaml', resolver)).toEqual([]);
  });
  it('turns a DiagrammarError into one issue at path "theme"', async () => {
    const issues = await checkThemeRef('missing.yaml', memoryResolver({}));
    expect(issues).toEqual([{ path: 'theme', message: 'asset "missing.yaml" not found' }]);
  });
});
