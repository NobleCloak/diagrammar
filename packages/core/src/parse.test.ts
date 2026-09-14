import { describe, expect, it } from 'vitest';
import { loadYaml, parse } from './parse.js';

const FLOWCHART_YAML = `diagrammar: 1
type: flowchart
nodes:
  - id: start
    label: Order received
  - id: check
edges:
  - { from: start, to: check }
  - { id: yes, from: check, to: check, label: "yes" }
`;

describe('loadYaml', () => {
  it('parses a plain JS value with mapAsMap: false', () => {
    const { value } = loadYaml(FLOWCHART_YAML);
    expect(value).toMatchObject({ diagrammar: 1, type: 'flowchart' });
    expect(Array.isArray((value as { nodes: unknown }).nodes)).toBe(true);
  });

  it('keeps a yaml Document with getIn available', () => {
    const { doc } = loadYaml(FLOWCHART_YAML);
    expect(doc.getIn(['type'])).toBe('flowchart');
  });

  it('resolves the line of a top-level scalar', () => {
    const { lineOf } = loadYaml(FLOWCHART_YAML);
    expect(lineOf('type')).toBe(2);
  });

  it('resolves the line of a nested array-index field', () => {
    const { lineOf } = loadYaml(FLOWCHART_YAML);
    expect(lineOf('nodes[1].id')).toBe(6);
  });

  it('resolves the line of a flow-mapping field inside an array', () => {
    const { lineOf } = loadYaml(FLOWCHART_YAML);
    expect(lineOf('edges[1].to')).toBe(9);
  });

  it('returns undefined for a path that does not exist', () => {
    const { lineOf } = loadYaml(FLOWCHART_YAML);
    expect(lineOf('nodes[9].id')).toBeUndefined();
    expect(lineOf('bogus.path')).toBeUndefined();
  });

  it('returns undefined for an empty path', () => {
    const { lineOf } = loadYaml(FLOWCHART_YAML);
    expect(lineOf('')).toBeUndefined();
  });
});

describe('loadYaml with malformed YAML', () => {
  it('still returns a Document exposing parse errors, rather than throwing', () => {
    const { doc } = loadYaml('nodes:\n  - id: start\n  bad indent: true\n');
    expect(doc.errors.length).toBeGreaterThan(0);
  });
});

describe('parse — malformed YAML', () => {
  it('reports a single-line message, not the full multi-line snippet+caret Zod/yaml prints', () => {
    const result = parse('nodes:\n  - id: start\n  bad indent: true\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.message).not.toContain('\n');
    }
  });
});

describe('parse — success', () => {
  it('returns the built Diagram and the original text', () => {
    const yaml = 'diagrammar: 1\ntype: flowchart\nnodes:\n  - id: start\n';
    const result = parse(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.diagram.type).toBe('flowchart');
      expect(result.text).toBe(yaml);
    }
  });
});

describe('parse — schema failure with line numbers', () => {
  it('reports the line of an invalid shape', () => {
    const yaml = 'diagrammar: 1\ntype: flowchart\nnodes:\n  - id: start\n    shape: star\n';
    const result = parse(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.path === 'nodes[0].shape');
      expect(issue?.line).toBe(5);
    }
  });
});

describe('parse — semantic failure with line numbers', () => {
  it('reports the line of an unresolved edge target (spec §3.6 example shape)', () => {
    const yaml =
      'diagrammar: 1\ntype: flowchart\nnodes:\n  - id: start\nedges:\n  - { from: start, to: shp }\n';
    const result = parse(yaml);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((i) => i.path === 'edges[0].to');
      expect(issue?.message).toBe('unknown node "shp"');
      expect(issue?.line).toBe(6);
    }
  });
});

describe('parse — malformed YAML', () => {
  it('returns issues instead of throwing', () => {
    const result = parse('nodes:\n  - id: start\n  bad indent: true\n');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
