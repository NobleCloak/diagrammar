import { describe, expect, it } from 'vitest';
import { buildTheme } from './build.js';
import { mergeStyle } from './merge.js';
import { presetTheme } from './presets.js';

const theme = buildTheme(
  {
    'diagrammar-theme': 1,
    base: 'light',
    palette: { fill: '#pal', stroke: '#pstroke', edge: '#pedge' },
    defaults: {
      nodes: { fill: '#fam', strokeWidth: 2 },
      shapes: { cylinder: { fill: '#kind' } },
      participants: { bold: true },
      kinds: { database: { fill: '#dbkind' } },
      messages: { return: { fontColor: '#ret' } },
    },
  },
  'x.yaml',
);

describe('mergeStyle precedence (spec §4.3)', () => {
  it('returns own by identity when there is no theme', () => {
    const own = { fill: '#own' };
    expect(mergeStyle(undefined, { family: 'node', shape: 'rect' }, own)).toBe(own);
    expect(mergeStyle(undefined, { family: 'edge' }, undefined)).toBeUndefined();
  });
  it('returns undefined for a preset theme with no own style', () => {
    expect(mergeStyle(presetTheme('dark'), { family: 'group' }, undefined)).toBeUndefined();
  });
  it('own > per-kind > family (palette already folded into family)', () => {
    expect(mergeStyle(theme, { family: 'node', shape: 'rect' }, undefined)).toEqual({
      fill: '#fam',
      stroke: '#pstroke',
      strokeWidth: 2,
    });
    expect(mergeStyle(theme, { family: 'node', shape: 'cylinder' }, undefined)).toEqual({
      fill: '#kind',
      stroke: '#pstroke',
      strokeWidth: 2,
    });
    expect(mergeStyle(theme, { family: 'node', shape: 'cylinder' }, { fill: '#own' })).toEqual({
      fill: '#own',
      stroke: '#pstroke',
      strokeWidth: 2,
    });
  });
  it('resolves participants by kind and messages by message style', () => {
    expect(mergeStyle(theme, { family: 'participant', kind: 'database' }, undefined)).toEqual({
      fill: '#dbkind',
      stroke: '#pstroke',
      bold: true,
    });
    expect(mergeStyle(theme, { family: 'participant', kind: 'actor' }, undefined)).toEqual({
      fill: '#pal',
      stroke: '#pstroke',
      bold: true,
    });
    expect(
      mergeStyle(theme, { family: 'message', messageStyle: 'return' }, { dashed: true }),
    ).toEqual({
      stroke: '#pedge',
      fontColor: '#ret',
      dashed: true,
    });
    expect(mergeStyle(theme, { family: 'message', messageStyle: 'sync' }, undefined)).toEqual({
      stroke: '#pedge',
    });
  });
  it('returns undefined when every layer is empty', () => {
    const bare = buildTheme({ 'diagrammar-theme': 1, base: 'light' }, 'x.yaml');
    expect(mergeStyle(bare, { family: 'edge' }, undefined)).toBeUndefined();
  });
});
