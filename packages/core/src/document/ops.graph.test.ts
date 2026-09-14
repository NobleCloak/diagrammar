import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DiagramDocument } from './DiagramDocument.js';

const FIXTURES = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'document');
const COMMENTED = readFileSync(join(FIXTURES, 'commented.yaml'), 'utf8');

describe('addNode', () => {
  it('appends a node in block style by default, changing only the new lines', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'addNode', node: { id: 'done', label: 'Done' } }]);
    expect(result.ok).toBe(true);
    const out = doc.toString();
    expect(out.split('\n').length).toBe(COMMENTED.split('\n').length + 2);
    expect(out).toBe(
      COMMENTED.replace(
        '  - id: ship\n    label: Ship order\n    in: fulfilment\n',
        '  - id: ship\n    label: Ship order\n    in: fulfilment\n  - id: done\n    label: Done\n',
      ),
    );
    expect(doc.model.type).toBe('flowchart');
    expect(doc.model.type !== 'sequence' && doc.model.nodes.some((n) => n.id === 'done')).toBe(
      true,
    );
  });

  it('inserts before an existing node when `before` is given, touching only the inserted lines', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      { op: 'addNode', node: { id: 'pack', label: 'Pack order' }, before: { id: 'ship' } },
    ]);
    expect(result.ok).toBe(true);
    const out = doc.toString();
    expect(out).toBe(
      COMMENTED.replace(
        '  - id: ship\n    label: Ship order\n    in: fulfilment\n',
        '  - id: pack\n    label: Pack order\n  - id: ship\n    label: Ship order\n    in: fulfilment\n',
      ),
    );
  });

  it('is atomic: an invalid node leaves the document untouched', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.apply([{ op: 'addNode', node: { id: 'start', label: 'Duplicate id' } }]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('reports a not-found issue for an unresolvable `before` selector', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'addNode', node: { id: 'x' }, before: { id: 'nope' } }]);
    expect(result.ok).toBe(false);
  });

  it('rejects when both before and after are given', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.apply([
      { op: 'addNode', node: { id: 'x' }, before: { id: 'check' }, after: { id: 'start' } },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { path: 'before', message: 'give either before or after, not both' },
      ]);
    }
    expect(doc.hash()).toBe(beforeHash);
  });
});

describe('updateNode', () => {
  it('shallow-merges a patch, preserving comments and unrelated lines', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      { op: 'updateNode', target: { id: 'check' }, patch: { label: 'Check stock levels' } },
    ]);
    expect(result.ok).toBe(true);
    // "check"'s label carries a trailing inline comment
    // (`# ask warehouse before shipping`) — this is the case C1 exists for:
    // the comment must survive on the same line, not just the rest of the
    // file staying untouched.
    expect(doc.toString()).toBe(
      COMMENTED.replace(
        'label: Check stock # ask warehouse',
        'label: Check stock levels # ask warehouse',
      ),
    );
  });

  it('deletes a key when the patch value is null', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'updateNode', target: { id: 'check' }, patch: { in: null } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toBe(
      COMMENTED.replace('    in: fulfilment\n  - id: ship', '  - id: ship'),
    );
  });

  it('reports an issue when the selector does not resolve to a node', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      { op: 'updateNode', target: { id: 'fulfilment' }, patch: { label: 'x' } },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe('removeNode', () => {
  it('refuses to remove a referenced node without cascade', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.apply([{ op: 'removeNode', target: { id: 'check' } }]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('removes a node and cascades to its referencing edges, notes, callouts, and view focus when cascade is true', () => {
    const doc = DiagramDocument.from(COMMENTED);
    // The second setView call upserts the existing view (patches its
    // `focus` field in place) rather than creating a new one — this is the
    // path that must produce a real YAMLSeq for `focus`, not a raw array,
    // or the cascade below would throw instead of stripping the entry.
    const setup = doc.apply([
      { op: 'addNote', note: { at: 'check', text: 'Targets check.' } },
      { op: 'addCallout', callout: { at: 'check', text: 'Also targets check.' } },
      { op: 'setView', view: { id: 'v1', focus: ['start'] } },
      { op: 'setView', view: { id: 'v1', focus: ['start', 'check', 'ship'] } },
    ]);
    expect(setup.ok).toBe(true);
    const result = doc.apply([{ op: 'removeNode', target: { id: 'check' }, cascade: true }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toEqual(
        expect.arrayContaining(['check', 'start->check', 'yes', 'notes[0]', 'callouts[0]']),
      );
    }
    const out = doc.toString();
    expect(out).not.toContain('id: check');
    expect(out).toContain('edges: []');
    expect(out).toContain('notes: []');
    expect(out).toContain('callouts: []');
    const viewsBlock = out.slice(out.indexOf('views:'));
    expect(viewsBlock).not.toContain('check');
    expect(viewsBlock).toContain('start');
    expect(viewsBlock).toContain('ship');
  });

  it('reports path "target" and formats an id-less note key as-is (not double-wrapped) in the refusal message', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const setup = doc.apply([{ op: 'addNote', note: { at: 'check', text: 'Id-less note.' } }]);
    expect(setup.ok).toBe(true);
    const result = doc.apply([{ op: 'removeNode', target: { id: 'check' } }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.path).toBe('target');
      expect(result.issues[0]?.message).toContain('notes[0]');
      expect(result.issues[0]?.message).not.toContain('notes[notes[0]]');
    }
  });

  it('removes an unreferenced node with no cascade needed', () => {
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([{ op: 'addNode', node: { id: 'orphan', label: 'Orphan' } }]);
    const result = doc.apply([{ op: 'removeNode', target: { id: 'orphan' } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toBe(COMMENTED);
  });

  it('cascades to a callout that targets an edge cascaded away with the node, not just the node itself', () => {
    // The "yes" edge (check -> ship) is itself cascaded away because it
    // references "check". The callout below targets that EDGE, not the
    // node — proving the closure reaches one level past the direct target.
    const doc = DiagramDocument.from(COMMENTED);
    const setup = doc.apply([
      { op: 'addCallout', callout: { at: 'yes', text: 'On the yes edge.' } },
    ]);
    expect(setup.ok).toBe(true);
    const refused = doc.apply([{ op: 'removeNode', target: { id: 'check' } }]);
    expect(refused.ok).toBe(false);
    const result = doc.apply([{ op: 'removeNode', target: { id: 'check' }, cascade: true }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toEqual(
        expect.arrayContaining(['check', 'start->check', 'yes', 'callouts[0]']),
      );
    }
    const out = doc.toString();
    expect(out).not.toContain('id: check');
    expect(out).toContain('callouts: []');
  });
});

describe('renameId', () => {
  it('rewrites the node id and every from/to reference, preserving the inline comment', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'renameId', from: 'check', to: 'verify' }]);
    expect(result.ok).toBe(true);
    const expected = COMMENTED.replace('- id: check', '- id: verify')
      .replace('{ from: start, to: check }', '{ from: start, to: verify }')
      .replace('from: check', 'from: verify');
    expect(doc.toString()).toBe(expected);
  });

  it('refuses when the new id already exists', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.apply([{ op: 'renameId', from: 'check', to: 'ship' }]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('refuses when the id does not exist', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'renameId', from: 'nope', to: 'whatever' }]);
    expect(result.ok).toBe(false);
  });

  it('rewrites {from,to} object-form annotation "at" targets and view focus lists', () => {
    const doc = DiagramDocument.from(COMMENTED);
    // Second setView upserts the existing view, exercising the same
    // raw-array-vs-YAMLSeq hazard as the removeNode cascade test above.
    const setup = doc.apply([
      {
        op: 'addCallout',
        callout: { at: { from: 'start', to: 'check' }, text: 'Object-form target.' },
      },
      { op: 'setView', view: { id: 'v1', focus: ['start'] } },
      { op: 'setView', view: { id: 'v1', focus: ['start', 'check'] } },
    ]);
    expect(setup.ok).toBe(true);
    const result = doc.apply([{ op: 'renameId', from: 'check', to: 'verify' }]);
    expect(result.ok).toBe(true);
    const out = doc.toString();
    expect(out).not.toContain('check');
    const calloutsBlock = out.slice(out.indexOf('callouts:'), out.indexOf('views:'));
    expect(calloutsBlock).toContain('verify');
    const viewsBlock = out.slice(out.indexOf('views:'));
    expect(viewsBlock).toContain('verify');
  });
});

describe('addGroup / updateGroup / removeGroup', () => {
  it('appends a group in block style', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'addGroup', group: { id: 'billing', label: 'Billing' } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('  - id: billing\n    label: Billing\n');
  });

  it('updates a group label', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      { op: 'updateGroup', target: { id: 'fulfilment' }, patch: { label: 'Order Fulfilment' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toBe(COMMENTED.replace('label: Fulfilment', 'label: Order Fulfilment'));
  });

  it('refuses to remove a group with member nodes unless cascade is true', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.apply([{ op: 'removeGroup', target: { id: 'fulfilment' } }]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('removes a group and ungroups its member nodes when cascade is true', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'removeGroup', target: { id: 'fulfilment' }, cascade: true }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toEqual(['fulfilment']);
    }
    const out = doc.toString();
    expect(out).not.toContain('in: fulfilment');
    expect(out).not.toContain('id: fulfilment');
    expect(
      doc.model.type !== 'sequence' && doc.model.nodes.every((n) => n.group === undefined),
    ).toBe(true);
  });

  it('cascades to notes, callouts, and view focus referencing the group, not just member nodes', () => {
    const doc = DiagramDocument.from(COMMENTED);
    // The second setView call upserts the existing view (patches its
    // `focus` field in place) rather than creating a new one — this is the
    // path that must produce a real YAMLSeq for `focus`, not a raw array,
    // or the cascade below would throw instead of stripping the entry.
    const setup = doc.apply([
      { op: 'addNote', note: { at: 'fulfilment', text: 'Targets the group.' } },
      { op: 'addCallout', callout: { at: 'fulfilment', text: 'Also targets the group.' } },
      { op: 'setView', view: { id: 'v1', focus: ['ship'] } },
      { op: 'setView', view: { id: 'v1', focus: ['fulfilment', 'ship'] } },
    ]);
    expect(setup.ok).toBe(true);
    const refused = doc.apply([{ op: 'removeGroup', target: { id: 'fulfilment' } }]);
    expect(refused.ok).toBe(false);
    const result = doc.apply([{ op: 'removeGroup', target: { id: 'fulfilment' }, cascade: true }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toEqual(
        expect.arrayContaining(['fulfilment', 'notes[0]', 'callouts[0]']),
      );
    }
    const out = doc.toString();
    expect(out).not.toContain('id: fulfilment');
    expect(out).toContain('notes: []');
    expect(out).toContain('callouts: []');
    const viewsBlock = out.slice(out.indexOf('views:'));
    expect(viewsBlock).not.toContain('fulfilment');
    expect(viewsBlock).toContain('ship');
  });
});

describe('addEdge / updateEdge / removeEdge', () => {
  it('appends an edge mimicking the flow style of the first edge sibling', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'addEdge', edge: { from: 'ship', to: 'start' } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('{ from: ship, to: start }');
  });

  it('updates an edge selected by id', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      { op: 'updateEdge', target: { id: 'yes' }, patch: { label: 'confirmed' } },
    ]);
    expect(result.ok).toBe(true);
    // DEVIATION (C1 fallout): `applyShallowMergePatch` now mutates the live
    // Scalar's `.value` in place (to keep comments — see `ops.ts`) instead
    // of replacing the node via `createNode`, so the original label's
    // quoting style (`"yes"` was quoted because it's a YAML 1.1
    // boolean-like word) carries over even though "confirmed" doesn't
    // itself need quotes. This is the exact trade-off C1's own doc comment
    // documents. Was `COMMENTED.replace('label: "yes"', 'label: confirmed')`.
    expect(doc.toString()).toBe(COMMENTED.replace('label: "yes"', 'label: "confirmed"'));
  });

  it('preserves a trailing inline comment on the patched field (C1)', () => {
    const yaml = `diagrammar: 1
type: flowchart
title: Comment fixture
direction: down

nodes:
  - id: a
    label: A
  - id: b
    label: B

edges:
  - id: e1
    from: a
    to: b
    label: go # keep moving
`;
    const doc = DiagramDocument.from(yaml);
    const result = doc.apply([
      { op: 'updateEdge', target: { id: 'e1' }, patch: { label: 'proceed' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toBe(
      yaml.replace('label: go # keep moving', 'label: proceed # keep moving'),
    );
  });

  it('updates an id-less edge selected by { from, to }', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      { op: 'updateEdge', target: { from: 'start', to: 'check' }, patch: { label: 'first check' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('{ from: start, to: check, label: first check }');
  });

  it('removes an edge selected by { from, to }', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'removeEdge', target: { from: 'start', to: 'check' } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).not.toContain('{ from: start, to: check }');
    expect(doc.toString()).toContain('id: yes');
  });

  it('reports an issue for an unresolvable edge selector', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'removeEdge', target: { id: 'nope' } }]);
    expect(result.ok).toBe(false);
  });

  it('refuses to remove an edge referenced by a callout or focused by a view (I8)', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const setup = doc.apply([
      { op: 'addCallout', callout: { id: 'c1', at: 'yes', text: 'Happy path continues here.' } },
      { op: 'setView', view: { id: 'happy', focus: ['yes'] } },
    ]);
    expect(setup.ok).toBe(true);
    const beforeHash = doc.hash();
    const result = doc.apply([{ op: 'removeEdge', target: { id: 'yes' } }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        {
          path: 'target',
          message: 'cannot remove "yes": referenced by callouts[c1], views[happy].focus',
        },
      ]);
    }
    expect(doc.hash()).toBe(beforeHash);
  });

  it('reports an ambiguous-selector issue when an id-less {from,to} pair matches more than one edge', () => {
    // Rule 4 ("id-less edges have unique {from,to} pairs") only constrains
    // id-less edges against each other — an *explicitly* id'd edge may
    // still share a {from,to} pair with a separate id-less edge, and a
    // bare {from,to} selector must then resolve ambiguously between them.
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([
      { op: 'addEdge', edge: { id: 'again', from: 'start', to: 'check', label: 'retry' } },
    ]);
    const result = doc.apply([{ op: 'removeEdge', target: { from: 'start', to: 'check' } }]);
    expect(result.ok).toBe(false);
  });
});
