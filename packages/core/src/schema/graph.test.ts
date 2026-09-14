import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_SHAPES, FLOWCHART_SHAPES } from '../model/types.js';
import { EdgeSchema, GraphFileSchema, GraphShapeSchema, GroupSchema, NodeSchema } from './graph.js';

describe('GraphShapeSchema', () => {
  it('accepts every flowchart and architecture shape', () => {
    for (const shape of [...FLOWCHART_SHAPES, ...ARCHITECTURE_SHAPES]) {
      expect(GraphShapeSchema.safeParse(shape).success).toBe(true);
    }
  });

  it('has no shape beyond the union of FLOWCHART_SHAPES and ARCHITECTURE_SHAPES (drift guard)', () => {
    const known = new Set([...FLOWCHART_SHAPES, ...ARCHITECTURE_SHAPES]);
    expect(new Set(GraphShapeSchema.options)).toEqual(known);
  });
});

describe('GroupSchema', () => {
  it('accepts a group with a parent (architecture-shaped)', () => {
    expect(
      GroupSchema.safeParse({ id: 'fulfilment', label: 'Fulfilment', in: 'warehouse' }).success,
    ).toBe(true);
  });
  it('accepts a group with no label and no parent', () => {
    expect(GroupSchema.safeParse({ id: 'g1' }).success).toBe(true);
  });
  it('requires id', () => {
    expect(GroupSchema.safeParse({ label: 'x' }).success).toBe(false);
  });
  it("rejects a malformed id (would break Plan 03's bare D2 keys)", () => {
    expect(GroupSchema.safeParse({ id: 'has a space' }).success).toBe(false);
  });
  it('accepts a group with a style', () => {
    expect(GroupSchema.safeParse({ id: 'g1', style: { fill: '#fee' } }).success).toBe(true);
  });
});

describe('NodeSchema', () => {
  it('accepts a fully specified node', () => {
    const result = NodeSchema.safeParse({
      id: 'start',
      label: 'Order received',
      shape: 'oval',
      in: 'fulfilment',
      description: 'Submitted via web or MCP.',
      style: { fill: '#eef' },
    });
    expect(result.success).toBe(true);
  });
  it('accepts every flowchart and architecture shape', () => {
    for (const shape of [...FLOWCHART_SHAPES, ...ARCHITECTURE_SHAPES]) {
      expect(NodeSchema.safeParse({ id: 'n', shape }).success).toBe(true);
    }
  });
  it('rejects an unknown shape', () => {
    expect(NodeSchema.safeParse({ id: 'n', shape: 'star' }).success).toBe(false);
  });
  it('rejects unknown keys', () => {
    expect(NodeSchema.safeParse({ id: 'n', color: 'red' }).success).toBe(false);
  });
  it('rejects a malformed id', () => {
    expect(NodeSchema.safeParse({ id: '1n' }).success).toBe(false);
  });
});

describe('EdgeSchema', () => {
  it('accepts a minimal edge', () => {
    expect(EdgeSchema.safeParse({ from: 'start', to: 'check' }).success).toBe(true);
  });
  it('accepts a fully specified edge', () => {
    const result = EdgeSchema.safeParse({
      id: 'yes',
      from: 'check',
      to: 'ship',
      label: 'yes',
      style: { dashed: true },
    });
    expect(result.success).toBe(true);
  });
  it('requires from and to', () => {
    expect(EdgeSchema.safeParse({ from: 'a' }).success).toBe(false);
    expect(EdgeSchema.safeParse({ to: 'b' }).success).toBe(false);
  });
  it('rejects a malformed explicit id', () => {
    expect(EdgeSchema.safeParse({ id: 'bad.id', from: 'a', to: 'b' }).success).toBe(false);
  });
});

describe('GraphFileSchema', () => {
  it('accepts a minimal flowchart file', () => {
    const result = GraphFileSchema.safeParse({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }],
    });
    expect(result.success).toBe(true);
  });
  it('accepts a minimal architecture file with nested groups', () => {
    const result = GraphFileSchema.safeParse({
      diagrammar: 1,
      type: 'architecture',
      groups: [{ id: 'warehouse' }, { id: 'fulfilment', in: 'warehouse' }],
      nodes: [{ id: 'start', in: 'fulfilment' }],
    });
    expect(result.success).toBe(true);
  });
  it('rejects sequence-only keys (participants/messages)', () => {
    const result = GraphFileSchema.safeParse({
      diagrammar: 1,
      type: 'flowchart',
      participants: [{ id: 'user' }],
    });
    expect(result.success).toBe(false);
  });
  it('rejects an unknown top-level key', () => {
    const result = GraphFileSchema.safeParse({ diagrammar: 1, type: 'flowchart', bogus: true });
    expect(result.success).toBe(false);
  });
  it('rejects a direction on a value not in the enum', () => {
    const result = GraphFileSchema.safeParse({
      diagrammar: 1,
      type: 'flowchart',
      direction: 'sideways',
    });
    expect(result.success).toBe(false);
  });
});
