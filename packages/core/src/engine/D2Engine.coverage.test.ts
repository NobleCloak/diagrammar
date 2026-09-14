import { describe, expect, it } from 'vitest';
import { computeViewBox, computeOrigin } from './D2Engine.js';
import { findPackageRoot } from './fonts.js';
import { DiagrammarError } from '../errors.js';

describe('D2Engine coverage for uncovered branches', () => {
  describe('computeViewBox', () => {
    it('throws DiagrammarError when SVG has no root viewBox', () => {
      const svgNoViewBox = '<svg><rect/></svg>';
      try {
        computeViewBox(svgNoViewBox);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DiagrammarError);
        expect(error instanceof DiagrammarError && error.code === 'engine').toBe(true);
      }
    });
  });

  describe('computeOrigin', () => {
    it('throws a DiagrammarError when the SVG has only one <svg> element', () => {
      const svgSingle = '<svg viewBox="0 0 100 100"><rect/></svg>';
      try {
        computeOrigin(svgSingle);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DiagrammarError);
        expect(error instanceof DiagrammarError && error.code === 'engine').toBe(true);
      }
    });

    it('throws a DiagrammarError when outer and inner viewBox sizes differ', () => {
      const svgMismatchedSize = `<svg viewBox="0 0 200 200">
        <svg viewBox="10 20 100 100"/>
      </svg>`;
      try {
        computeOrigin(svgMismatchedSize);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DiagrammarError);
        expect(error instanceof DiagrammarError && error.code === 'engine').toBe(true);
      }
    });

    it('returns the negated inner viewBox origin when outer and inner sizes match', () => {
      const svgMatchingSize = `<svg viewBox="0 0 200 200">
        <svg viewBox="10 20 200 200"/>
      </svg>`;
      const result = computeOrigin(svgMatchingSize);
      expect(result).toEqual({ x: -10, y: -20 });
    });
  });
});

describe('fonts coverage for uncovered branches', () => {
  describe('findPackageRoot', () => {
    it('throws when starting from a path with no package.json above it', () => {
      // Use the filesystem root as the start point
      const rootPath = '/';
      expect(() => findPackageRoot(rootPath)).toThrow('Could not locate package.json above');
    });
  });
});
