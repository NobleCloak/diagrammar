import { describe, expect, it } from 'vitest';
import { ConflictError, DiagrammarError, ValidationError } from './errors.js';
import type { ValidationIssue } from './errors.js';

describe('DiagrammarError', () => {
  it('carries a message and a code, and is an instanceof Error', () => {
    const error = new DiagrammarError('something broke', 'engine');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('something broke');
    expect(error.code).toBe('engine');
    expect(error.name).toBe('DiagrammarError');
  });
});

describe('ValidationError', () => {
  it('fixes code to "validation" and stores the issues', () => {
    const issues: ValidationIssue[] = [
      { path: 'edges[1].to', line: 17, message: 'unknown node "shp"' },
      { path: 'nodes[0].shape', message: 'invalid shape "blob"' },
    ];
    const error = new ValidationError(issues);
    expect(error).toBeInstanceOf(DiagrammarError);
    expect(error.code).toBe('validation');
    expect(error.name).toBe('ValidationError');
    expect(error.issues).toBe(issues);
    expect(error.message).toContain('edges[1].to');
    expect(error.message).toContain('unknown node "shp"');
    expect(error.message).toContain('line 17');
    expect(error.message).toContain('nodes[0].shape');
  });

  it('produces a stable message even with zero issues', () => {
    const error = new ValidationError([]);
    expect(error.message.length).toBeGreaterThan(0);
  });
});

describe('ConflictError', () => {
  it('fixes code to "conflict" and stores expected/actual hashes', () => {
    const error = new ConflictError('abc123', 'def456');
    expect(error).toBeInstanceOf(DiagrammarError);
    expect(error.code).toBe('conflict');
    expect(error.name).toBe('ConflictError');
    expect(error.expected).toBe('abc123');
    expect(error.actual).toBe('def456');
    expect(error.message).toContain('abc123');
    expect(error.message).toContain('def456');
  });
});
