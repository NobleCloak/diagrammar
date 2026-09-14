import { describe, expect, it } from 'vitest';
import type { DiagramFile } from '../schema/index.js';
import { buildModel } from './build.js';
import { runSemanticRules } from './semantic.js';

function build(file: DiagramFile) {
  return buildModel(file);
}

describe('rule 1 — duplicate ids', () => {
  it('flags a node id reused by a group', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      groups: [{ id: 'shared' }],
      nodes: [{ id: 'shared' }],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some((i) => i.path === 'nodes[0].id' && i.message.includes('duplicate id "shared"')),
    ).toBe(true);
  });

  it('flags a duplicate message id inside a fragment', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }, { id: 'b' }],
      messages: [
        { id: 'm1', from: 'a', to: 'b' },
        { fragment: 'alt', messages: [{ id: 'm1', from: 'b', to: 'a' }] },
      ],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some(
        (i) => i.path === 'messages[1].messages[0].id' && i.message.includes('duplicate id "m1"'),
      ),
    ).toBe(true);
  });
});

describe('rule 2 — dangling references', () => {
  it('flags an edge "to" that does not exist (spec §3.6 example)', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }],
      edges: [{ from: 'start', to: 'shp' }],
    });
    const issues = runSemanticRules(diagram);
    expect(issues.some((i) => i.path === 'edges[0].to' && i.message === 'unknown node "shp"')).toBe(
      true,
    );
  });

  it('flags an edge "to" that names an existing GROUP id, not a node', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      groups: [{ id: 'g1' }],
      nodes: [{ id: 'start' }],
      edges: [{ from: 'start', to: 'g1' }],
    });
    const issues = runSemanticRules(diagram);
    expect(issues.some((i) => i.path === 'edges[0].to' && i.message === 'unknown node "g1"')).toBe(
      true,
    );
  });

  it('flags a node "in" pointing at a nonexistent group', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      nodes: [{ id: 'a', in: 'nope' }],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some((i) => i.path === 'nodes[0].in' && i.message.includes('unknown group "nope"')),
    ).toBe(true);
  });

  it('flags a callout "at" pointing at a nonexistent target', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }],
      callouts: [{ at: 'ghost' }],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some(
        (i) => i.path === 'callouts[0].at' && i.message.includes('unknown target "ghost"'),
      ),
    ).toBe(true);
  });

  it('flags a view focus entry pointing at a nonexistent target', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }],
      views: [{ id: 'v1', focus: ['a', 'ghost'] }],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some(
        (i) => i.path === 'views[0].focus[1]' && i.message.includes('unknown target "ghost"'),
      ),
    ).toBe(true);
  });

  it('flags a sequence message "from" pointing at a nonexistent participant', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }],
      messages: [{ from: 'ghost', to: 'a' }],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some(
        (i) => i.path === 'messages[0].from' && i.message.includes('unknown participant "ghost"'),
      ),
    ).toBe(true);
  });
});

describe('rule 3 — group parenting cycles', () => {
  it('flags a two-group cycle', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      groups: [
        { id: 'g1', in: 'g2' },
        { id: 'g2', in: 'g1' },
      ],
      nodes: [{ id: 'a', in: 'g1' }],
    });
    const issues = runSemanticRules(diagram);
    expect(issues.some((i) => i.path === 'groups[0].in' && i.message.includes('cycle'))).toBe(true);
  });
});

describe('rule 4 — ambiguous id-less parallel edges', () => {
  it('flags two id-less edges sharing the same from/to', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b', label: 'again' },
      ],
    });
    const issues = runSemanticRules(diagram);
    const ambiguous = issues.filter((i) => i.message.includes('ambiguous edge "a->b"'));
    expect(ambiguous.length).toBe(2);
    expect(ambiguous.some((i) => i.path === 'edges[0]')).toBe(true);
    expect(ambiguous.some((i) => i.path === 'edges[1]')).toBe(true);
  });

  it('does not flag id-less edges once one carries an explicit id', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { from: 'a', to: 'b' },
        { id: 'again', from: 'a', to: 'b' },
      ],
    });
    const issues = runSemanticRules(diagram);
    expect(issues.some((i) => i.message.includes('ambiguous edge'))).toBe(false);
  });
});

describe('rule 5 — fragments must be non-empty', () => {
  it('flags an empty fragment', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }],
      messages: [{ fragment: 'opt', messages: [] }],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some((i) => i.path === 'messages[0]' && i.message.includes('at least one message')),
    ).toBe(true);
  });
});

describe('rule 6 — shape/kind vocabulary', () => {
  it('flags an architecture-only shape used in a flowchart', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a', shape: 'cylinder' }],
    });
    const issues = runSemanticRules(diagram);
    expect(issues.some((i) => i.path === 'nodes[0].shape' && i.message.includes('flowchart'))).toBe(
      true,
    );
  });

  it('flags a flowchart-only shape used in architecture', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      nodes: [{ id: 'a', shape: 'diamond' }],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some((i) => i.path === 'nodes[0].shape' && i.message.includes('architecture')),
    ).toBe(true);
  });

  it('does not flag "rect" or "hexagon" (shared by both families)', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      nodes: [{ id: 'a', shape: 'hexagon' }],
    });
    expect(runSemanticRules(diagram).some((i) => i.path === 'nodes[0].shape')).toBe(false);
  });
});

describe('rule 8 — groups[].in only valid in architecture', () => {
  it('flags "in" on a flowchart group', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      groups: [{ id: 'g1' }, { id: 'g2', in: 'g1' }],
      nodes: [{ id: 'a', in: 'g2' }],
    });
    const issues = runSemanticRules(diagram);
    expect(issues.some((i) => i.path === 'groups[1].in' && i.message.includes('flat'))).toBe(true);
  });

  it('does not flag "in" on an architecture group', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'architecture',
      groups: [{ id: 'g1' }, { id: 'g2', in: 'g1' }],
      nodes: [{ id: 'a', in: 'g2' }],
    });
    expect(runSemanticRules(diagram).some((i) => i.message.includes('flat'))).toBe(false);
  });
});

describe('rule 9 — resolved callout numbers must be unique', () => {
  it('flags two explicit callouts sharing the same number', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }],
      callouts: [
        { at: 'a', number: 1 },
        { at: 'b', number: 1 },
      ],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some(
        (i) =>
          i.path === 'callouts[1].number' &&
          i.message === 'duplicate callout number 1 (also used by callouts[0])',
      ),
    ).toBe(true);
  });

  it('flags an explicit number colliding with another callout’s derived number', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }],
      callouts: [
        // Derives to number 1 (1-based position).
        { at: 'a' },
        // Explicitly claims the same number 1.
        { at: 'b', number: 1 },
      ],
    });
    const issues = runSemanticRules(diagram);
    expect(
      issues.some(
        (i) =>
          i.path === 'callouts[1].number' &&
          i.message === 'duplicate callout number 1 (also used by callouts[0])',
      ),
    ).toBe(true);
  });

  it('does not flag a valid mixed set of explicit and derived numbers', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      callouts: [
        { at: 'a', number: 5 },
        // Derives to number 2 (1-based position), which is free.
        { at: 'b' },
        { at: 'c', number: 3 },
      ],
    });
    expect(runSemanticRules(diagram).some((i) => i.message.includes('duplicate callout'))).toBe(
      false,
    );
  });
});

describe('a fully valid diagram', () => {
  it('produces no issues', () => {
    const diagram = build({
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start', shape: 'oval' }, { id: 'check', shape: 'diamond' }, { id: 'ship' }],
      edges: [
        { from: 'start', to: 'check' },
        { id: 'yes', from: 'check', to: 'ship', label: 'yes' },
      ],
      notes: [{ at: 'check', text: 'note' }],
      callouts: [{ at: 'yes' }],
      views: [{ id: 'happy', focus: ['start', 'check', 'ship', 'yes'] }],
    });
    expect(runSemanticRules(diagram)).toEqual([]);
  });
});
