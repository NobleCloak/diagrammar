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

  it('ThemeSchema accepts light/dark only', () => {
    expect(ThemeSchema.safeParse('light').success).toBe(true);
    expect(ThemeSchema.safeParse('dark').success).toBe(true);
    expect(ThemeSchema.safeParse('solarized').success).toBe(false);
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
