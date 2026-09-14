import { describe, expect, it } from 'vitest';
import { indexElements, type Diagram, type GraphDiagram, type SequenceDiagram } from './types.js';

function minimalGraph(): GraphDiagram {
  return {
    version: 1,
    type: 'flowchart',
    theme: 'light',
    layout: 'dagre',
    direction: 'down',
    notes: [],
    callouts: [],
    views: [],
    groups: [{ kind: 'group', id: 'g1', label: 'Group 1' }],
    nodes: [
      { kind: 'node', id: 'start', label: 'Start', shape: 'oval' },
      { kind: 'node', id: 'check', label: 'Check', shape: 'diamond', group: 'g1' },
    ],
    edges: [
      { kind: 'edge', key: 'start->check', from: 'start', to: 'check' },
      { kind: 'edge', key: 'yes', id: 'yes', from: 'check', to: 'check', label: 'yes' },
    ],
  };
}

function minimalSequence(): SequenceDiagram {
  return {
    version: 1,
    type: 'sequence',
    theme: 'light',
    layout: 'dagre',
    notes: [],
    callouts: [],
    views: [],
    participants: [
      { kind: 'participant', id: 'user', label: 'User', participantKind: 'actor' },
      { kind: 'participant', id: 'api', label: 'api', participantKind: 'service' },
    ],
    items: [
      {
        kind: 'message',
        key: 'messages[0]',
        path: 'messages[0]',
        from: 'user',
        to: 'api',
        style: 'sync',
      },
      {
        kind: 'fragment',
        path: 'messages[1]',
        fragment: 'alt',
        messages: [
          {
            kind: 'message',
            key: 'messages[1].messages[0]',
            path: 'messages[1].messages[0]',
            from: 'api',
            to: 'user',
            style: 'return',
          },
        ],
      },
    ],
  };
}

describe('indexElements (graph)', () => {
  it('indexes groups, nodes, and edges by their key', () => {
    const index = indexElements(minimalGraph());
    expect(index.get('g1')?.kind).toBe('group');
    expect(index.get('start')?.kind).toBe('node');
    expect(index.get('start->check')?.kind).toBe('edge');
    expect(index.get('yes')?.kind).toBe('edge');
  });
  it('keys() lists every indexed element', () => {
    const index = indexElements(minimalGraph());
    expect(new Set(index.keys())).toEqual(new Set(['g1', 'start', 'check', 'start->check', 'yes']));
  });
  it('returns undefined for an unknown key', () => {
    expect(indexElements(minimalGraph()).get('nope')).toBeUndefined();
  });
});

describe('indexElements (sequence)', () => {
  it('indexes participants, messages, and fragments (recursively)', () => {
    const index = indexElements(minimalSequence());
    expect(index.get('user')?.kind).toBe('participant');
    expect(index.get('messages[0]')?.kind).toBe('message');
    expect(index.get('messages[1]')?.kind).toBe('fragment');
    expect(index.get('messages[1].messages[0]')?.kind).toBe('message');
  });
});

describe('indexElements (notes/callouts, common to all families)', () => {
  it('indexes notes and callouts by key', () => {
    const diagram: Diagram = {
      ...minimalGraph(),
      notes: [
        { kind: 'note', key: 'n1', id: 'n1', side: 'right', width: 240, text: 'hi', at: 'start' },
      ],
      callouts: [{ kind: 'callout', key: 'callouts[0]', at: 'start', number: 1 }],
    };
    const index = indexElements(diagram);
    expect(index.get('n1')?.kind).toBe('note');
    expect(index.get('callouts[0]')?.kind).toBe('callout');
  });
});
