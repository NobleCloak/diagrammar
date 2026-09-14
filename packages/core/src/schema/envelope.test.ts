import { describe, expect, it } from 'vitest';
import {
  DiagramTypeSchema,
  DirectionSchema,
  IdSchema,
  LayoutEngineSchema,
  ThemeSchema,
} from './envelope.js';

describe('envelope enums', () => {
  it('DiagramTypeSchema accepts the three families', () => {
    expect(DiagramTypeSchema.safeParse('flowchart').success).toBe(true);
    expect(DiagramTypeSchema.safeParse('architecture').success).toBe(true);
    expect(DiagramTypeSchema.safeParse('sequence').success).toBe(true);
    expect(DiagramTypeSchema.safeParse('gantt').success).toBe(false);
  });

  it('DirectionSchema accepts the four directions and rejects others', () => {
    for (const value of ['down', 'right', 'up', 'left']) {
      expect(DirectionSchema.safeParse(value).success).toBe(true);
    }
    expect(DirectionSchema.safeParse('north').success).toBe(false);
  });

  it('LayoutEngineSchema accepts dagre/elk/tala only', () => {
    for (const value of ['dagre', 'elk', 'tala']) {
      expect(LayoutEngineSchema.safeParse(value).success).toBe(true);
    }
    expect(LayoutEngineSchema.safeParse('graphviz').success).toBe(false);
  });
});

describe('ThemeSchema (spec §3.1)', () => {
  it.each(['light', 'dark', 'colorblind', 'mono'])('accepts preset %s', (name) => {
    expect(ThemeSchema.safeParse(name).success).toBe(true);
  });
  it.each(['./themes/house.yaml', 'house.yml', '../shared/t.yaml'])('accepts path %s', (p) => {
    expect(ThemeSchema.safeParse(p).success).toBe(true);
  });
  it('rejects an unknown bare name with a message naming the presets', () => {
    const result = ThemeSchema.safeParse('neon');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toContain('light, dark, colorblind, mono');
  });
});

describe('IdSchema', () => {
  it('accepts letters, digits, underscore, and hyphen (not leading)', () => {
    for (const value of ['start', 'Check_2', '_private', 'order-fulfilment', 'a1']) {
      expect(IdSchema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects a leading digit', () => {
    expect(IdSchema.safeParse('1start').success).toBe(false);
  });

  it('rejects a leading hyphen', () => {
    expect(IdSchema.safeParse('-start').success).toBe(false);
  });

  it('rejects spaces and dots (would break bare D2 keys, spec 4.1/contract 6)', () => {
    expect(IdSchema.safeParse('order fulfilment').success).toBe(false);
    expect(IdSchema.safeParse('order.fulfilment').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(IdSchema.safeParse('').success).toBe(false);
  });
});
