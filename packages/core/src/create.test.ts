import { describe, expect, it } from 'vitest';
import { createDocument } from './create.js';
import { validate } from './validate.js';

describe('createDocument', () => {
  it('starts with the schema header comment and diagrammar: 1', () => {
    const text = createDocument({ type: 'flowchart' });
    expect(
      text.startsWith(
        '# yaml-language-server: $schema=https://raw.githubusercontent.com/NobleCloak/diagrammar/main/packages/core/schema/diagrammar-v1.json\n',
      ),
    ).toBe(true);
    expect(text).toContain('diagrammar: 1');
  });

  it('includes the title when given', () => {
    const text = createDocument({ type: 'flowchart', title: 'Order fulfilment' });
    expect(text).toContain('title: Order fulfilment');
  });

  it.each(['flowchart', 'architecture', 'sequence'] as const)(
    'produces a document that itself passes validate() for type=%s',
    (type) => {
      const text = createDocument({ type });
      const result = validate(text);
      expect(result).toEqual({ ok: true, issues: [] });
    },
  );
});
