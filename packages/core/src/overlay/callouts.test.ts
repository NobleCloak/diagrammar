import { describe, it, expect } from 'vitest';
import type { LaidOutDiagram } from '../engine/types.js';
import type { GraphDiagram } from '../model/types.js';
import type { KeyMap } from './types.js';
import { placeCallouts } from './callouts.js';

function keyMapFor(shapeIds: Record<string, string>): KeyMap {
  return {
    shapeKey: (d2Id) => shapeIds[d2Id],
    connectionKey: () => undefined,
  };
}

function baseModel(overrides: Partial<GraphDiagram> = {}): GraphDiagram {
  return {
    version: 1,
    type: 'flowchart',
    theme: 'light',
    layout: 'dagre',
    direction: 'down',
    notes: [],
    callouts: [],
    views: [],
    groups: [],
    nodes: [{ kind: 'node', id: 'check', label: 'Check stock', shape: 'rect' }],
    edges: [],
    ...overrides,
  };
}

describe('placeCallouts', () => {
  it('anchors a node-target badge at the top-right corner', () => {
    const model = baseModel({
      callouts: [
        { kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1, text: 'Happy path' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 100, y: 50 }, width: 80, height: 40, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 200, height: 200 },
    };
    const keyMap = keyMapFor({ check: 'check' });
    const result = placeCallouts(model, laidOut, keyMap, undefined);
    expect(result.warnings).toEqual([]);
    expect(result.badges).toHaveLength(1);
    // center at (x+width, y) = (100+80, 50) = (180, 50)
    expect(result.badges[0]).toEqual({
      id: 'dg-callout-1',
      key: 'c1',
      number: 1,
      center: { x: 180, y: 50 },
      text: 'Happy path',
      targetKey: 'check',
      hidden: false,
    });
    expect(result.legend).toEqual([{ number: 1, text: 'Happy path' }]);
  });

  it('warns and skips a callout whose target is not found in the layout', () => {
    const model = baseModel({
      callouts: [{ kind: 'callout', key: 'c1', id: 'c1', at: 'missing', number: 1, text: 'x' }],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 10, height: 10 },
    };
    const result = placeCallouts(model, laidOut, keyMapFor({}), undefined);
    expect(result.badges).toEqual([]);
    expect(result.warnings).toEqual([
      {
        code: 'callout_target_not_found',
        path: 'c1',
        message: 'callout target "missing" not found in layout',
      },
    ]);
  });
});

describe('placeCallouts — edges, stacking, views', () => {
  it('anchors an edge-target badge at the route midpoint, offset clear of the D2 edge label', () => {
    const model = baseModel({
      edges: [{ kind: 'edge', key: 'yes', id: 'yes', from: 'check', to: 'ship' }],
      callouts: [
        { kind: 'callout', key: 'c1', id: 'c1', at: 'yes', number: 1, text: 'edge callout' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [],
      connections: [
        {
          id: '(check -> ship)[0]',
          src: 'check',
          dst: 'ship',
          // length 6 then 14, midpoint at (6,4) per geometry.test.ts's polylineMidpoint case
          route: [
            { x: 0, y: 0 },
            { x: 6, y: 0 },
            { x: 6, y: 14 },
          ],
        },
      ],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const keyMap: KeyMap = { shapeKey: () => undefined, connectionKey: () => 'yes' };
    const result = placeCallouts(model, laidOut, keyMap, undefined);
    // Raw midpoint is (6,4) (per geometry.test.ts's polylineMidpoint case).
    // D2 always draws the edge label as horizontal text centered on the
    // route's own coordinate regardless of the segment's orientation, so the
    // badge offsets straight down by BADGE_CLEARANCE (11+4=15) rather than
    // perpendicular to the segment: (6, 4+15) = (6, 19).
    expect(result.badges[0]!.center).toEqual({ x: 6, y: 19 });
  });

  it("offsets a horizontal-segment edge-target badge downward too, below D2's own edge label", () => {
    const model = baseModel({
      edges: [{ kind: 'edge', key: 'yes', id: 'yes', from: 'check', to: 'ship' }],
      callouts: [
        { kind: 'callout', key: 'c1', id: 'c1', at: 'yes', number: 1, text: 'edge callout' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [],
      connections: [
        {
          id: '(check -> ship)[0]',
          src: 'check',
          dst: 'ship',
          // a single horizontal segment: midpoint is (10, 0)
          route: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
          ],
        },
      ],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const keyMap: KeyMap = { shapeKey: () => undefined, connectionKey: () => 'yes' };
    const result = placeCallouts(model, laidOut, keyMap, undefined);
    // Raw midpoint (0,0)->(20,0) is (10,0); offset straight down by
    // BADGE_CLEARANCE (15) regardless of the segment being horizontal:
    // (10, 0+15) = (10, 15).
    expect(result.badges[0]!.center).toEqual({ x: 10, y: 15 });
  });

  it('stacks multiple callouts on one target left to right in number order', () => {
    const model = baseModel({
      callouts: [
        { kind: 'callout', key: 'c2', id: 'c2', at: 'check', number: 2, text: 'second' },
        { kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1, text: 'first' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 20, height: 10, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const result = placeCallouts(model, laidOut, keyMapFor({ check: 'check' }), undefined);
    const byNumber = [...result.badges].sort((a, b) => a.number - b.number);
    // anchor = (20, 0); spacing = 2*11+4=26
    expect(byNumber.map((b) => b.center)).toEqual([
      { x: 20, y: 0 },
      { x: 46, y: 0 },
    ]);
    expect(result.legend.map((l) => l.number)).toEqual([1, 2]);
  });

  it('hides a badge whose target is out of focus for the requested view', () => {
    const model = baseModel({
      callouts: [{ kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1, text: 'x' }],
      views: [{ id: 'happy', focus: ['other'] }],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 20, height: 10, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const result = placeCallouts(model, laidOut, keyMapFor({ check: 'check' }), 'happy');
    expect(result.badges[0]!.hidden).toBe(true);
    expect(result.legend).toEqual([]);
  });

  it('gives a badge with no text and no legend entry when the callout omits text', () => {
    const model = baseModel({
      callouts: [{ kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1 }],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 20, height: 10, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const result = placeCallouts(model, laidOut, keyMapFor({ check: 'check' }), undefined);
    expect(result.badges[0]!.text).toBeUndefined();
    expect(result.legend).toEqual([]);
  });

  it('adds a nonzero laidOut.origin to a node-target shape position before anchoring the badge', () => {
    // origin like Plan 01's spike recorded for a real dagre render (inner
    // viewBox at x=15,y=19 -> origin={x:-15,y:-19}).
    const model = baseModel({
      callouts: [{ kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1, text: 'x' }],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 100, y: 50 }, width: 80, height: 40, level: 0 },
      ],
      connections: [],
      origin: { x: -15, y: -19 },
      viewBox: { x: 0, y: 0, width: 200, height: 200 },
    };
    const result = placeCallouts(model, laidOut, keyMapFor({ check: 'check' }), undefined);
    // center = (pos.x + origin.x + width, pos.y + origin.y) = (100-15+80, 50-19) = (165, 31)
    expect(result.badges[0]!.center).toEqual({ x: 165, y: 31 });
  });

  it('adds a nonzero laidOut.origin to every point of an edge-target route before computing the midpoint', () => {
    const model = baseModel({
      edges: [{ kind: 'edge', key: 'yes', id: 'yes', from: 'check', to: 'ship' }],
      callouts: [
        { kind: 'callout', key: 'c1', id: 'c1', at: 'yes', number: 1, text: 'edge callout' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [],
      connections: [
        {
          id: '(check -> ship)[0]',
          src: 'check',
          dst: 'ship',
          // same shape as the zero-origin midpoint test above (midpoint (6,4)
          // before translation); origin shifts every point, and therefore the
          // midpoint, by the same amount.
          route: [
            { x: 0, y: 0 },
            { x: 6, y: 0 },
            { x: 6, y: 14 },
          ],
        },
      ],
      origin: { x: 100, y: 200 },
      viewBox: { x: 0, y: 0, width: 400, height: 400 },
    };
    const keyMap: KeyMap = { shapeKey: () => undefined, connectionKey: () => 'yes' };
    const result = placeCallouts(model, laidOut, keyMap, undefined);
    // Translated route: (100,200) -> (106,200) -> (106,214); same shape as
    // the zero-origin case, so raw midpoint is (106, 204). Offset straight
    // down by BADGE_CLEARANCE (15): (106, 204+15) = (106, 219).
    expect(result.badges[0]!.center).toEqual({ x: 106, y: 219 });
  });
});
