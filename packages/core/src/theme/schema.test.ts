import { describe, expect, it } from 'vitest';
import { ThemeFileSchema, generateThemeJsonSchema } from './schema.js';

const VALID = {
  'diagrammar-theme': 1,
  base: 'light',
  palette: { background: '#fff', fill: '#f7f8fe', text: '#0a0f25' },
  defaults: {
    nodes: { strokeWidth: 2 },
    shapes: { cylinder: { fill: '#e8f5e9' } },
    kinds: { database: { fill: '#e8f5e9' } },
    messages: { return: { dashed: true } },
  },
};

describe('ThemeFileSchema', () => {
  it('accepts the spec §4.1 example', () => {
    expect(ThemeFileSchema.safeParse(VALID).success).toBe(true);
  });
  it('requires diagrammar-theme: 1 and a preset base', () => {
    expect(ThemeFileSchema.safeParse({ base: 'light' }).success).toBe(false);
    expect(ThemeFileSchema.safeParse({ 'diagrammar-theme': 1 }).success).toBe(false);
    expect(ThemeFileSchema.safeParse({ 'diagrammar-theme': 1, base: './other.yaml' }).success).toBe(
      false,
    );
  });
  it('is strict at every level', () => {
    expect(ThemeFileSchema.safeParse({ ...VALID, extra: 1 }).success).toBe(false);
    expect(
      ThemeFileSchema.safeParse({ ...VALID, palette: { ...VALID.palette, accent: '#000' } })
        .success,
    ).toBe(false);
    expect(
      ThemeFileSchema.safeParse({ ...VALID, defaults: { shapes: { blob: {} } } }).success,
    ).toBe(false);
    expect(
      ThemeFileSchema.safeParse({ ...VALID, defaults: { nodes: { color: 'red' } } }).success,
    ).toBe(false);
  });
});

describe('generateThemeJsonSchema', () => {
  it('produces a draft 2020-12 schema whose required keys are the envelope', () => {
    const schema = generateThemeJsonSchema();
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema['required']).toEqual(['diagrammar-theme', 'base']);
  });
});
