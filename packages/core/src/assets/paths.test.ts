import { describe, expect, it } from 'vitest';
import { isPathRef, normalizeRelativePath } from './paths.js';

describe('isPathRef', () => {
  it('treats a bare name as a preset reference', () => {
    expect(isPathRef('light')).toBe(false);
    expect(isPathRef('colorblind')).toBe(false);
  });
  it('treats anything with a slash or a yaml extension as a path', () => {
    expect(isPathRef('./themes/house.yaml')).toBe(true);
    expect(isPathRef('themes/house.yml')).toBe(true);
    expect(isPathRef('house.yaml')).toBe(true);
    expect(isPathRef('house.YML')).toBe(true);
  });
});

describe('normalizeRelativePath', () => {
  it('collapses . segments and joins with /', () => {
    expect(normalizeRelativePath('./themes/./house.yaml')).toBe('themes/house.yaml');
  });
  it("keeps .. that climbs above the base (containment is the resolver's job)", () => {
    expect(normalizeRelativePath('../shared/house.yaml')).toBe('../shared/house.yaml');
    expect(normalizeRelativePath('a/../../b.yaml')).toBe('../b.yaml');
  });
  it.each([
    ['/etc/house.yaml', 'absolute'],
    ['C:/themes/house.yaml', 'drive letter'],
    ['themes\\house.yaml', 'backslash'],
    ['themes/hou\0se.yaml', 'null byte'],
    ['', 'empty'],
    ['.', 'no file segment'],
  ])('rejects %s (%s) with asset_outside_base', (input) => {
    expect(() => normalizeRelativePath(input)).toThrowError(
      expect.objectContaining({ code: 'asset_outside_base' }),
    );
  });
});
