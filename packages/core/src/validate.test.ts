import { describe, expect, it } from 'vitest';
import { validate } from './validate.js';

describe('validate', () => {
  it('returns ok:true and no issues for a valid file', () => {
    const result = validate('diagrammar: 1\ntype: flowchart\nnodes:\n  - id: start\n');
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('returns ok:false with issues for an invalid file, without building a diagram', () => {
    const result = validate(
      'diagrammar: 1\ntype: flowchart\nnodes:\n  - id: start\n    shape: star\n',
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === 'nodes[0].shape')).toBe(true);
    expect('diagram' in result).toBe(false);
  });
});
