import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DiagramDocument } from './DiagramDocument.js';

const FIXTURES = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'document');
const COMMENTED = readFileSync(join(FIXTURES, 'commented.yaml'), 'utf8');

describe('addNote / updateNote / removeNote', () => {
  it('appends a note targeting a node by id', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      { op: 'addNote', note: { id: 'n1', at: 'check', text: 'Checks the reservation ledger.' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain(
      'notes:\n  - id: n1\n    at: check\n    text: Checks the reservation ledger.\n',
    );
  });

  it('updates a note selected by id', () => {
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([{ op: 'addNote', note: { id: 'n1', at: 'check', text: 'Original text.' } }]);
    const result = doc.apply([
      { op: 'updateNote', target: { id: 'n1' }, patch: { text: 'Revised text.' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('text: Revised text.');
  });

  it('removes a note selected by id', () => {
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([{ op: 'addNote', note: { id: 'n1', at: 'check', text: 'Text.' } }]);
    const result = doc.apply([{ op: 'removeNote', target: { id: 'n1' } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('notes: []');
  });

  it('reports an issue for an unresolvable note target', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'updateNote', target: { id: 'nope' }, patch: { text: 'x' } }]);
    expect(result.ok).toBe(false);
  });

  it('updates an id-less note selected by position path (contract §11 item 13)', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const setup = doc.apply([
      { op: 'addNote', note: { id: 'n0', at: 'start', text: 'First.' } },
      { op: 'addNote', note: { at: 'check', text: 'Second, id-less.' } },
    ]);
    expect(setup.ok).toBe(true);
    const result = doc.apply([
      { op: 'updateNote', target: { path: 'notes[1]' }, patch: { text: 'Updated second.' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('text: Updated second.');
    expect(doc.toString()).toContain('text: First.');
  });
});

describe('addCallout / updateCallout / removeCallout', () => {
  it('appends a callout targeting an edge by id', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      { op: 'addCallout', callout: { id: 'c1', at: 'yes', number: 1, text: 'Happy path.' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain(
      'callouts:\n  - id: c1\n    at: yes\n    number: 1\n    text: Happy path.\n',
    );
  });

  it('updates a callout selected by an id-less position path', () => {
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([{ op: 'addCallout', callout: { at: 'yes', text: 'First.' } }]);
    const result = doc.apply([
      { op: 'updateCallout', target: { path: 'callouts[0]' }, patch: { text: 'Updated.' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('text: Updated.');
  });

  it('removes a callout selected by id', () => {
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([{ op: 'addCallout', callout: { id: 'c1', at: 'yes' } }]);
    const result = doc.apply([{ op: 'removeCallout', target: { id: 'c1' } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('callouts: []');
  });
});

describe('setView / removeView', () => {
  it('appends a new view', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([
      {
        op: 'setView',
        view: { id: 'happy', title: 'Happy path', focus: ['start', 'check', 'ship'] },
      },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain(
      'views:\n  - id: happy\n    title: Happy path\n    focus:\n      - start\n      - check\n      - ship\n',
    );
  });

  it('upserts (replaces fields on) an existing view with the same id', () => {
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([{ op: 'setView', view: { id: 'happy', title: 'Happy path', focus: ['start'] } }]);
    const result = doc.apply([
      { op: 'setView', view: { id: 'happy', title: 'Happy path v2', focus: ['start', 'ship'] } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.model.views.filter((v) => v.id === 'happy')).toHaveLength(1);
    expect(doc.model.views[0]?.title).toBe('Happy path v2');
  });

  it('setView is a full replacement, not a merge: omitting a field that existed on the old view clears it', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const setup = doc.apply([
      { op: 'setView', view: { id: 'happy', title: 'Happy path', focus: ['start'] } },
    ]);
    expect(setup.ok).toBe(true);
    expect(doc.toString()).toContain('title: Happy path');
    const result = doc.apply([{ op: 'setView', view: { id: 'happy', focus: ['start', 'ship'] } }]);
    expect(result.ok).toBe(true);
    // The diagram itself has a top-level `title:` field (from the fixture),
    // so a global `not.toContain('title:')` would be a false positive; scope
    // the assertion to the view's own mapping, which must have lost its
    // `title` line entirely (full replacement, not a merge).
    expect(doc.toString()).toContain(
      'views:\n  - id: happy\n    focus:\n      - start\n      - ship\n',
    );
    expect(doc.model.views[0]?.title).toBeUndefined();
  });

  it('removes a view by id', () => {
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([{ op: 'setView', view: { id: 'happy', focus: ['start'] } }]);
    const result = doc.apply([{ op: 'removeView', id: 'happy' }]);
    expect(result.ok).toBe(true);
    expect(doc.model.views).toHaveLength(0);
  });

  it('reports an issue when removing a view that does not exist', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'removeView', id: 'nope' }]);
    expect(result.ok).toBe(false);
  });
});

describe('setView — carries nested flow style through full replacement', () => {
  const BLOCK_VIEW = `diagrammar: 1
type: flowchart
title: Flow style fixture
direction: down

nodes:
  - id: start
    label: Start
  - id: check
    label: Check
  - id: ship
    label: Ship

edges:
  - { from: start, to: check }
  - { from: check, to: ship }

views:
  - id: v1
    focus: [start, check]
`;

  const FULLY_BLOCK_VIEW = `diagrammar: 1
type: flowchart
title: Flow style fixture
direction: down

nodes:
  - id: start
    label: Start
  - id: check
    label: Check
  - id: ship
    label: Ship

edges:
  - { from: start, to: check }
  - { from: check, to: ship }

views:
  - id: v1
    focus:
      - start
      - check
`;

  const FULLY_FLOW_VIEW = `diagrammar: 1
type: flowchart
title: Flow style fixture
direction: down

nodes:
  - id: start
    label: Start
  - id: check
    label: Check
  - id: ship
    label: Ship

edges:
  - { from: start, to: check }
  - { from: check, to: ship }

views:
  - { id: v1, focus: [start, check] }
`;

  it("keeps a block-style view's nested flow-style focus list flow after replacement", () => {
    const doc = DiagramDocument.from(BLOCK_VIEW);
    const result = doc.apply([{ op: 'setView', view: { id: 'v1', focus: ['start', 'ship'] } }]);
    expect(result.ok).toBe(true);
    // A freshly-built flow node always renders with yaml's default
    // `flowCollectionPadding` spacing (`[ start, ship ]`), matching every
    // other newly-created flow node in this codebase (e.g. addEdge's
    // default `{ from: ship, to: start }`) — only hand-authored flow text
    // that's never rebuilt keeps its original, unpadded spelling.
    expect(doc.toString()).toContain('  - id: v1\n    focus: [ start, ship ]\n');
  });

  it('keeps a fully block-style view fully block after replacement', () => {
    const doc = DiagramDocument.from(FULLY_BLOCK_VIEW);
    const result = doc.apply([{ op: 'setView', view: { id: 'v1', focus: ['start', 'ship'] } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('  - id: v1\n    focus:\n      - start\n      - ship\n');
  });

  it('keeps a fully flow-style view fully flow after replacement', () => {
    const doc = DiagramDocument.from(FULLY_FLOW_VIEW);
    const result = doc.apply([{ op: 'setView', view: { id: 'v1', focus: ['start', 'ship'] } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('{ id: v1, focus: [ start, ship ] }');
  });
});
