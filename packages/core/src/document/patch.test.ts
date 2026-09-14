import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { DiagramDocument } from './DiagramDocument.js';
import { applyJsonPatchOp, parsePointer, type JsonPatchOp } from './patch.js';

const FIXTURES = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'document');
const COMMENTED = readFileSync(join(FIXTURES, 'commented.yaml'), 'utf8');

describe('parsePointer', () => {
  it('parses a simple pointer into a path array', () => {
    expect(parsePointer('/nodes/1/label')).toEqual(['nodes', 1, 'label']);
  });

  it('unescapes ~1 and ~0', () => {
    expect(parsePointer('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
  });

  it('returns an empty array for the root pointer', () => {
    expect(parsePointer('')).toEqual([]);
  });

  it('passes "-" through unconverted', () => {
    expect(parsePointer('/nodes/-')).toEqual(['nodes', '-']);
  });
});

// These operate directly on a plain `yaml` Document (not a diagrammar file)
// so array-insert-vs-overwrite mechanics can be asserted without fighting
// diagrammar's own semantic rules (e.g. duplicate-id rejection), which are
// orthogonal to RFC 6902 itself.
describe('applyJsonPatchOp — array insert semantics', () => {
  function listDoc(): ReturnType<typeof parseDocument> {
    return parseDocument('list:\n  - a\n  - b\n  - c\n');
  }

  it('"add" at a numeric index inserts, shifting later items down', () => {
    const doc = listDoc();
    const result = applyJsonPatchOp(doc, { op: 'add', path: '/list/1', value: 'x' });
    expect('changed' in result).toBe(true);
    expect(doc.toJS()).toEqual({ list: ['a', 'x', 'b', 'c'] });
  });

  it('"move" to a numeric index inserts rather than overwriting', () => {
    const doc = listDoc();
    const result = applyJsonPatchOp(doc, { op: 'move', from: '/list/2', path: '/list/0' });
    expect('changed' in result).toBe(true);
    expect(doc.toJS()).toEqual({ list: ['c', 'a', 'b'] });
  });

  it('"copy" to a numeric index inserts without removing the source', () => {
    const doc = listDoc();
    const result = applyJsonPatchOp(doc, { op: 'copy', from: '/list/2', path: '/list/0' });
    expect('changed' in result).toBe(true);
    expect(doc.toJS()).toEqual({ list: ['c', 'a', 'b', 'c'] });
  });

  it('"move" to "-" appends instead of throwing', () => {
    const doc = listDoc();
    const result = applyJsonPatchOp(doc, { op: 'move', from: '/list/0', path: '/list/-' });
    expect('changed' in result).toBe(true);
    expect(doc.toJS()).toEqual({ list: ['b', 'c', 'a'] });
  });

  it('"copy" to "-" appends instead of throwing', () => {
    const doc = listDoc();
    const result = applyJsonPatchOp(doc, { op: 'copy', from: '/list/0', path: '/list/-' });
    expect('changed' in result).toBe(true);
    expect(doc.toJS()).toEqual({ list: ['a', 'b', 'c', 'a'] });
  });

  it('"move" within the same array where from < to lands at the post-removal index', () => {
    const doc = listDoc();
    const result = applyJsonPatchOp(doc, { op: 'move', from: '/list/0', path: '/list/2' });
    expect('changed' in result).toBe(true);
    expect(doc.toJS()).toEqual({ list: ['b', 'c', 'a'] });
  });

  it('rejects a "move" whose "from" is a proper prefix of "path", leaving the document untouched', () => {
    const doc = listDoc();
    const before = doc.toString();
    const result = applyJsonPatchOp(doc, { op: 'move', from: '/list', path: '/list/0' });
    expect('issues' in result).toBe(true);
    expect(doc.toString()).toBe(before);
  });

  it('allows a "move" where "from" equals "path" (not a proper prefix)', () => {
    const doc = listDoc();
    const result = applyJsonPatchOp(doc, { op: 'move', from: '/list/0', path: '/list/0' });
    expect('changed' in result).toBe(true);
    expect(doc.toJS()).toEqual({ list: ['a', 'b', 'c'] });
  });
});

describe('DiagramDocument.applyPatch', () => {
  it('replaces a scalar field', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.applyPatch([
      { op: 'replace', path: '/title', value: 'Order fulfilment (v2)' },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toBe(
      COMMENTED.replace('title: Order fulfilment', 'title: Order fulfilment (v2)'),
    );
  });

  it('appends to an array with "-"', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.applyPatch([
      { op: 'add', path: '/nodes/-', value: { id: 'pack', label: 'Pack order' } },
    ]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('  - id: pack\n    label: Pack order\n');
  });

  it('removes a field, refusing (as an issue) when it does not exist', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const missing = doc.applyPatch([{ op: 'remove', path: '/nonexistent' }]);
    expect(missing.ok).toBe(false);
    const result = doc.applyPatch([{ op: 'remove', path: '/direction' }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).not.toContain('direction:');
  });

  it('moves a value from one path to another', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.applyPatch([{ op: 'move', from: '/title', path: '/groups/0/label' }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).not.toContain('title:');
    expect(doc.toString()).toContain('label: Order fulfilment');
  });

  it('copies a value, producing an independent copy', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.applyPatch([{ op: 'copy', from: '/title', path: '/groups/0/label' }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('title: Order fulfilment');
    expect(doc.toString()).toContain('label: Order fulfilment');
  });

  it('a passing "test" allows the batch to proceed', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.applyPatch([
      { op: 'test', path: '/type', value: 'flowchart' },
      { op: 'replace', path: '/title', value: 'Order fulfilment (v2)' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('a failing "test" aborts the whole batch, leaving the document untouched', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.applyPatch([
      { op: 'test', path: '/type', value: 'sequence' },
      { op: 'replace', path: '/title', value: 'Should not apply' },
    ]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('is atomic: a patch that would produce an invalid file is rejected and the document is untouched', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.applyPatch([{ op: 'replace', path: '/type', value: 'bogus' }]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('moves a node to an array index, inserting it rather than overwriting the sibling there', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.applyPatch([{ op: 'move', from: '/nodes/2', path: '/nodes/0' }]);
    expect(result.ok).toBe(true);
    expect(doc.model.type !== 'sequence' ? doc.model.nodes.map((n) => n.id) : []).toEqual([
      'ship',
      'start',
      'check',
    ]);
  });

  it('moves a node to "-", appending it', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.applyPatch([{ op: 'move', from: '/nodes/0', path: '/nodes/-' }]);
    expect(result.ok).toBe(true);
    expect(doc.model.type !== 'sequence' ? doc.model.nodes.map((n) => n.id) : []).toEqual([
      'check',
      'ship',
      'start',
    ]);
  });

  it('rejects a "move" whose "from" is a proper prefix of "path", leaving the document untouched', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.applyPatch([{ op: 'move', from: '/nodes', path: '/nodes/0/label' }]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('validates once per batch (I7): an intermediate dangling reference is fine as long as the final state is valid', () => {
    // Removing "ship" alone would leave the "yes" edge (check -> ship)
    // dangling and fail a reparse — but the batch also removes that edge,
    // so the COMBINED end state is valid. Under batch-level validation
    // (applyPatch reparses once, at the end — unlike apply(), which
    // reparses after every op because selectors resolve against the live
    // model) this succeeds; the old per-op reparse would have rejected it
    // at the first op.
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.applyPatch([
      { op: 'remove', path: '/nodes/2' },
      { op: 'remove', path: '/edges/1' },
    ]);
    expect(result.ok).toBe(true);
  });

  it('rolls back the whole batch (hash unchanged) when the final combined state is still invalid (I7)', () => {
    // Removing "ship" leaves the "yes" edge dangling; adding an unrelated
    // node does nothing to fix that — the final state is still invalid, so
    // the whole batch is rejected atomically even though no single op was
    // individually rejected.
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.applyPatch([
      { op: 'remove', path: '/nodes/2' },
      { op: 'add', path: '/nodes/-', value: { id: 'extra' } },
    ]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('rejects a batch with a malformed op upfront (validated like apply()), leaving the document untouched', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    // Valid per the `JsonPatchOp` TS type (`value` is optional there), but
    // "add" requires a `value` under RFC 6902 — this is exactly the case
    // the upfront `JsonPatchOpSchema` validation exists to catch before any
    // mutation runs, the same way `apply()` pre-validates every `Op`.
    const malformed: JsonPatchOp = { op: 'add', path: '/title' };
    const result = doc.applyPatch([
      { op: 'replace', path: '/title', value: 'should not apply' },
      malformed,
    ]);
    expect(result.ok).toBe(false);
    expect(doc.hash()).toBe(beforeHash);
  });
});
