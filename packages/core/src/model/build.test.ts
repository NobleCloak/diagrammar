import { describe, expect, it } from 'vitest';
import type { DiagramFile } from '../schema/index.js';
import { buildModel } from './build.js';
import type { GraphDiagram, SequenceDiagram } from './types.js';

describe('buildModel — flowchart defaults', () => {
  it('resolves flowchart defaults: layout dagre, direction down, shape rect, theme light', () => {
    const file: DiagramFile = { diagrammar: 1, type: 'flowchart', nodes: [{ id: 'start' }] };
    const diagram = buildModel(file) as GraphDiagram;
    expect(diagram.layout).toBe('dagre');
    expect(diagram.direction).toBe('down');
    expect(diagram.theme).toBe('light');
    expect(diagram.nodes[0]).toMatchObject({ id: 'start', label: 'start', shape: 'rect' });
  });
});

describe('buildModel — architecture defaults', () => {
  it('resolves architecture defaults: layout tala, direction right', () => {
    const file: DiagramFile = { diagrammar: 1, type: 'architecture', nodes: [{ id: 'a' }] };
    const diagram = buildModel(file) as GraphDiagram;
    expect(diagram.layout).toBe('tala');
    expect(diagram.direction).toBe('right');
  });

  it('does not set title when omitted (no "title: undefined" leaking through)', () => {
    const file: DiagramFile = { diagrammar: 1, type: 'architecture', nodes: [{ id: 'a' }] };
    const diagram = buildModel(file);
    expect('title' in diagram).toBe(false);
  });
});

describe('buildModel — edges', () => {
  it('keys an id-less edge as "from->to"', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }, { id: 'check' }],
      edges: [{ from: 'start', to: 'check' }],
    };
    const diagram = buildModel(file) as GraphDiagram;
    expect(diagram.edges[0]?.key).toBe('start->check');
    expect(diagram.edges[0]?.id).toBeUndefined();
  });

  it('keys an explicit-id edge by its id', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }, { id: 'check' }],
      edges: [{ id: 'yes', from: 'check', to: 'check' }],
    };
    const diagram = buildModel(file) as GraphDiagram;
    expect(diagram.edges[0]?.key).toBe('yes');
  });
});

describe('buildModel — groups', () => {
  it('resolves a group label default to its id and "in" to "parent"', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'architecture',
      groups: [{ id: 'warehouse' }, { id: 'fulfilment', in: 'warehouse' }],
      nodes: [{ id: 'a', in: 'fulfilment' }],
    };
    const diagram = buildModel(file) as GraphDiagram;
    expect(diagram.groups[0]).toMatchObject({ id: 'warehouse', label: 'warehouse' });
    expect(diagram.groups[1]?.parent).toBe('warehouse');
    expect(diagram.nodes[0]?.group).toBe('fulfilment');
  });

  it('carries a group style through to the model', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'architecture',
      groups: [{ id: 'warehouse', style: { fill: '#fee' } }],
      nodes: [{ id: 'a', in: 'warehouse' }],
    };
    const diagram = buildModel(file) as GraphDiagram;
    expect(diagram.groups[0]?.style).toEqual({ fill: '#fee' });
  });
});

describe('buildModel — sequence', () => {
  it('resolves participant kind default to service, message style default to sync', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'user' }, { id: 'api' }],
      messages: [{ from: 'user', to: 'api' }],
    };
    const diagram = buildModel(file) as SequenceDiagram;
    expect(diagram.participants[0]).toMatchObject({
      id: 'user',
      label: 'user',
      participantKind: 'service',
    });
    const [first] = diagram.items;
    expect(first?.kind).toBe('message');
    if (first?.kind === 'message') {
      expect(first.style).toBe('sync');
      expect(first.path).toBe('messages[0]');
      expect(first.key).toBe('messages[0]');
    }
  });

  it('computes nested position paths for fragments and their messages', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'api' }, { id: 'db' }, { id: 'user' }],
      messages: [
        { id: 'm1', from: 'user', to: 'api' },
        {
          fragment: 'alt',
          label: 'in stock',
          messages: [{ from: 'api', to: 'db', label: 'reserve' }],
        },
        { from: 'api', to: 'user', style: 'return' },
      ],
    };
    const diagram = buildModel(file) as SequenceDiagram;
    expect(diagram.items[0]?.path).toBe('messages[0]');
    const item0 = diagram.items[0];
    if (item0?.kind === 'message') {
      expect(item0.key).toBe('m1');
    }
    expect(diagram.items[1]?.path).toBe('messages[1]');
    const fragment = diagram.items[1];
    if (fragment?.kind === 'fragment') {
      expect(fragment.messages[0]?.path).toBe('messages[1].messages[0]');
      const nested = fragment.messages[0];
      if (nested?.kind === 'message') {
        expect(nested.key).toBe('messages[1].messages[0]');
      }
    }
    expect(diagram.items[2]?.path).toBe('messages[2]');
  });
});

describe('buildModel — notes and callouts', () => {
  it('keys id-less notes/callouts by position and resolves defaults', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }],
      notes: [{ at: 'start', text: 'hello' }],
      callouts: [{ at: 'start' }],
    };
    const diagram = buildModel(file);
    expect(diagram.notes[0]).toMatchObject({
      key: 'notes[0]',
      at: 'start',
      side: 'right',
      width: 240,
    });
    expect(diagram.callouts[0]).toMatchObject({ key: 'callouts[0]', at: 'start', number: 1 });
  });

  it('resolves an {from, to} "at" target to the composite edge key', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b' }],
      callouts: [{ at: { from: 'a', to: 'b' }, text: 'on the edge' }],
    };
    const diagram = buildModel(file);
    expect(diagram.callouts[0]?.at).toBe('a->b');
  });

  it('resolves callout number to explicit value when given, else 1-based position', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }],
      callouts: [{ at: 'a' }, { at: 'a', number: 9 }],
    };
    const diagram = buildModel(file);
    expect(diagram.callouts[0]?.number).toBe(1);
    expect(diagram.callouts[1]?.number).toBe(9);
  });
});

describe('buildModel — views', () => {
  it('defaults focus to an empty array when omitted', () => {
    const file: DiagramFile = {
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'a' }],
      views: [{ id: 'v1' }],
    };
    const diagram = buildModel(file);
    expect(diagram.views[0]).toMatchObject({ id: 'v1', focus: [] });
  });
});
