import { describe, expect, it } from 'vitest';
import { parse } from '../parse.js';

/**
 * Unions declared with a custom `error` must surface that message through
 * the full document pipeline (`parse()` -> `zodErrorToIssues`), not one
 * branch's raw "must match pattern" text. Both `theme` and `icon` are such
 * unions; the sequence-item union (no custom error) keeps branch resolution.
 */
describe('custom union messages survive zodErrorToIssues', () => {
  it('reports an unknown bare theme name with the preset list', () => {
    const result = parse('diagrammar: 1\ntype: flowchart\ntheme: neon\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      {
        path: 'theme',
        message: expect.stringContaining('light, dark, colorblind, mono') as string,
        line: 3,
      },
    ]);
  });

  it('reports a malformed icon reference naming both forms', () => {
    const result = parse('diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, icon: database }\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ path: 'nodes[0].icon', line: 4 });
    expect(result.issues[0]?.message).toContain('<set>/<name>');
    expect(result.issues[0]?.message).not.toContain('must match pattern');
  });

  it('still resolves the sequence-item union to the concrete branch', () => {
    const result = parse(
      'diagrammar: 1\ntype: sequence\nparticipants:\n  - { id: a }\nmessages:\n  - { fragment: alt, messages: [] }\n  - { from: a }\n',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.path === 'messages[1].to')).toBe(true);
  });
});
