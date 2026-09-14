import { describe, expect, it } from 'vitest';
import * as core from './index.js';
import {
  VERSION,
  createDocument,
  generateJsonSchema,
  indexElements,
  parse,
  resolveSelector,
  validate,
} from './index.js';

describe('VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});

describe('public index.ts exports', () => {
  it('exposes parse, validate, createDocument', () => {
    const text = createDocument({ type: 'flowchart', title: 'Smoke test' });
    expect(validate(text)).toEqual({ ok: true, issues: [] });
    const result = parse(text);
    expect(result.ok).toBe(true);
  });

  it('exposes indexElements and resolveSelector for model consumers', () => {
    const result = parse(createDocument({ type: 'flowchart' }));
    if (!result.ok) throw new Error('expected a valid document');
    const index = indexElements(result.diagram);
    expect(index.get('start')?.kind).toBe('node');
    const selected = resolveSelector(result.diagram, { id: 'start' });
    expect('code' in selected).toBe(false);
  });

  it('exposes generateJsonSchema as a callable value (contract §5 / §11 item 5)', () => {
    expect(typeof generateJsonSchema).toBe('function');
    const schema = generateJsonSchema();
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
  });
});

describe('document/ops public exports (Plan 05)', () => {
  it('exports DiagramDocument, OpSchema, describe, and their types are usable', () => {
    expect(typeof core.DiagramDocument).toBe('function');
    expect(typeof core.OpSchema.safeParse).toBe('function');
    expect(typeof core.describe).toBe('function');
  });

  it('exports parseOp and JsonPatchOpSchema (I5/I6)', () => {
    expect(typeof core.parseOp).toBe('function');
    const parsed = core.parseOp({ op: 'addNode', node: { id: 'x' } });
    expect(parsed.ok).toBe(true);
    expect(typeof core.JsonPatchOpSchema.safeParse).toBe('function');
    expect(core.JsonPatchOpSchema.safeParse({ op: 'remove', path: '/title' }).success).toBe(true);
  });

  it('exposes DescribedElement/DescribedNote/DescribedCallout/DescribedView as usable types (I6)', () => {
    const described = core.describe(
      'diagrammar: 1\ntype: flowchart\nnodes:\n  - id: a\nedges: []\n',
    );
    const element: core.DescribedElement | undefined = described.elements[0];
    const note: core.DescribedNote | undefined = described.notes[0];
    const callout: core.DescribedCallout | undefined = described.callouts[0];
    const view: core.DescribedView | undefined = described.views[0];
    expect(element?.kind).toBe('node');
    expect(note).toBeUndefined();
    expect(callout).toBeUndefined();
    expect(view).toBeUndefined();
  });

  it('DiagramDocument.from + apply + describe work together end-to-end through the public API', () => {
    const doc = core.DiagramDocument.from(
      'diagrammar: 1\ntype: flowchart\nnodes:\n  - id: a\nedges: []\n',
    );
    const result = doc.apply([{ op: 'addNode', node: { id: 'b', label: 'B' } }]);
    expect(result.ok).toBe(true);
    const described = core.describe(doc.toString());
    expect(described.valid).toBe(true);
    expect(described.elements.some((element) => element.key === 'b')).toBe(true);
  });
});

describe('public API surface', () => {
  it('exports render as a function', () => {
    expect(typeof core.render).toBe('function');
  });

  it('exports walkthrough as a function', () => {
    expect(typeof core.walkthrough).toBe('function');
  });

  it('walkthrough(yaml) parses and emits Markdown for valid YAML', () => {
    const yaml = [
      'diagrammar: 1',
      'type: flowchart',
      'title: Smoke',
      'direction: down',
      'layout: dagre',
      'nodes:',
      '  - id: a',
      '    label: A',
      'edges: []',
      '',
    ].join('\n');
    expect(core.walkthrough(yaml)).toContain('# Smoke');
  });

  it('walkthrough(yaml) throws ValidationError for invalid YAML', () => {
    // `diagrammar: 1\ntype: flowchart\n` (the brief's original literal) is
    // actually valid per Plan 02's schema — nodes/edges/views all default to
    // `[]` — so it does not exercise this path. Use a genuine schema
    // violation instead (same fixture pattern as render.test.ts's analogous
    // case and parse.test.ts's "parse — schema failure with line numbers").
    expect(() =>
      core.walkthrough('diagrammar: 1\ntype: flowchart\nnodes:\n  - id: start\n    shape: star\n'),
    ).toThrow(expect.objectContaining({ code: 'validation' }));
  });
});
