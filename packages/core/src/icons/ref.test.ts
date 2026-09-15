import { describe, expect, it } from 'vitest';
import { isIconPathRef, parseIconRef } from './ref.js';

describe('isIconPathRef', () => {
  it('is true only for .svg references', () => {
    expect(isIconPathRef('./icons/custom.svg')).toBe(true);
    expect(isIconPathRef('icons/custom.SVG')).toBe(true);
    expect(isIconPathRef('lucide/database')).toBe(false);
  });
});

describe('parseIconRef', () => {
  it('parses the set form', () => {
    expect(parseIconRef('lucide/database')).toEqual({
      kind: 'set',
      set: 'lucide',
      name: 'database',
    });
    expect(parseIconRef('simple-icons/postgresql')).toEqual({
      kind: 'set',
      set: 'simple-icons',
      name: 'postgresql',
    });
    expect(parseIconRef('aws/lambda')).toEqual({ kind: 'set', set: 'aws', name: 'lambda' });
  });
  it('parses the path form (anything ending in .svg)', () => {
    expect(parseIconRef('./icons/custom.svg')).toEqual({
      kind: 'path',
      path: './icons/custom.svg',
    });
    expect(parseIconRef('../shared/x.svg')).toEqual({ kind: 'path', path: '../shared/x.svg' });
  });
  it.each(['database', 'Lucide/database', 'lucide/', '/lucide/x', 'lucide/a/b', 'a b/c', ''])(
    'rejects %s with icon_invalid',
    (ref) => {
      expect(() => parseIconRef(ref)).toThrowError(
        expect.objectContaining({ code: 'icon_invalid' }),
      );
    },
  );
  it('rejects a malformed .svg path with icon_invalid', () => {
    expect(() => parseIconRef('/abs/x.svg')).toThrowError(
      expect.objectContaining({ code: 'icon_invalid' }),
    );
    expect(() => parseIconRef('a\\b.svg')).toThrowError(
      expect.objectContaining({ code: 'icon_invalid' }),
    );
  });
});
