import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '../parse.js';
import { compile, createKeyMap, d2KeyFor, modelKeyFor, modelKeyForConnection } from './index.js';
import { compileAndRender } from '../engine/index.js';
import type { Diagram, GraphDiagram, SequenceDiagram } from '../model/types.js';
import type { LaidOutConnection } from '../engine/types.js';
import { buildTheme, presetTheme, resolveTheme } from '../theme/index.js';

function fixture(name: string, ext: 'yaml' | 'd2'): string {
  return readFileSync(
    fileURLToPath(new URL(`../../test/fixtures/compile/${name}.${ext}`, import.meta.url)),
    'utf-8',
  );
}

function loadDiagram(name: string): Diagram {
  const parsed = parse(fixture(name, 'yaml'));
  if (!parsed.ok)
    throw new Error(`fixture ${name} failed to parse: ${JSON.stringify(parsed.issues)}`);
  return parsed.diagram;
}

describe('compile', () => {
  it('dispatches flowchart/architecture models to compileGraph', () => {
    const model = loadDiagram('flowchart-basic');
    const { d2 } = compile(model);
    expect(d2).toBe(fixture('flowchart-basic', 'd2'));
  });

  it('dispatches sequence models to compileSequence', () => {
    const model = loadDiagram('sequence-basic');
    const { d2 } = compile(model);
    expect(d2).toBe(fixture('sequence-basic', 'd2'));
  });

  it('compiles a named view', () => {
    const model = loadDiagram('flowchart-view');
    const { d2 } = compile(model, 'happy');
    expect(d2).toBe(fixture('flowchart-view', 'd2'));
  });

  it('throws a DiagrammarError with code unknown_view for an unknown view id', () => {
    const model = loadDiagram('flowchart-basic');
    expect(() => compile(model, 'nope')).toThrow(expect.objectContaining({ code: 'unknown_view' }));
  });

  it('returns a keyMap from absolute D2 keys to model keys for a graph model', () => {
    const model = loadDiagram('architecture-nested') as GraphDiagram;
    const { keyMap } = compile(model);
    expect(keyMap.get('warehouse.fulfilment')).toBe('fulfilment');
    expect(keyMap.get('warehouse.fulfilment.db')).toBe('db');
    expect(keyMap.get('gateway')).toBe('gateway');
  });

  it('returns a keyMap from seq.<id> to participant id for a sequence model', () => {
    const model = loadDiagram('sequence-basic') as SequenceDiagram;
    const { keyMap } = compile(model);
    expect(keyMap.get('seq.user')).toBe('user');
    expect(keyMap.get('seq.db')).toBe('db');
  });

  it('maps a fragment model key to its quoted D2 shape id, without mapping the root seq container', () => {
    const model = loadDiagram('sequence-fragments') as SequenceDiagram;
    const { keyMap } = compile(model);
    expect(keyMap.get('seq."messages[1]"')).toBe('messages[1]');
    expect(modelKeyFor(model, 'seq."messages[1]"')).toBe('messages[1]');
    expect(keyMap.has('seq')).toBe(false);
  });

  it('maps a nested fragment to its quoted, dot-joined D2 shape id', () => {
    const model = loadDiagram('sequence-nested') as SequenceDiagram;
    const { keyMap } = compile(model);
    expect(keyMap.get('seq."messages[1]"')).toBe('messages[1]');
    expect(keyMap.get('seq."messages[1]"."messages[1].messages[1]"')).toBe(
      'messages[1].messages[1]',
    );
  });

  it('quotes reserved-D2-keyword node ids so the emitted D2 still compiles', async () => {
    const model: GraphDiagram = {
      version: 1,
      type: 'flowchart',
      theme: 'light',
      layout: 'dagre',
      direction: 'down',
      groups: [],
      nodes: [
        { kind: 'node', id: 'link', label: 'Link', shape: 'rect' },
        { kind: 'node', id: 'icon', label: 'Icon', shape: 'rect' },
        { kind: 'node', id: 'label', label: 'Label', shape: 'rect' },
        { kind: 'node', id: 'style', label: 'Style', shape: 'rect' },
      ],
      edges: [{ kind: 'edge', key: 'link->icon', id: 'link->icon', from: 'link', to: 'icon' }],
      notes: [],
      callouts: [],
      views: [],
    };
    const { d2 } = compile(model);
    const { laidOut } = await compileAndRender(d2, {
      layout: model.layout,
      themeId: (await resolveTheme(model.theme, undefined)).d2ThemeId,
    });
    const ids = laidOut.shapes.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['link', 'icon', 'label', 'style']));
  }, 30000);
});

describe('d2KeyFor / modelKeyFor', () => {
  it('round-trips a nested group and node key', () => {
    const model = loadDiagram('architecture-nested') as GraphDiagram;
    expect(d2KeyFor(model, 'db')).toBe('warehouse.fulfilment.db');
    expect(modelKeyFor(model, 'warehouse.fulfilment.db')).toBe('db');
  });

  it('round-trips a sequence participant key', () => {
    const model = loadDiagram('sequence-basic') as SequenceDiagram;
    expect(d2KeyFor(model, 'user')).toBe('seq.user');
    expect(modelKeyFor(model, 'seq.user')).toBe('user');
  });

  it('modelKeyFor returns undefined for an unknown D2 key', () => {
    const model = loadDiagram('flowchart-basic');
    expect(modelKeyFor(model, 'nonexistent.key')).toBeUndefined();
  });

  it('d2KeyFor throws a DiagrammarError with code unknown_element for an unknown model key', () => {
    const model = loadDiagram('flowchart-basic');
    expect(() => d2KeyFor(model, 'nonexistent')).toThrow(
      expect.objectContaining({ code: 'unknown_element' }),
    );
  });
});

describe('createKeyMap', () => {
  it('resolves every real connection to its model key across two independent compile+createKeyMap passes (root, then a view)', async () => {
    const model = loadDiagram('flowchart-view') as GraphDiagram;

    const { d2: rootD2 } = compile(model);
    const { laidOut: rootLaidOut } = await compileAndRender(rootD2, {
      layout: model.layout,
      themeId: (await resolveTheme(model.theme, undefined)).d2ThemeId,
    });
    const rootKeyMap = createKeyMap(model, rootLaidOut);
    const rootKeys = rootLaidOut.connections.map((c) => rootKeyMap.connectionKey(c));

    const { d2: viewD2 } = compile(model, 'happy');
    const { laidOut: viewLaidOut } = await compileAndRender(viewD2, {
      layout: model.layout,
      themeId: (await resolveTheme(model.theme, undefined)).d2ThemeId,
    });
    const viewKeyMap = createKeyMap(model, viewLaidOut);
    const viewKeys = viewLaidOut.connections.map((c) => viewKeyMap.connectionKey(c));

    expect(rootKeys).toEqual(['go', 'yes']);
    expect(viewKeys).toEqual(['go', 'yes']);
  }, 30000);

  it('shapeKey resolves real shapes to their model keys', async () => {
    const model = loadDiagram('architecture-nested') as GraphDiagram;
    const { d2 } = compile(model);
    const { laidOut } = await compileAndRender(d2, {
      layout: model.layout,
      themeId: (await resolveTheme(model.theme, undefined)).d2ThemeId,
    });
    const keyMap = createKeyMap(model, laidOut);
    expect(keyMap.shapeKey('warehouse.fulfilment.db')).toBe('db');
    expect(keyMap.shapeKey('gateway')).toBe('gateway');
  }, 30000);
});

describe('modelKeyForConnection', () => {
  it('resolves again after a second compile() on the same model, instead of continuing the prior counter', async () => {
    const model = loadDiagram('flowchart-basic') as GraphDiagram;

    const { d2: d2a } = compile(model);
    const { laidOut: laidOutA } = await compileAndRender(d2a, {
      layout: model.layout,
      themeId: (await resolveTheme(model.theme, undefined)).d2ThemeId,
    });
    for (const conn of laidOutA.connections) modelKeyForConnection(model, conn);

    const { d2: d2b } = compile(model);
    const { laidOut: laidOutB } = await compileAndRender(d2b, {
      layout: model.layout,
      themeId: (await resolveTheme(model.theme, undefined)).d2ThemeId,
    });
    const keys = laidOutB.connections.map((conn) => modelKeyForConnection(model, conn));
    expect(keys).toEqual(['start->check', 'yes']);
  }, 30000);

  // `conn.id` is deliberately set to a value that does NOT follow D2's real
  // `(src -> dst)[n]` format in every test below — this function must pair
  // purely by `src`/`dst` + emission order (contract §11 item 11) and must
  // never read `conn.id` at all.
  it('resolves the first connection between a pair to the emission-order-0 edge, ignoring conn.id entirely', () => {
    const model = loadDiagram('flowchart-basic') as GraphDiagram;
    const conn: LaidOutConnection = { id: 'not-parsed', src: 'start', dst: 'check', route: [] };
    expect(modelKeyForConnection(model, conn)).toBe('start->check');
  });

  it('resolves the second edge in file order to emission index 1 for its own pair, ignoring conn.id entirely', () => {
    const model = loadDiagram('flowchart-basic') as GraphDiagram;
    const conn: LaidOutConnection = { id: 'not-parsed', src: 'check', dst: 'ship', route: [] };
    expect(modelKeyForConnection(model, conn)).toBe('yes');
  });

  it('resolves a sequence message connection by its seq.<id> src/dst, ignoring conn.id entirely', () => {
    const model = loadDiagram('sequence-basic') as SequenceDiagram;
    const conn: LaidOutConnection = {
      id: 'not-parsed',
      src: 'seq.user',
      dst: 'seq.api',
      route: [],
    };
    expect(modelKeyForConnection(model, conn)).toBe('m1');
  });

  it('returns undefined for a connection that does not match any emitted edge', () => {
    const model = loadDiagram('flowchart-basic') as GraphDiagram;
    const conn: LaidOutConnection = { id: 'not-parsed', src: 'start', dst: 'ship', route: [] };
    expect(modelKeyForConnection(model, conn)).toBeUndefined();
  });

  function parallelEdgeModel(): GraphDiagram {
    return {
      version: 1,
      type: 'flowchart',
      theme: 'light',
      layout: 'dagre',
      direction: 'down',
      groups: [],
      nodes: [
        { kind: 'node', id: 'a', label: 'A', shape: 'rect' },
        { kind: 'node', id: 'b', label: 'B', shape: 'rect' },
      ],
      edges: [
        { kind: 'edge', key: 'first', id: 'first', from: 'a', to: 'b', label: 'one' },
        { kind: 'edge', key: 'second', id: 'second', from: 'a', to: 'b', label: 'two' },
      ],
      notes: [],
      callouts: [],
      views: [],
    };
  }

  it('resolves parallel edges between the same pair by first-seen order, not by conn.id', () => {
    const model = parallelEdgeModel();
    const connOne: LaidOutConnection = { id: 'irrelevant', src: 'a', dst: 'b', route: [] };
    const connTwo: LaidOutConnection = { id: 'irrelevant', src: 'a', dst: 'b', route: [] };
    expect(modelKeyForConnection(model, connOne)).toBe('first');
    expect(modelKeyForConnection(model, connTwo)).toBe('second');
  });

  it('is idempotent: re-querying the same connection object never advances the pair counter', () => {
    // Plan 04's overlay re-walks `laidOut.connections` from more than one
    // function within a single applyOverlay call (indexConnections,
    // stampAll, ...), calling `connectionKey`/`modelKeyForConnection` again
    // for the same LaidOutConnection object each time. A naive "count total
    // calls" implementation would desync; the real one must not.
    const model = parallelEdgeModel();
    const connOne: LaidOutConnection = { id: 'irrelevant', src: 'a', dst: 'b', route: [] };
    const connTwo: LaidOutConnection = { id: 'irrelevant', src: 'a', dst: 'b', route: [] };

    expect(modelKeyForConnection(model, connOne)).toBe('first');
    expect(modelKeyForConnection(model, connOne)).toBe('first');
    expect(modelKeyForConnection(model, connTwo)).toBe('second');
    expect(modelKeyForConnection(model, connOne)).toBe('first');
    expect(modelKeyForConnection(model, connTwo)).toBe('second');
  });
});

const THEME = buildTheme(
  {
    'diagrammar-theme': 1,
    base: 'light',
    palette: { background: '#fafafa', text: '#101010', edge: '#333333' },
    defaults: {
      shapes: { cylinder: { fill: '#e8f5e9' } },
      messages: { return: { fontColor: '#777' } },
    },
  },
  './house.yaml',
);

describe('compile with a theme', () => {
  const graphYaml =
    'diagrammar: 1\ntype: architecture\nnodes:\n  - { id: db, shape: cylinder }\n  - { id: api, style: { fill: "#own" } }\nedges:\n  - { from: api, to: db }\n';
  const seqYaml =
    'diagrammar: 1\ntype: sequence\nparticipants:\n  - { id: a }\n  - { id: b }\nmessages:\n  - { from: a, to: b, style: return }\n';

  it('is byte-identical to no theme when given a preset', () => {
    const p = parse(graphYaml);
    if (!p.ok) throw new Error('fixture');
    expect(compile(p.diagram, undefined, presetTheme('light')).d2).toBe(compile(p.diagram).d2);
  });

  it('emits theme-overrides inside d2-config for a graph and applies per-shape defaults', () => {
    const p = parse(graphYaml);
    if (!p.ok) throw new Error('fixture');
    const { d2 } = compile(p.diagram, undefined, THEME);
    expect(d2).toContain(
      'vars: {\n  d2-config: {\n    layout-engine: tala\n    theme-overrides: {\n      N1: "#101010"\n      N2: "#101010"\n      N7: "#fafafa"\n    }\n  }\n}',
    );
    expect(d2).toContain('"db": {\n  shape: cylinder\n  label: "db"\n  style.fill: "#e8f5e9"\n}');
    expect(d2).toContain('"api": {\n  shape: rectangle\n  label: "api"\n  style.fill: "#own"\n}');
    expect(d2).toContain('"api" -> "db": {\n  style.stroke: "#333333"\n}');
  });

  it('emits a vars block before seq for a sequence diagram and themes messages', () => {
    const p = parse(seqYaml);
    if (!p.ok) throw new Error('fixture');
    const { d2 } = compile(p.diagram, undefined, THEME);
    expect(
      d2.startsWith('vars: {\n  d2-config: {\n    theme-overrides: {\n      N1: "#101010"'),
    ).toBe(true);
    expect(d2).toContain(
      '  "a" -> "b": {\n    style.stroke: "#333333"\n    style.stroke-dash: 3\n    style.font-color: "#777"\n    target-arrowhead: {\n      shape: arrow\n    }\n  }',
    );
  });

  it('keeps view dimming last, after the arrowhead block, for a themed dimmed return message', () => {
    const p = parse(seqYaml + 'views:\n  - { id: v, focus: [a] }\n');
    if (!p.ok) throw new Error('fixture');
    const { d2 } = compile(p.diagram, 'v', THEME);
    expect(d2).toContain(
      '    target-arrowhead: {\n      shape: arrow\n    }\n    style.opacity: 0.25\n  }',
    );
  });
});
