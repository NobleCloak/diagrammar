import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DiagramDocument } from './DiagramDocument.js';

const FIXTURES = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'document');
const SEQUENCE = readFileSync(join(FIXTURES, 'sequence-minimal.yaml'), 'utf8');
const FRAGMENT = readFileSync(join(FIXTURES, 'sequence-fragment.yaml'), 'utf8');

describe('addParticipant / updateParticipant / removeParticipant', () => {
  it('appends a participant in block style', () => {
    const doc = DiagramDocument.from(SEQUENCE);
    const result = doc.apply([
      { op: 'addParticipant', participant: { id: 'db', label: 'Database', kind: 'database' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('  - id: db\n    label: Database\n    kind: database\n');
  });

  it('updates a participant label', () => {
    const doc = DiagramDocument.from(SEQUENCE);
    const result = doc.apply([
      { op: 'updateParticipant', target: { id: 'api' }, patch: { label: 'API Gateway' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toBe(SEQUENCE.replace('label: API', 'label: API Gateway'));
  });

  it('refuses to remove a referenced participant without cascade', () => {
    const doc = DiagramDocument.from(SEQUENCE);
    const beforeHash = doc.hash();
    const result = doc.apply([{ op: 'removeParticipant', target: { id: 'api' } }]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  // DEVIATION from the brief's verbatim test (reported in task-7-8-report.md):
  // the brief's original test removed "db" with `cascade: true` and asserted
  // `result.ok === true`. That's arithmetically impossible against this
  // fixture: "db" is one of only two participants referenced by the "alt"
  // fragment's two messages, and *both* of those messages reference "db" (as
  // `to` in one, `from` in the other) — so cascading "db" away always
  // empties the fragment's `messages` list, which fails the mandatory
  // re-parse (semantic rule 5: a fragment must contain at least one
  // message). This is the exact scenario the brief's own Step 5 note
  // documents as "expected, correct behavior, not a bug to fix" — the note
  // and the test contradict each other. Kept the brief-verbatim
  // implementation and rewrote the test to verify the real, correct
  // behavior instead: cascade detection reaches messages nested inside a
  // fragment (surfaced in the refusal message without `cascade: true`), and
  // `cascade: true` still correctly refuses rather than silently emptying
  // the fragment.
  it('detects messages referencing the target even inside a fragment, and refuses to leave a fragment empty even with cascade', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const beforeHash = doc.hash();
    const refused = doc.apply([{ op: 'removeParticipant', target: { id: 'db' } }]);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      const messageText = refused.issues.map((issue) => issue.message).join(' ');
      expect(messageText).toContain('messages[1].messages[0]');
      expect(messageText).toContain('messages[1].messages[1]');
    }
    const result = doc.apply([{ op: 'removeParticipant', target: { id: 'db' }, cascade: true }]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  // DEVIATION from the brief's verbatim test (reported in task-7-8-report.md):
  // the brief's original test also targeted "db", which hits the same
  // fragment-emptying rejection described above. Retargeted to "user" —
  // referenced only by top-level messages ("m1" and the closing "201
  // Created" message), never by anything inside the "alt" fragment — so the
  // cascade here still exercises notes/callouts/view-focus removal (the
  // thing this test is actually about) without touching the fragment.
  it('cascades to notes, callouts, and view focus referencing the participant, not just messages', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    // The second setView call upserts the existing view, exercising the
    // same raw-array-vs-YAMLSeq hazard covered in the graph-family tests.
    const setup = doc.apply([
      { op: 'addNote', note: { at: 'user', text: 'Targets user.' } },
      { op: 'addCallout', callout: { at: 'user', text: 'Also targets user.' } },
      { op: 'setView', view: { id: 'v1', focus: ['api'] } },
      { op: 'setView', view: { id: 'v1', focus: ['api', 'user'] } },
    ]);
    expect(setup.ok).toBe(true);
    const result = doc.apply([{ op: 'removeParticipant', target: { id: 'user' }, cascade: true }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toEqual(
        expect.arrayContaining(['user', 'm1', 'notes[0]', 'callouts[0]']),
      );
    }
    const out = doc.toString();
    expect(out).not.toContain('id: user');
    expect(out).toContain('notes: []');
    expect(out).toContain('callouts: []');
    const viewsBlock = out.slice(out.indexOf('views:'));
    expect(viewsBlock).not.toContain('user');
    expect(viewsBlock).toContain('api');
  });

  it('cascades to a callout that targets a message cascaded away with the participant, not just the participant itself', () => {
    // "m1" (user -> api) is itself cascaded away because it references
    // "user". The callout below targets that MESSAGE, not the participant
    // — proving the closure reaches one level past the direct target,
    // exactly like the equivalent graph-family test in Task 4.
    const doc = DiagramDocument.from(FRAGMENT);
    const setup = doc.apply([
      { op: 'addCallout', callout: { at: 'm1', text: 'On the first message.' } },
    ]);
    expect(setup.ok).toBe(true);
    const refused = doc.apply([{ op: 'removeParticipant', target: { id: 'user' } }]);
    expect(refused.ok).toBe(false);
    const result = doc.apply([{ op: 'removeParticipant', target: { id: 'user' }, cascade: true }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removed).toEqual(expect.arrayContaining(['user', 'm1', 'callouts[0]']));
    }
    const out = doc.toString();
    expect(out).not.toContain('id: user');
    expect(out).toContain('callouts: []');
  });

  it('reports path "target" and formats an id-less nested-message key as-is (not double-wrapped) (I3)', () => {
    const yaml = `diagrammar: 1
type: sequence
title: Nested refusal fixture

participants:
  - id: user
    label: User
  - id: api
    label: API
  - id: db
    label: Database

messages:
  - { from: user, to: api, label: place }
  - { from: api, to: user, label: ack }
  - fragment: alt
    label: in stock
    messages:
      - { from: api, to: db, label: reserve }
`;
    const doc = DiagramDocument.from(yaml);
    const result = doc.apply([{ op: 'removeParticipant', target: { id: 'db' } }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        {
          path: 'target',
          message:
            'cannot remove "db": referenced by messages[2].messages[0] (pass cascade: true to remove them)',
        },
      ]);
    }
  });
});

describe('renameId on a sequence diagram', () => {
  it('rewrites the participant id and every message from/to, including inside a fragment', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const result = doc.apply([{ op: 'renameId', from: 'api', to: 'gateway' }]);
    expect(result.ok).toBe(true);
    const out = doc.toString();
    expect(out).toContain('id: gateway');
    expect(out).not.toContain('id: api');
    expect(out).toContain('{ id: m1, from: user, to: gateway, label: "POST /orders" }');
    expect(out).toContain('{ from: gateway, to: db, label: reserve }');
    expect(out).toContain('{ from: db, to: gateway, label: ok }');
    expect(out).toContain('{ from: gateway, to: user, label: "201 Created", style: return }');
  });
});

describe('insertMessage', () => {
  it('appends to the root messages list by default (at: end)', () => {
    const doc = DiagramDocument.from(SEQUENCE);
    const result = doc.apply([
      { op: 'insertMessage', item: { from: 'api', to: 'user', label: '200 OK' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('{ from: api, to: user, label: 200 OK }');
  });

  it('inserts before an anchor inside a fragment, in that same fragment', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const result = doc.apply([
      {
        op: 'insertMessage',
        item: { from: 'api', to: 'db', label: 'check quantity' },
        before: { path: 'messages[1].messages[0]' },
      },
    ]);
    expect(result.ok).toBe(true);
    const expected = FRAGMENT.replace(
      '      - { from: api, to: db, label: reserve }',
      '      - { from: api, to: db, label: check quantity }\n      - { from: api, to: db, label: reserve }',
    );
    expect(doc.toString()).toBe(expected);
  });

  it('inserts after an anchor inside a fragment, in that same fragment', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const result = doc.apply([
      {
        op: 'insertMessage',
        item: { from: 'db', to: 'api', label: 'reserved' },
        after: { path: 'messages[1].messages[0]' },
      },
    ]);
    expect(result.ok).toBe(true);
    const expected = FRAGMENT.replace(
      '      - { from: api, to: db, label: reserve }',
      '      - { from: api, to: db, label: reserve }\n      - { from: db, to: api, label: reserved }',
    );
    expect(doc.toString()).toBe(expected);
  });

  it('inserts a fragment as an item', () => {
    const doc = DiagramDocument.from(SEQUENCE);
    const result = doc.apply([
      {
        op: 'insertMessage',
        item: {
          fragment: 'opt',
          label: 'if slow',
          messages: [{ from: 'api', to: 'user', label: 'retry hint' }],
        },
      },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('fragment: opt');
  });

  it('honors an explicit at: "end", appending to the top-level messages list even when a fragment exists (I4)', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const result = doc.apply([
      { op: 'insertMessage', item: { from: 'api', to: 'user', label: 'done' }, at: 'end' },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString().trimEnd().endsWith('{ from: api, to: user, label: done }')).toBe(true);
  });

  it('rejects at combined with before (I4)', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const beforeHash = doc.hash();
    const result = doc.apply([
      {
        op: 'insertMessage',
        item: { from: 'api', to: 'user', label: 'x' },
        before: { id: 'm1' },
        at: 'end',
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { path: 'before', message: 'give one of before, after or at' },
      ]);
    }
    expect(doc.hash()).toBe(beforeHash);
  });
});

describe('updateMessage', () => {
  // DEVIATION, twice over now (reported in task-7-8-report.md, then updated
  // for C1): the brief's original expected string kept the original label's
  // double quotes (`"POST /orders (v2)"`), which was impossible against the
  // *old* `applyShallowMergePatch` (always `createNode`, which drops
  // quoting that isn't otherwise required) — task-7-8-report.md rewrote the
  // expectation to plain, unquoted output instead. C1 (`ops.ts`) then
  // changed `applyShallowMergePatch` again: a patch landing on a live
  // `Scalar` now mutates `.value` in place to preserve comments, which as a
  // side effect also carries over the *old* quoting style. So the pendulum
  // swings back: the label is quoted again, exactly like the graph-family
  // `updateEdge` test now documents (`ops.graph.test.ts`).
  it('updates a message selected by id', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const result = doc.apply([
      { op: 'updateMessage', target: { id: 'm1' }, patch: { label: 'POST /orders (v2)' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toBe(FRAGMENT.replace('"POST /orders"', '"POST /orders (v2)"'));
  });

  it('updates a nested id-less message selected by path', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const result = doc.apply([
      {
        op: 'updateMessage',
        target: { path: 'messages[1].messages[0]' },
        patch: { label: 'reserve stock' },
      },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('{ from: api, to: db, label: reserve stock }');
  });
});

describe('removeMessage', () => {
  it('removes a message selected by id', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const result = doc.apply([{ op: 'removeMessage', target: { id: 'm1' } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).not.toContain('POST /orders');
  });

  it('removes a fragment and its children in one op', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const result = doc.apply([{ op: 'removeMessage', target: { path: 'messages[1]' } }]);
    expect(result.ok).toBe(true);
    const out = doc.toString();
    expect(out).not.toContain('fragment: alt');
    expect(out).not.toContain('reserve');
  });

  it('refuses to remove a message referenced by a callout or focused by a view (I8)', () => {
    const doc = DiagramDocument.from(FRAGMENT);
    const setup = doc.apply([
      { op: 'addCallout', callout: { id: 'c1', at: 'm1', text: 'On the first message.' } },
      { op: 'setView', view: { id: 'v1', focus: ['m1'] } },
    ]);
    expect(setup.ok).toBe(true);
    const beforeHash = doc.hash();
    const result = doc.apply([{ op: 'removeMessage', target: { id: 'm1' } }]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        {
          path: 'target',
          message: 'cannot remove "m1": referenced by callouts[c1], views[v1].focus',
        },
      ]);
    }
    expect(doc.hash()).toBe(beforeHash);
  });
});
