import { describe, expect, it } from 'vitest';
import { DiagramFileSchema } from './index.js';
import { formatZodPath, zodErrorToIssues } from './issues.js';

describe('formatZodPath', () => {
  it('formats a mixed string/number path in dotted/bracket form', () => {
    expect(formatZodPath(['edges', 1, 'to'])).toBe('edges[1].to');
  });
  it('formats a bare top-level key', () => {
    expect(formatZodPath(['title'])).toBe('title');
  });
  it('formats an empty path as an empty string', () => {
    expect(formatZodPath([])).toBe('');
  });
});

describe('zodErrorToIssues', () => {
  it('maps a simple field error to path + message', () => {
    const raw = { diagrammar: 1, type: 'flowchart', nodes: [{ id: 'n', shape: 'star' }] };
    const result = DiagramFileSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const issues = zodErrorToIssues(result.error, raw);
    expect(issues.some((i) => i.path === 'nodes[0].shape')).toBe(true);
  });

  it('resolves an invalid sequence item to the message branch when it looks like a message', () => {
    const raw = {
      diagrammar: 1,
      type: 'sequence',
      messages: [{ from: 'a', to: 'b', style: 'not-a-style' }],
    };
    const result = DiagramFileSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const issues = zodErrorToIssues(result.error, raw);
    const issue = issues.find((i) => i.path === 'messages[0].style');
    expect(issue?.message).toMatch(/sync|async|return/);
  });

  it('resolves an invalid sequence item to the fragment branch when it looks like a fragment', () => {
    const raw = {
      diagrammar: 1,
      type: 'sequence',
      messages: [{ fragment: 'while', messages: [] }],
    };
    const result = DiagramFileSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const issues = zodErrorToIssues(result.error, raw);
    const issue = issues.find((i) => i.path === 'messages[0].fragment');
    expect(issue?.message).toMatch(/alt|loop|opt|par/);
  });

  it('resolves a nested fragment message error to the full nested path', () => {
    const raw = {
      diagrammar: 1,
      type: 'sequence',
      messages: [{ fragment: 'alt', messages: [{ from: 'a', to: 'b', style: 'bogus' }] }],
    };
    const result = DiagramFileSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const issues = zodErrorToIssues(result.error, raw);
    const issue = issues.find((i) => i.path === 'messages[0].messages[0].style');
    expect(issue?.message).toMatch(/sync|async|return/);
  });

  it("reports a typo'd discriminator with Zod's own message, not a resolved branch", () => {
    const raw = { diagrammar: 1, type: 'flowchar', nodes: [{ id: 'start' }] };
    const result = DiagramFileSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const issues = zodErrorToIssues(result.error, raw);
    const issue = issues.find((i) => i.path === 'type');
    expect(issue?.message).toContain('Invalid discriminator value');
  });

  it('reports a missing discriminator with the same discriminator-mismatch message', () => {
    const raw = { diagrammar: 1, nodes: [{ id: 'start' }] };
    const result = DiagramFileSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const issues = zodErrorToIssues(result.error, raw);
    const issue = issues.find((i) => i.path === 'type');
    expect(issue?.message).toContain('Invalid discriminator value');
  });

  it('resolves a bad SelectorRef union member (number) to the string-branch message', () => {
    const raw = {
      diagrammar: 1,
      type: 'flowchart',
      nodes: [{ id: 'start' }],
      notes: [{ at: 123, text: 'x' }],
    };
    const result = DiagramFileSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    const issues = zodErrorToIssues(result.error, raw);
    const issue = issues.find((i) => i.path === 'notes[0].at');
    expect(issue?.message.toLowerCase()).toContain('string');
  });
});
