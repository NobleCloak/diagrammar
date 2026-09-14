import { describe, expect, it } from 'vitest';
import { parseDocument, YAMLSeq } from 'yaml';
import {
  styleOfFirstItem,
  createItem,
  insertAt,
  removeAt,
  replaceAt,
  findIndexById,
  getOrCreateSeq,
} from './yamlStyle.js';

const FIXTURE = `nodes:
  - id: start
    label: Start
  - id: end
    label: End
edges:
  - { from: start, to: end }
`;

describe('styleOfFirstItem', () => {
  it('reports block style for a block-style sequence', () => {
    const doc = parseDocument(FIXTURE);
    const seq = doc.get('nodes') as YAMLSeq;
    expect(styleOfFirstItem(seq)).toBe('block');
  });

  it('reports flow style for a flow-style sequence', () => {
    const doc = parseDocument(FIXTURE);
    const seq = doc.get('edges') as YAMLSeq;
    expect(styleOfFirstItem(seq)).toBe('flow');
  });

  it('defaults to block for an empty sequence', () => {
    const doc = parseDocument('nodes: []\n');
    const seq = doc.get('nodes') as YAMLSeq;
    expect(styleOfFirstItem(seq)).toBe('block');
  });
});

describe('createItem', () => {
  it('creates a block mapping preserving key order', () => {
    const doc = parseDocument(FIXTURE);
    const node = createItem(doc, { shape: 'rect', id: 'z', label: 'Z' }, 'block');
    doc.setIn(['scratch'], node);
    expect(doc.toString()).toContain('scratch:\n  shape: rect\n  id: z\n  label: Z\n');
  });

  it('creates a flow mapping', () => {
    const doc = parseDocument(FIXTURE);
    const node = createItem(doc, { from: 'a', to: 'b' }, 'flow');
    doc.setIn(['scratch'], node);
    expect(doc.toString()).toContain('scratch: { from: a, to: b }');
  });
});

describe('insertAt / removeAt', () => {
  it('inserts a node at a given index, shifting later items down', () => {
    const doc = parseDocument(FIXTURE);
    const seq = doc.get('nodes') as YAMLSeq;
    const node = createItem(doc, { id: 'mid', label: 'Mid' }, 'block');
    insertAt(seq, 1, node);
    const out = doc.toString();
    const lines = out.split('\n');
    expect(lines).toContain('  - id: mid');
    expect(out.indexOf('id: mid')).toBeLessThan(out.indexOf('id: end'));
    expect(out.indexOf('id: start')).toBeLessThan(out.indexOf('id: mid'));
  });

  it('removes the item at a given index', () => {
    const doc = parseDocument(FIXTURE);
    const seq = doc.get('nodes') as YAMLSeq;
    removeAt(seq, 0);
    expect(doc.toString()).not.toContain('id: start');
    expect(doc.toString()).toContain('id: end');
  });
});

describe('replaceAt', () => {
  it('replaces the item at a given index without shifting others', () => {
    const doc = parseDocument(FIXTURE);
    const seq = doc.get('nodes') as YAMLSeq;
    const node = createItem(doc, { id: 'replaced', label: 'Replaced' }, 'block');
    replaceAt(seq, 0, node);
    const out = doc.toString();
    expect(out).toContain('id: replaced');
    expect(out).not.toContain('id: start');
    expect(out).toContain('id: end');
    expect(seq.items.length).toBe(2);
  });
});

describe('findIndexById', () => {
  it('finds the index of a mapping item by its id field', () => {
    const doc = parseDocument(FIXTURE);
    const seq = doc.get('nodes') as YAMLSeq;
    expect(findIndexById(seq, 'end')).toBe(1);
    expect(findIndexById(seq, 'nope')).toBe(-1);
  });
});

describe('getOrCreateSeq', () => {
  it('returns the existing sequence when the key is present', () => {
    const doc = parseDocument(FIXTURE);
    const seq = getOrCreateSeq(doc, 'nodes');
    expect(seq.items.length).toBe(2);
  });

  it('creates an empty sequence when the key is absent', () => {
    const doc = parseDocument('nodes: []\n');
    const seq = getOrCreateSeq(doc, 'notes');
    expect(seq.items.length).toBe(0);
    expect(doc.toString()).toContain('notes: []');
  });
});
