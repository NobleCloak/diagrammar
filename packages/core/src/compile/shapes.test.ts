import { describe, it, expect } from 'vitest';
import { d2ShapeFor, d2ShapeForParticipant } from './shapes.js';
import type { GraphShape, ParticipantKind } from '../model/types.js';

describe('d2ShapeFor', () => {
  const cases: Array<[GraphShape, string]> = [
    ['oval', 'oval'],
    ['rect', 'rectangle'],
    ['diamond', 'diamond'],
    ['document', 'document'],
    ['parallelogram', 'parallelogram'],
    ['hexagon', 'hexagon'],
    ['cylinder', 'cylinder'],
    ['queue', 'queue'],
    ['cloud', 'cloud'],
    ['person', 'person'],
    ['package', 'package'],
  ];

  for (const [shape, expected] of cases) {
    it(`maps ${shape} to ${expected}`, () => {
      expect(d2ShapeFor(shape)).toBe(expected);
    });
  }
});

describe('d2ShapeForParticipant', () => {
  const cases: Array<[ParticipantKind, string]> = [
    ['actor', 'person'],
    ['service', 'rectangle'],
    ['database', 'cylinder'],
    ['queue', 'queue'],
  ];

  for (const [kind, expected] of cases) {
    it(`maps ${kind} to ${expected}`, () => {
      expect(d2ShapeForParticipant(kind)).toBe(expected);
    });
  }
});
