import { describe, expect, it } from 'vitest';
import * as core from './index.js';

describe('public API surface (Plan 01 portion)', () => {
  it('exports VERSION, the error classes, and shutdown', () => {
    expect(typeof core.VERSION).toBe('string');
    expect(typeof core.DiagrammarError).toBe('function');
    expect(typeof core.ValidationError).toBe('function');
    expect(typeof core.ConflictError).toBe('function');
    expect(typeof core.shutdown).toBe('function');
  });

  it('shutdown resolves without throwing when no engine has been created yet', async () => {
    await expect(core.shutdown()).resolves.toBeUndefined();
  });
});
