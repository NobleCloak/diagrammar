import { describe, expect, it } from 'vitest';
import { buildPalette, paletteFamilyStyles, paletteOverrides } from './palette.js';

describe('buildPalette', () => {
  it('copies only defined slots', () => {
    expect(buildPalette({ fill: '#fff', text: undefined })).toEqual({ fill: '#fff' });
  });
});

describe('paletteOverrides (spec §4.2)', () => {
  it('lowers text to N1 and N2, background to N7, nothing else', () => {
    expect(
      paletteOverrides({ text: '#111', background: '#eee', fill: '#f00', edge: '#0f0' }),
    ).toEqual({ N1: '#111', N2: '#111', N7: '#eee' });
  });
  it('is empty for an empty palette', () => {
    expect(paletteOverrides({})).toEqual({});
  });
});

describe('paletteFamilyStyles (spec §4.2)', () => {
  it('lowers fill/stroke to nodes and participants, groupFill/stroke to groups, edge to edges and messages', () => {
    expect(
      paletteFamilyStyles({
        fill: '#f7f8fe',
        stroke: '#0d32b2',
        groupFill: '#eef1fb',
        edge: '#333',
      }),
    ).toEqual({
      nodes: { fill: '#f7f8fe', stroke: '#0d32b2' },
      participants: { fill: '#f7f8fe', stroke: '#0d32b2' },
      groups: { fill: '#eef1fb', stroke: '#0d32b2' },
      edges: { stroke: '#333' },
      messages: { stroke: '#333' },
    });
  });
  it('never lowers text or background to a per-element style', () => {
    expect(paletteFamilyStyles({ text: '#111', background: '#eee' })).toEqual({
      nodes: {},
      participants: {},
      groups: {},
      edges: {},
      messages: {},
    });
  });
});
