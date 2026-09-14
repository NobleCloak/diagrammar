import { describe, it, expect } from 'vitest';
import type { LaidOutDiagram } from '../engine/types.js';
import type { GraphDiagram } from '../model/types.js';
import type { KeyMap, Badge, PlacedNote } from './types.js';
import { buildSidecar, stampAll } from './stamp.js';

function keyMapFor(
  shapeIds: Record<string, string>,
  connectionIds: Record<string, string> = {},
): KeyMap {
  return {
    shapeKey: (id) => shapeIds[id],
    connectionKey: (c) => connectionIds[c.id],
  };
}

function baseModel(overrides: Partial<GraphDiagram> = {}): GraphDiagram {
  return {
    version: 1,
    type: 'flowchart',
    theme: 'light',
    layout: 'dagre',
    direction: 'down',
    notes: [],
    callouts: [],
    views: [],
    groups: [],
    nodes: [
      { kind: 'node', id: 'start', label: 'Start', shape: 'oval' },
      { kind: 'node', id: 'check', label: 'Check', shape: 'rect' },
    ],
    edges: [{ kind: 'edge', key: 'start->check', from: 'start', to: 'check' }],
    ...overrides,
  };
}

describe('buildSidecar', () => {
  it('records a bbox entry for each shape and a route entry for each connection', () => {
    const model = baseModel();
    const laidOut: LaidOutDiagram = {
      shapes: [{ id: 'start', type: 'oval', pos: { x: 0, y: 0 }, width: 20, height: 10, level: 0 }],
      connections: [
        {
          id: '(start -> check)[0]',
          src: 'start',
          dst: 'check',
          route: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      ],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const keyMap = keyMapFor({ start: 'start' }, { '(start -> check)[0]': 'start->check' });
    const sidecar = buildSidecar(model, laidOut, keyMap, [], []);
    expect(sidecar['start']).toEqual({ kind: 'node', bbox: { x: 0, y: 0, width: 20, height: 10 } });
    expect(sidecar['start->check']).toEqual({
      kind: 'edge',
      route: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    });
  });

  it('records a bbox entry for each note and badge, keyed by their own model key', () => {
    const model = baseModel({
      notes: [
        { kind: 'note', key: 'n1', id: 'n1', at: 'check', side: 'right', width: 100, text: 'x' },
      ],
      callouts: [{ kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1, text: 'y' }],
    });
    const laidOut: LaidOutDiagram = {
      shapes: [],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const badges: Badge[] = [
      {
        id: 'dg-callout-1',
        key: 'c1',
        number: 1,
        center: { x: 50, y: 50 },
        targetKey: 'check',
        hidden: false,
        text: 'y',
      },
    ];
    const notes: PlacedNote[] = [
      {
        id: 'dg-note-1',
        key: 'n1',
        box: { x: 10, y: 10, width: 100, height: 30 },
        lines: ['x'],
        hidden: false,
      },
    ];
    const sidecar = buildSidecar(model, laidOut, keyMapFor({}), badges, notes);
    expect(sidecar['n1']).toEqual({ kind: 'note', bbox: { x: 10, y: 10, width: 100, height: 30 } });
    // badge bbox is centered on badge.center with side 2*BADGE_RADIUS=22
    expect(sidecar['c1']).toEqual({
      kind: 'callout',
      bbox: { x: 39, y: 39, width: 22, height: 22 },
    });
  });

  it('adds laidOut.origin to shape and connection coordinates before recording them', () => {
    const model = baseModel();
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'start', type: 'oval', pos: { x: 10, y: 10 }, width: 20, height: 10, level: 0 },
      ],
      connections: [
        {
          id: '(start -> check)[0]',
          src: 'start',
          dst: 'check',
          route: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      ],
      origin: { x: 5, y: -5 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const keyMap = keyMapFor({ start: 'start' }, { '(start -> check)[0]': 'start->check' });
    const sidecar = buildSidecar(model, laidOut, keyMap, [], []);
    // bbox position translates by origin; badges/notes (already-placed pixel
    // geometry) do not — only raw D2 shape/connection coordinates do.
    expect(sidecar['start']).toEqual({
      kind: 'node',
      bbox: { x: 15, y: 5, width: 20, height: 10 },
    });
    expect(sidecar['start->check']).toEqual({
      kind: 'edge',
      route: [
        { x: 5, y: -5 },
        { x: 15, y: 5 },
      ],
    });
  });

  it('skips a connection whose connectionKey is unresolved (D2 synthetic lifeline) silently', () => {
    const model = baseModel();
    const laidOut: LaidOutDiagram = {
      shapes: [],
      connections: [{ id: 'lifeline[0]', src: 'a', dst: 'a', route: [{ x: 0, y: 0 }] }],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    // connectionKey returns undefined for every connection: nothing to resolve.
    const keyMap = keyMapFor({});
    const sidecar = buildSidecar(model, laidOut, keyMap, [], []);
    expect(Object.keys(sidecar)).toEqual([]);
  });
});

// Captured D2 markup — reused verbatim from svg.test.ts's Task 3 capture
// (@d2lang/d2 0.1.34 / D2 0.9.0, dagre layout, theme light) per the Task 3
// controller ruling (also governs Task 8): D2's SVG carries no `id="..."`
// attribute on shape/connection elements; each top-level shape/connection is
// wrapped as `<g class="<base64(xmlEscape(id))>">`. stampAll's own tests must
// exercise real captured markup, not invented `id="..."` tags.
const CAPTURED_NODE_TAG = '<g class="Z2F0ZXdheQ==">';
const CAPTURED_NODE_ID = 'gateway';

const CAPTURED_CONTAINER_TAG = '<g class="d2FyZWhvdXNlLmZ1bGZpbG1lbnQuZGI=">';
const CAPTURED_CONTAINER_ID = 'warehouse.fulfilment.db';

const CAPTURED_CONNECTION_TAG =
  '<g class="d2FyZWhvdXNlLmZ1bGZpbG1lbnQuKHdvcmtlciAtJmd0OyBkYilbMF0=">';
const CAPTURED_CONNECTION_RAW_ID = 'warehouse.fulfilment.(worker -> db)[0]';

describe('stampAll', () => {
  it('stamps data-dg-id and data-dg-kind onto every matched shape and connection', () => {
    const model = baseModel({
      nodes: [
        { kind: 'node', id: 'gateway', label: 'Gateway', shape: 'rect' },
        { kind: 'node', id: 'warehouse.fulfilment.db', label: 'DB', shape: 'cylinder' },
      ],
      edges: [{ kind: 'edge', key: 'gateway->db', from: 'gateway', to: 'warehouse.fulfilment.db' }],
    });
    const svg =
      '<svg viewBox="0 0 100 100">' +
      `${CAPTURED_NODE_TAG}<rect/></g>` +
      `${CAPTURED_CONTAINER_TAG}<rect/></g>` +
      `${CAPTURED_CONNECTION_TAG}<path d="M0 0 L1 1"/></g>` +
      '</svg>';
    const laidOut: LaidOutDiagram = {
      shapes: [
        {
          id: CAPTURED_NODE_ID,
          type: 'rectangle',
          pos: { x: 0, y: 0 },
          width: 10,
          height: 10,
          level: 0,
        },
        {
          id: CAPTURED_CONTAINER_ID,
          type: 'cylinder',
          pos: { x: 20, y: 0 },
          width: 10,
          height: 10,
          level: 0,
        },
      ],
      connections: [
        {
          id: CAPTURED_CONNECTION_RAW_ID,
          src: CAPTURED_NODE_ID,
          dst: CAPTURED_CONTAINER_ID,
          route: [{ x: 0, y: 0 }],
        },
      ],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const keyMap = keyMapFor(
      { [CAPTURED_NODE_ID]: 'gateway', [CAPTURED_CONTAINER_ID]: 'warehouse.fulfilment.db' },
      { [CAPTURED_CONNECTION_RAW_ID]: 'gateway->db' },
    );
    const stamped = stampAll(svg, laidOut, model, keyMap);
    expect(stamped).toContain('<g data-dg-id="gateway" data-dg-kind="node" class="Z2F0ZXdheQ==">');
    expect(stamped).toContain(
      '<g data-dg-id="warehouse.fulfilment.db" data-dg-kind="node" class="d2FyZWhvdXNlLmZ1bGZpbG1lbnQuZGI=">',
    );
    expect(stamped).toContain(
      '<g data-dg-id="gateway-&gt;db" data-dg-kind="edge" class="d2FyZWhvdXNlLmZ1bGZpbG1lbnQuKHdvcmtlciAtJmd0OyBkYilbMF0=">',
    );
  });

  it('skips a connection whose connectionKey is undefined (D2 synthetic lifeline) silently, without warning or stamp', () => {
    const model = baseModel();
    const svg = `<svg viewBox="0 0 100 100">${CAPTURED_CONNECTION_TAG}<path d="M0 0 L1 1"/></g></svg>`;
    const laidOut: LaidOutDiagram = {
      shapes: [],
      connections: [
        { id: CAPTURED_CONNECTION_RAW_ID, src: 'a', dst: 'b', route: [{ x: 0, y: 0 }] },
      ],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    // connectionKey resolves nothing — the synthetic-lifeline case.
    const keyMap = keyMapFor({});
    const stamped = stampAll(svg, laidOut, model, keyMap);
    expect(stamped).toBe(svg);
  });

  it('leaves shapes and connections unstamped when no matching model element is found for the resolved key', () => {
    const model = baseModel({ nodes: [], edges: [] });
    const svg = `<svg viewBox="0 0 100 100">${CAPTURED_NODE_TAG}<rect/></g></svg>`;
    const laidOut: LaidOutDiagram = {
      shapes: [
        {
          id: CAPTURED_NODE_ID,
          type: 'rectangle',
          pos: { x: 0, y: 0 },
          width: 10,
          height: 10,
          level: 0,
        },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    // shapeKey resolves to a key, but that key is not present in the model.
    const keyMap = keyMapFor({ [CAPTURED_NODE_ID]: 'ghost' });
    const stamped = stampAll(svg, laidOut, model, keyMap);
    expect(stamped).toBe(svg);
  });
});
