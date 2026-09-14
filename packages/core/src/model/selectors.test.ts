import { describe, expect, it } from 'vitest';
import type { DiagramFile } from '../schema/index.js';
import { buildModel } from './build.js';
import { resolveSelector } from './selectors.js';
import type { Diagram } from './types.js';

function build(file: DiagramFile): Diagram {
  return buildModel(file);
}

describe('resolveSelector — by id', () => {
  it('resolves a node by id', () => {
    const diagram = build({ diagrammar: 1, type: 'flowchart', nodes: [{ id: 'start' }] });
    const result = resolveSelector(diagram, { id: 'start' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.key).toBe('start');
      expect(result.element.kind).toBe('node');
    }
  });

  it('returns not_found for an unknown id', () => {
    const diagram = build({ diagrammar: 1, type: 'flowchart', nodes: [{ id: 'start' }] });
    const result = resolveSelector(diagram, { id: 'ghost' });
    expect(result).toMatchObject({ code: 'not_found' });
  });

  it('returns ambiguous when two elements share an id (a not-yet-revalidated document)', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      groups: [{ id: 'dup' }],
      nodes: [{ id: 'dup' }],
    });
    const result = resolveSelector(diagram, { id: 'dup' });
    expect(result).toMatchObject({ code: 'ambiguous' });
  });

  it('resolves an explicit-id message by id (review finding 1a)', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [{ id: 'msg1', from: 'a', to: 'b' }],
    });
    const result = resolveSelector(diagram, { id: 'msg1' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.element.kind).toBe('message');
      expect(result.key).toBe('msg1');
    }
  });

  it('resolves an explicit-id message nested inside a fragment by id (review finding 1b)', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [{ fragment: 'alt', messages: [{ id: 'msg2', from: 'a', to: 'b' }] }],
    });
    const result = resolveSelector(diagram, { id: 'msg2' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.element.kind).toBe('message');
    }
  });

  it('returns ambiguous when a participant and a message share an id (review finding 1c)', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'shared' }, { id: 'b' }],
      messages: [{ id: 'shared', from: 'shared', to: 'b' }],
    });
    const result = resolveSelector(diagram, { id: 'shared' });
    expect(result).toMatchObject({ code: 'ambiguous' });
  });

  it('resolves a node by id when a group with a different id is also present', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      groups: [{ id: 'g1' }],
      nodes: [{ id: 'start' }],
    });
    const result = resolveSelector(diagram, { id: 'start' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.element.kind).toBe('node');
    }
  });

  it('resolves an edge by its explicit id when other edges do not match', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { from: 'a', to: 'b', id: 'e1' },
        { from: 'b', to: 'a', id: 'e2' },
      ],
    });
    const result = resolveSelector(diagram, { id: 'e1' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.key).toBe('e1');
      expect(result.element.kind).toBe('edge');
    }
  });

  it('resolves a note by its explicit id when other notes are id-less', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }],
      notes: [
        { id: 'n1', at: 'start', text: 'hi' },
        { at: 'start', text: 'untitled' },
      ],
    });
    const result = resolveSelector(diagram, { id: 'n1' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.key).toBe('n1');
      expect(result.element.kind).toBe('note');
    }
  });

  it('resolves a callout by its explicit id when other callouts are id-less', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }],
      callouts: [{ id: 'c1', at: 'start' }, { at: 'start' }],
    });
    const result = resolveSelector(diagram, { id: 'c1' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.key).toBe('c1');
      expect(result.element.kind).toBe('callout');
    }
  });
});

describe('resolveSelector — by {from, to}', () => {
  it('resolves an id-less edge', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b' }],
    });
    const result = resolveSelector(diagram, { from: 'a', to: 'b' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.key).toBe('a->b');
      expect(result.element.kind).toBe('edge');
    }
  });

  it('returns not_found when no such edge exists', () => {
    const diagram = build({ diagrammar: 1, type: 'flowchart', nodes: [{ id: 'a' }, { id: 'b' }] });
    const result = resolveSelector(diagram, { from: 'a', to: 'b' });
    expect(result).toMatchObject({ code: 'not_found' });
  });

  it('returns ambiguous when multiple edges share the same endpoints (review finding 2d)', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { from: 'a', to: 'b' },
        { id: 'again', from: 'a', to: 'b' },
      ],
    });
    const result = resolveSelector(diagram, { from: 'a', to: 'b' });
    expect(result).toMatchObject({ code: 'ambiguous' });
  });

  it('resolves a sequence message by endpoints (review finding 2e)', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [{ from: 'a', to: 'b' }],
    });
    const result = resolveSelector(diagram, { from: 'a', to: 'b' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.element.kind).toBe('message');
    }
  });

  it('resolves an edge by endpoints when other edges have different endpoints', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { from: 'a', to: 'c' },
        { from: 'a', to: 'b' },
      ],
    });
    const result = resolveSelector(diagram, { from: 'a', to: 'b' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.element.kind).toBe('edge');
    }
  });

  it('resolves a sequence message nested inside a fragment by endpoints', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [
        { from: 'b', to: 'a' },
        { fragment: 'alt', messages: [{ from: 'a', to: 'b' }] },
      ],
    });
    const result = resolveSelector(diagram, { from: 'a', to: 'b' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.element.kind).toBe('message');
    }
  });

  it('returns not_found when no sequence message matches the given endpoints', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [{ from: 'a', to: 'b' }],
    });
    const result = resolveSelector(diagram, { from: 'b', to: 'a' });
    expect(result).toMatchObject({ code: 'not_found' });
  });

  it('returns ambiguous when multiple sequence messages share the same endpoints', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
      ],
    });
    const result = resolveSelector(diagram, { from: 'a', to: 'b' });
    expect(result).toMatchObject({ code: 'ambiguous' });
  });
});

describe('resolveSelector — by path', () => {
  it('resolves an id-less message by its position path', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [{ from: 'a', to: 'b' }],
    });
    const result = resolveSelector(diagram, { path: 'messages[0]' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.element.kind).toBe('message');
    }
  });

  it('resolves a fragment by its position path', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [{ fragment: 'alt', messages: [{ from: 'a', to: 'b' }] }],
    });
    const result = resolveSelector(diagram, { path: 'messages[0]' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.element.kind).toBe('fragment');
    }
  });

  it('returns not_found for a path that resolves to a non-addressable element (a node has no position path)', () => {
    const diagram = build({ diagrammar: 1, type: 'flowchart', nodes: [{ id: 'start' }] });
    const result = resolveSelector(diagram, { path: 'start' });
    expect(result).toMatchObject({ code: 'not_found' });
  });

  it('returns not_found for a nonexistent path', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [{ from: 'a', to: 'b' }],
    });
    const result = resolveSelector(diagram, { path: 'messages[5]' });
    expect(result).toMatchObject({ code: 'not_found' });
  });
});

describe('resolveSelector — by path (id-less notes and callouts, contract §11 item 13)', () => {
  it('resolves an id-less note by its synthetic "notes[i]" key', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }],
      notes: [{ at: 'start', text: 'hello' }],
    });
    const result = resolveSelector(diagram, { path: 'notes[0]' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.key).toBe('notes[0]');
      expect(result.element.kind).toBe('note');
    }
  });

  it('resolves an id-less callout by its synthetic "callouts[i]" key', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }],
      callouts: [{ at: 'start' }],
    });
    const result = resolveSelector(diagram, { path: 'callouts[0]' });
    expect('code' in result).toBe(false);
    if (!('code' in result)) {
      expect(result.key).toBe('callouts[0]');
      expect(result.element.kind).toBe('callout');
    }
  });

  it('returns not_found for a "notes[i]" path that does not exist', () => {
    const diagram = build({ diagrammar: 1, type: 'flowchart', nodes: [{ id: 'start' }] });
    const result = resolveSelector(diagram, { path: 'notes[3]' });
    expect(result).toMatchObject({ code: 'not_found' });
  });
});
