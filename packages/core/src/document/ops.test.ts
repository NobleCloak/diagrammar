import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadYaml, parse } from '../parse.js';
import {
  OpSchema,
  parseOp,
  requireGraph,
  requireSequence,
  stripFocus,
  zodIssuesToValidationIssues,
} from './ops.js';

describe('OpSchema — strict op wrappers (C2)', () => {
  it('rejects an unrecognized key on an add* op (typo of "before")', () => {
    const raw: unknown = { op: 'addNode', node: { id: 'p' }, befre: { id: 'start' } };
    const result = OpSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = zodIssuesToValidationIssues(result.error);
      expect(issues.some((issue) => issue.message.includes('befre'))).toBe(true);
    }
  });

  it('rejects an unrecognized key on a remove* op (typo of "cascade")', () => {
    const raw: unknown = { op: 'removeNode', target: { id: 'start' }, casacde: true };
    const result = OpSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = zodIssuesToValidationIssues(result.error);
      expect(issues.some((issue) => issue.message.includes('casacde'))).toBe(true);
    }
  });

  it('emits additionalProperties: false for every op member of the generated JSON Schema', () => {
    const jsonSchema = z.toJSONSchema(OpSchema, { io: 'input' }) as {
      oneOf?: Record<string, unknown>[];
      anyOf?: Record<string, unknown>[];
    };
    const members = jsonSchema.oneOf ?? jsonSchema.anyOf;
    expect(members).toBeDefined();
    expect(members?.length).toBeGreaterThan(0);
    for (const member of members ?? []) {
      expect(member['additionalProperties']).toBe(false);
    }
  });
});

describe('parseOp (I5)', () => {
  it('parses a valid op', () => {
    const result = parseOp({ op: 'addNode', node: { id: 'x' } });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.op).toEqual({ op: 'addNode', node: { id: 'x' } });
    }
  });

  it('returns issues with bracket-notation paths for an invalid op', () => {
    const result = parseOp({ op: 'setView', view: { id: 'v', focus: ['a', 5] } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        { path: 'view.focus[1]', message: 'Invalid input: expected string, received number' },
      ]);
    }
  });
});

const GRAPH_YAML = 'diagrammar: 1\ntype: flowchart\nnodes:\n  - id: a\nedges: []\n';
const SEQUENCE_YAML = 'diagrammar: 1\ntype: sequence\nparticipants:\n  - id: a\nmessages: []\n';

describe('requireGraph / requireSequence (M13)', () => {
  it('requireGraph returns the graph model for a graph diagram', () => {
    const result = parse(GRAPH_YAML);
    if (!result.ok) throw new Error('expected a valid graph diagram');
    const guard = requireGraph(result.diagram, 'addNode', 'nodes');
    expect('graph' in guard).toBe(true);
  });

  it('requireGraph refuses (at the given op/path) for a sequence diagram', () => {
    const result = parse(SEQUENCE_YAML);
    if (!result.ok) throw new Error('expected a valid sequence diagram');
    const guard = requireGraph(result.diagram, 'addNode', 'nodes');
    expect(guard).toEqual({
      issues: [
        { path: 'nodes', message: 'addNode is only valid for flowchart and architecture diagrams' },
      ],
    });
  });

  it('requireSequence returns the sequence model for a sequence diagram', () => {
    const result = parse(SEQUENCE_YAML);
    if (!result.ok) throw new Error('expected a valid sequence diagram');
    const guard = requireSequence(result.diagram, 'addParticipant', 'participants');
    expect('seq' in guard).toBe(true);
  });

  it('requireSequence refuses (at the given op/path) for a graph diagram', () => {
    const result = parse(GRAPH_YAML);
    if (!result.ok) throw new Error('expected a valid graph diagram');
    const guard = requireSequence(result.diagram, 'addParticipant', 'participants');
    expect(guard).toEqual({
      issues: [
        { path: 'participants', message: 'addParticipant is only valid for sequence diagrams' },
      ],
    });
  });
});

describe('stripFocus (M13)', () => {
  // Flow-sequence focus lists are written with yaml's default
  // `flowCollectionPadding` spacing (`[ a, b ]`, not `[a, b]`) so the no-op
  // test below can assert *true* byte-identical round-tripping — an
  // unpadded flow collection gets reformatted with padding on any
  // re-stringify by the `yaml` library itself, even with zero mutations.
  const VIEWS_YAML = `diagrammar: 1
type: flowchart
nodes:
  - id: a
  - id: b
edges: []

views:
  - id: v1
    focus: [ a, b ]
  - id: v2
    focus: [ b ]
`;

  it('strips the removed keys only from views that focus them, reporting only those views as changed', () => {
    const result = parse(VIEWS_YAML);
    if (!result.ok) throw new Error('expected a valid diagram');
    const { doc } = loadYaml(VIEWS_YAML);
    const changed = stripFocus(doc, result.diagram.views, ['a']);
    expect(changed).toEqual(['views[v1].focus']);
    const asJs = doc.toJS() as { views: { id: string; focus: string[] }[] };
    expect(asJs.views).toEqual([
      { id: 'v1', focus: ['b'] },
      { id: 'v2', focus: ['b'] },
    ]);
  });

  it('is a no-op (empty changed list, untouched document) when no view focuses a removed key', () => {
    const result = parse(VIEWS_YAML);
    if (!result.ok) throw new Error('expected a valid diagram');
    const { doc } = loadYaml(VIEWS_YAML);
    const changed = stripFocus(doc, result.diagram.views, ['nonexistent']);
    expect(changed).toEqual([]);
    expect(doc.toString()).toBe(VIEWS_YAML);
  });
});
