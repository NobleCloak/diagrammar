import { describe, it, expect } from 'vitest';
import type { LaidOutDiagram } from '../engine/types.js';
import type { GraphDiagram } from '../model/types.js';
import type { KeyMap } from './types.js';
import type { TextMetrics } from './text.js';
import { placeNotes } from './notes.js';

function keyMapFor(shapeIds: Record<string, string>): KeyMap {
  return { shapeKey: (id) => shapeIds[id], connectionKey: () => undefined };
}

const fixedWidthMetrics: TextMetrics = {
  measure: (text) => text.length * 6,
  wrap: (text) => [text],
};

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

describe('placeNotes', () => {
  it('places an anchored note beside its target on the requested side', () => {
    const model = baseModel({
      notes: [
        {
          kind: 'note',
          key: 'n1',
          id: 'n1',
          at: 'check',
          side: 'right',
          width: 100,
          text: 'one line',
        },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 40, height: 20, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 400, height: 400 },
    };
    const result = placeNotes(
      model,
      laidOut,
      keyMapFor({ check: 'check' }),
      undefined,
      fixedWidthMetrics,
    );
    expect(result.warnings).toEqual([]);
    expect(result.notes).toHaveLength(1);
    const note = result.notes[0]!;
    expect(note.id).toBe('dg-note-1');
    expect(note.key).toBe('n1');
    expect(note.hidden).toBe(false);
    expect(note.lines).toEqual(['one line']);
    // placeBeside(target={x:0,y:0,width:40,height:20}, size={width:100,height:h}, 'right', gap=24)
    // x = 0+40+24 = 64
    expect(note.box.x).toBe(64);
    expect(note.box.width).toBe(100);
    // lines=['one line'] (fixedWidthMetrics.wrap ignores maxWidth); lineHeight(12)=15.6;
    // boxHeight = 1*15.6 + 2*NOTE_PADDING(8) = 31.6; size={width:100,height:31.6}
    // box.y = target.y + target.height/2 - size.height/2 = 0+10-15.8 = -5.8
    // box = {x:64,y:-5.8,width:100,height:31.6}; no other shapes -> pushUntilClear is a no-op
    // boxCenter = {x:64+50=114, y:-5.8+15.8=10}
    // leaderTo = nearestPointOnBox(target={x:0,y:0,width:40,height:20}, {x:114,y:10})
    //   p.x=114 is outside [0,40] -> clamp to 40; p.y=10 is inside [0,20] -> clamp to 10 -> {x:40,y:10}
    // leaderFrom = nearestPointOnBox(box={x:64,y:-5.8,width:100,height:31.6}, leaderTo={x:40,y:10})
    //   p.x=40 is outside [64,164] -> clamp to 64; p.y=10 is inside [-5.8,25.8] -> clamp to 10 -> {x:64,y:10}
    expect(note.leaderTo).toEqual({ x: 40, y: 10 });
    expect(note.leaderFrom).toEqual({ x: 64, y: 10 });
  });

  it('warns and hides a note whose target is not found', () => {
    const model = baseModel({
      notes: [
        { kind: 'note', key: 'n1', id: 'n1', at: 'missing', side: 'right', width: 100, text: 'x' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 10, height: 10 },
    };
    const result = placeNotes(model, laidOut, keyMapFor({}), undefined, fixedWidthMetrics);
    expect(result.notes[0]!.hidden).toBe(true);
    expect(result.warnings).toEqual([
      {
        code: 'note_target_not_found',
        path: 'n1',
        message: 'note target "missing" not found in layout',
      },
    ]);
  });
});

describe('placeNotes — floating, collision, and give-up', () => {
  it('stacks floating notes (no "at") in a column right of the diagram union, top to bottom', () => {
    const model = baseModel({
      notes: [
        { kind: 'note', key: 'f1', id: 'f1', side: 'right', width: 60, text: 'a' },
        { kind: 'note', key: 'f2', id: 'f2', side: 'right', width: 60, text: 'b' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 40, height: 20, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 400, height: 400 },
    };
    const result = placeNotes(
      model,
      laidOut,
      keyMapFor({ check: 'check' }),
      undefined,
      fixedWidthMetrics,
    );
    // diagram union = {x:0,y:0,width:40,height:20}; floating x = 0+40+32=72
    expect(result.notes[0]!.box.x).toBe(72);
    expect(result.notes[1]!.box.x).toBe(72);
    expect(result.notes[1]!.box.y).toBeGreaterThan(result.notes[0]!.box.y);
  });

  it('pushes a note outward when it collides with another shape', () => {
    const model = baseModel({
      nodes: [
        { kind: 'node', id: 'check', label: 'Check', shape: 'rect' },
        { kind: 'node', id: 'blocker', label: 'Blocker', shape: 'rect' },
      ],
      notes: [
        { kind: 'note', key: 'n1', id: 'n1', at: 'check', side: 'right', width: 20, text: 'x' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 10, height: 10, level: 0 },
        // note would naturally land at x = 0+10+24=34, spanning [34,54]; blocker covers that range
        { id: 'blocker', type: 'rectangle', pos: { x: 30, y: 0 }, width: 30, height: 10, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 400, height: 400 },
    };
    const result = placeNotes(
      model,
      laidOut,
      keyMapFor({ check: 'check', blocker: 'blocker' }),
      undefined,
      fixedWidthMetrics,
    );
    expect(result.warnings).toEqual([]);
    // pushed right by one 16px step clears the blocker: 34+16=50, spans [50,70] vs blocker [30,60] -> still overlapping
    // so it keeps stepping; the exact stopping x isn't asserted here, only that it moved and cleared
    expect(result.notes[0]!.box.x).toBeGreaterThan(34);
  });

  it('emits a note_overlap warning when it cannot clear obstacles within 8 steps', () => {
    const model = baseModel({
      nodes: [
        { kind: 'node', id: 'check', label: 'Check', shape: 'rect' },
        { kind: 'node', id: 'wall', label: 'Wall', shape: 'rect' },
      ],
      notes: [
        { kind: 'note', key: 'n1', id: 'n1', at: 'check', side: 'right', width: 20, text: 'x' },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 10, height: 10, level: 0 },
        // an effectively unbounded wall the note can never clear by pushing right
        {
          id: 'wall',
          type: 'rectangle',
          pos: { x: 20, y: 0 },
          width: 100000,
          height: 10,
          level: 0,
        },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 400, height: 400 },
    };
    const result = placeNotes(
      model,
      laidOut,
      keyMapFor({ check: 'check', wall: 'wall' }),
      undefined,
      fixedWidthMetrics,
    );
    expect(result.warnings).toEqual([
      {
        code: 'note_overlap',
        path: 'n1',
        message: 'note "n1" could not be placed clear of other shapes',
      },
    ]);
  });
});

describe('placeNotes — views', () => {
  it('hides a note whose target is out of focus for the requested view', () => {
    const model = baseModel({
      notes: [
        { kind: 'note', key: 'n1', id: 'n1', at: 'check', side: 'right', width: 60, text: 'x' },
      ],
      views: [{ id: 'happy', focus: ['other'] }],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 40, height: 20, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 400, height: 400 },
    };
    const result = placeNotes(
      model,
      laidOut,
      keyMapFor({ check: 'check' }),
      'happy',
      fixedWidthMetrics,
    );
    expect(result.notes[0]!.hidden).toBe(true);
  });
});

describe('placeNotes — origin translation', () => {
  it('adds a nonzero laidOut.origin to the target shape position before placing an anchored note', () => {
    const model = baseModel({
      notes: [
        {
          kind: 'note',
          key: 'n1',
          id: 'n1',
          at: 'check',
          side: 'right',
          width: 100,
          text: 'one line',
        },
      ],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 40, height: 20, level: 0 },
      ],
      connections: [],
      // origin like Plan 01's spike recorded for a real dagre render.
      origin: { x: -15, y: -19 },
      viewBox: { x: 0, y: 0, width: 400, height: 400 },
    };
    const result = placeNotes(
      model,
      laidOut,
      keyMapFor({ check: 'check' }),
      undefined,
      fixedWidthMetrics,
    );
    // target box translates to {x:-15,y:-19,width:40,height:20};
    // placeBeside(..., 'right', gap=24): x = -15+40+24 = 49
    expect(result.notes[0]!.box.x).toBe(49);
  });
});
