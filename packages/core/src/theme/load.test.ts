import { describe, expect, it } from 'vitest';
import { parseThemeFile } from './load.js';

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
