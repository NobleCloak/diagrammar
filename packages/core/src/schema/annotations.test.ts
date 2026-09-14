import { describe, expect, it } from 'vitest';
import { CalloutSchema, NoteSchema, ViewSchema } from './annotations.js';

describe('NoteSchema', () => {
  it('accepts a fully specified note', () => {
    const result = NoteSchema.safeParse({
      id: 'n1',
      at: 'check',
      side: 'right',
      width: 240,
      text: 'Checks the reservation ledger, not raw stock.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a floating note (no "at", no "id")', () => {
    const result = NoteSchema.safeParse({ text: 'Floating note.' });
    expect(result.success).toBe(true);
  });

  it('accepts an "at" targeting an id-less edge via {from, to}', () => {
    const result = NoteSchema.safeParse({ at: { from: 'a', to: 'b' }, text: 'On the edge.' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid side', () => {
    const result = NoteSchema.safeParse({ text: 'x', side: 'center' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const result = NoteSchema.safeParse({ text: 'x', color: 'red' });
    expect(result.success).toBe(false);
  });

  it('requires text', () => {
    const result = NoteSchema.safeParse({ id: 'n1' });
    expect(result.success).toBe(false);
  });
});

describe('CalloutSchema', () => {
  it('accepts a fully specified callout', () => {
    const result = CalloutSchema.safeParse({
      id: 'c1',
      at: 'yes',
      number: 1,
      text: 'Happy path continues here.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a callout with no text (badge only)', () => {
    const result = CalloutSchema.safeParse({ at: 'yes' });
    expect(result.success).toBe(true);
  });

  it('requires "at"', () => {
    const result = CalloutSchema.safeParse({ text: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const result = CalloutSchema.safeParse({ at: 'yes', color: 'red' });
    expect(result.success).toBe(false);
  });
});

describe('ViewSchema', () => {
  it('accepts a fully specified view', () => {
    const result = ViewSchema.safeParse({
      id: 'happy',
      title: 'Happy path',
      focus: ['start', 'check', 'ship', 'yes'],
    });
    expect(result.success).toBe(true);
  });

  it('requires id', () => {
    const result = ViewSchema.safeParse({ focus: ['start'] });
    expect(result.success).toBe(false);
  });

  it('accepts an omitted focus list', () => {
    const result = ViewSchema.safeParse({ id: 'v1' });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed id', () => {
    const result = ViewSchema.safeParse({ id: '1 bad id' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const result = ViewSchema.safeParse({ id: 'v1', color: 'red' });
    expect(result.success).toBe(false);
  });
});
