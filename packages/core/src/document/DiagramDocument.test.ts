import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DiagramDocument } from './DiagramDocument.js';
import { describe as describeDiagram } from './describe.js';
import { ValidationError } from '../errors.js';

const FIXTURES = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'document');
const COMMENTED = readFileSync(join(FIXTURES, 'commented.yaml'), 'utf8');
const SEQUENCE = readFileSync(join(FIXTURES, 'sequence-minimal.yaml'), 'utf8');

describe('DiagramDocument.from', () => {
  it('parses a valid file and exposes its model', () => {
    const doc = DiagramDocument.from(COMMENTED);
    expect(doc.model.type).toBe('flowchart');
    expect(doc.toString()).toBe(COMMENTED);
  });

  it('throws ValidationError for an invalid file', () => {
    expect(() => DiagramDocument.from('diagrammar: 1\ntype: bogus\n')).toThrow(ValidationError);
  });
});

describe('DiagramDocument.apply — empty batch (no-op)', () => {
  it('leaves the document byte-identical and reports no changes', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const beforeHash = doc.hash();
    const result = doc.apply([]);
    expect(result).toEqual({ ok: true, changed: [] });
    expect(doc.toString()).toBe(COMMENTED);
    expect(doc.hash()).toBe(beforeHash);
  });
});

describe('DiagramDocument.apply — setMeta', () => {
  it('sets a new title', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'setMeta', patch: { title: 'Order fulfilment (v2)' } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).toContain('title: Order fulfilment (v2)\n');
    expect(doc.model.title).toBe('Order fulfilment (v2)');
  });

  it('deletes the title when patched with null', () => {
    const doc = DiagramDocument.from(COMMENTED);
    const result = doc.apply([{ op: 'setMeta', patch: { title: null } }]);
    expect(result.ok).toBe(true);
    expect(doc.toString()).not.toContain('title:');
  });

  it('refuses direction on a sequence diagram, leaving the document untouched', () => {
    const doc = DiagramDocument.from(SEQUENCE);
    const beforeText = doc.toString();
    const beforeHash = doc.hash();
    const result = doc.apply([{ op: 'setMeta', patch: { direction: 'down' } }]);
    expect(result.ok).toBe(false);
    expect(doc.toString()).toBe(beforeText);
    expect(doc.hash()).toBe(beforeHash);
  });

  it('is atomic across a batch: a valid op followed by an invalid op applies neither', () => {
    const doc = DiagramDocument.from(SEQUENCE);
    const beforeText = doc.toString();
    const result = doc.apply([
      { op: 'setMeta', patch: { title: 'Renamed' } },
      { op: 'setMeta', patch: { direction: 'down' } },
    ]);
    expect(result.ok).toBe(false);
    expect(doc.toString()).toBe(beforeText);
    expect(doc.model.title).toBe('Minimal sequence');
  });
});

describe('DiagramDocument.describe (M12)', () => {
  it('delegates to describe(this.toString())', () => {
    const doc = DiagramDocument.from(COMMENTED);
    expect(doc.describe()).toEqual(describeDiagram(doc.toString()));
  });

  it('reflects mutations made via apply()', () => {
    const doc = DiagramDocument.from(COMMENTED);
    doc.apply([{ op: 'setMeta', patch: { title: 'Renamed' } }]);
    expect(doc.describe().title).toBe('Renamed');
  });
});

describe('DiagramDocument.hash', () => {
  it('returns the sha256 hex of toString()', async () => {
    const { createHash } = await import('node:crypto');
    const doc = DiagramDocument.from(COMMENTED);
    expect(doc.hash()).toBe(createHash('sha256').update(COMMENTED).digest('hex'));
  });
});
