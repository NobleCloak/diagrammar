import { describe, expect, it } from 'vitest';
import { buildTheme } from './build.js';

describe('buildTheme', () => {
  it('folds the palette under the family defaults, file defaults winning per key', () => {
    const theme = buildTheme(
      {
        'diagrammar-theme': 1,
        base: 'dark',
        palette: {
          fill: '#111',
          stroke: '#222',
          groupFill: '#333',
          edge: '#444',
          text: '#eee',
          background: '#000',
        },
        defaults: {
          nodes: { fill: '#999' },
          groups: { dashed: true },
          shapes: { cylinder: { fill: '#e8f5e9' } },
          kinds: { database: { bold: true } },
          messages: { return: { dashed: true } },
        },
      },
      './themes/x.yaml',
    );
    expect(theme.name).toBe('./themes/x.yaml');
    expect(theme.base).toBe('dark');
    expect(theme.mode).toBe('dark');
    expect(theme.d2ThemeId).toBe(200);
    expect(theme.overrides).toEqual({ N1: '#eee', N2: '#eee', N7: '#000' });
    expect(theme.palette.background).toBe('#000');
    expect(theme.defaults.nodes).toEqual({ fill: '#999', stroke: '#222' });
    expect(theme.defaults.groups).toEqual({ fill: '#333', stroke: '#222', dashed: true });
    expect(theme.defaults.edges).toEqual({ stroke: '#444' });
    expect(theme.defaults.participants).toEqual({ fill: '#111', stroke: '#222' });
    expect(theme.defaults.messages).toEqual({ stroke: '#444' });
    expect(theme.defaults.shapes).toEqual({ cylinder: { fill: '#e8f5e9' } });
    expect(theme.defaults.kinds).toEqual({ database: { bold: true } });
    expect(theme.defaults.messageStyles).toEqual({ return: { dashed: true } });
  });

  it('yields empty blocks when palette and defaults are absent', () => {
    const theme = buildTheme({ 'diagrammar-theme': 1, base: 'light' }, 'x.yaml');
    expect(theme.overrides).toEqual({});
    expect(theme.defaults.nodes).toEqual({});
    expect(theme.defaults.shapes).toEqual({});
  });

  it('never carries an undefined-valued key (exactOptionalPropertyTypes)', () => {
    const theme = buildTheme(
      { 'diagrammar-theme': 1, base: 'light', defaults: { nodes: { fill: undefined } } },
      'x.yaml',
    );
    expect(Object.keys(theme.defaults.nodes)).toEqual([]);
  });
});
