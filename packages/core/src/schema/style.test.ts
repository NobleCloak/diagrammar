import { describe, expect, it } from 'vitest';
import { StyleSchema } from './style.js';

describe('StyleSchema', () => {
  it('accepts the full style subset', () => {
    const result = StyleSchema.safeParse({
      fill: '#eef',
      stroke: '#000',
      strokeWidth: 2,
      dashed: true,
      bold: false,
      italic: true,
      fontColor: '#333',
      opacity: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object', () => {
    expect(StyleSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    const result = StyleSchema.safeParse({ fill: '#fff', engineOnly: true });
    expect(result.success).toBe(false);
  });

  it('rejects wrong types', () => {
    const result = StyleSchema.safeParse({ dashed: 'yes' });
    expect(result.success).toBe(false);
  });
});
