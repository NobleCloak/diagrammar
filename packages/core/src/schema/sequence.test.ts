import { describe, expect, it } from 'vitest';
import {
  FragmentSchema,
  MessageSchema,
  ParticipantSchema,
  SequenceFileSchema,
  SequenceItemSchema,
} from './sequence.js';

describe('ParticipantSchema', () => {
  it('accepts a fully specified participant', () => {
    expect(ParticipantSchema.safeParse({ id: 'user', label: 'User', kind: 'actor' }).success).toBe(
      true,
    );
  });
  it('accepts every kind', () => {
    for (const kind of ['actor', 'service', 'database', 'queue']) {
      expect(ParticipantSchema.safeParse({ id: 'p', kind }).success).toBe(true);
    }
  });
  it('rejects an unknown kind', () => {
    expect(ParticipantSchema.safeParse({ id: 'p', kind: 'robot' }).success).toBe(false);
  });
  it('rejects a malformed id (would break Plan 03\'s bare "seq.<id>" D2 keys)', () => {
    expect(ParticipantSchema.safeParse({ id: 'user one' }).success).toBe(false);
  });
});

describe('MessageSchema', () => {
  it('accepts a fully specified message', () => {
    const result = MessageSchema.safeParse({
      id: 'm1',
      from: 'user',
      to: 'api',
      label: 'POST /orders',
      style: 'sync',
    });
    expect(result.success).toBe(true);
  });
  it('accepts every style', () => {
    for (const style of ['sync', 'async', 'return']) {
      expect(MessageSchema.safeParse({ from: 'a', to: 'b', style }).success).toBe(true);
    }
  });
  it('rejects a "fragment" key (that would make it fragment-shaped)', () => {
    expect(MessageSchema.safeParse({ from: 'a', to: 'b', fragment: 'alt' }).success).toBe(false);
  });
  it('rejects a malformed explicit id', () => {
    expect(MessageSchema.safeParse({ id: 'm 1', from: 'a', to: 'b' }).success).toBe(false);
  });
});

describe('FragmentSchema', () => {
  it('accepts a fragment with nested messages', () => {
    const result = FragmentSchema.safeParse({
      fragment: 'alt',
      label: 'in stock',
      messages: [{ from: 'api', to: 'db', label: 'reserve' }],
    });
    expect(result.success).toBe(true);
  });
  it('accepts a fragment nested inside a fragment', () => {
    const result = FragmentSchema.safeParse({
      fragment: 'loop',
      messages: [{ fragment: 'opt', messages: [{ from: 'a', to: 'b' }] }],
    });
    expect(result.success).toBe(true);
  });
  it('rejects an unknown fragment kind', () => {
    expect(FragmentSchema.safeParse({ fragment: 'while', messages: [] }).success).toBe(false);
  });
});

describe('SequenceItemSchema', () => {
  it('accepts a bare message', () => {
    expect(SequenceItemSchema.safeParse({ from: 'a', to: 'b' }).success).toBe(true);
  });
  it('accepts a bare fragment', () => {
    expect(
      SequenceItemSchema.safeParse({ fragment: 'alt', messages: [{ from: 'a', to: 'b' }] }).success,
    ).toBe(true);
  });
  it('rejects something that is neither', () => {
    expect(SequenceItemSchema.safeParse({ label: 'orphan' }).success).toBe(false);
  });
});

describe('SequenceFileSchema', () => {
  it('accepts the spec example', () => {
    const result = SequenceFileSchema.safeParse({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'user', label: 'User', kind: 'actor' }, { id: 'api' }, { id: 'db' }],
      messages: [
        { id: 'm1', from: 'user', to: 'api', label: 'POST /orders', style: 'sync' },
        {
          fragment: 'alt',
          label: 'in stock',
          messages: [{ from: 'api', to: 'db', label: 'reserve' }],
        },
        { from: 'api', to: 'user', label: '201 Created', style: 'return' },
      ],
    });
    expect(result.success).toBe(true);
  });
  it('rejects graph-only keys (nodes/edges/groups)', () => {
    const result = SequenceFileSchema.safeParse({
      diagrammar: 1,
      type: 'sequence',
      participants: [{ id: 'a' }],
      nodes: [{ id: 'n' }],
    });
    expect(result.success).toBe(false);
  });
  it('rejects a direction key (graph-family only)', () => {
    const result = SequenceFileSchema.safeParse({
      diagrammar: 1,
      type: 'sequence',
      direction: 'down',
      participants: [{ id: 'a' }],
    });
    expect(result.success).toBe(false);
  });
});
