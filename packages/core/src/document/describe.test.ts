import { describe as vitestDescribe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe } from './describe.js';

const FIXTURES = join(import.meta.dirname, '..', '..', 'test', 'fixtures', 'document');
const GOLDEN = readFileSync(join(FIXTURES, 'describe-golden.yaml'), 'utf8');
const SEQUENCE_GOLDEN = readFileSync(join(FIXTURES, 'describe-sequence.yaml'), 'utf8');

vitestDescribe('describe — golden flowchart example', () => {
  it('produces the exact expected structural summary', () => {
    const result = describe(GOLDEN);
    const expectedHash = createHash('sha256').update(GOLDEN).digest('hex');
    expect(result).toEqual({
      hash: expectedHash,
      valid: true,
      issues: [],
      type: 'flowchart',
      title: 'Order fulfilment',
      theme: 'light',
      layout: 'dagre',
      direction: 'down',
      elements: [
        {
          kind: 'group',
          key: 'fulfilment',
          id: 'fulfilment',
          selector: { id: 'fulfilment' },
          label: 'Fulfilment',
          refs: [],
        },
        {
          kind: 'node',
          key: 'start',
          id: 'start',
          selector: { id: 'start' },
          label: 'Order received',
          in: 'fulfilment',
          refs: ['fulfilment'],
        },
        {
          kind: 'node',
          key: 'check',
          id: 'check',
          selector: { id: 'check' },
          label: 'Check stock',
          in: 'fulfilment',
          refs: ['fulfilment'],
        },
        {
          kind: 'node',
          key: 'ship',
          id: 'ship',
          selector: { id: 'ship' },
          label: 'Ship order',
          in: 'fulfilment',
          refs: ['fulfilment'],
        },
        {
          kind: 'edge',
          key: 'start->check',
          selector: { from: 'start', to: 'check' },
          from: 'start',
          to: 'check',
          refs: ['start', 'check'],
        },
        {
          kind: 'edge',
          key: 'yes',
          id: 'yes',
          selector: { id: 'yes' },
          label: 'yes',
          from: 'check',
          to: 'ship',
          refs: ['check', 'ship'],
        },
      ],
      notes: [
        {
          key: 'n1',
          id: 'n1',
          selector: { id: 'n1' },
          at: 'check',
          text: 'Checks the reservation ledger, not raw stock.',
        },
      ],
      callouts: [
        {
          key: 'c1',
          id: 'c1',
          selector: { id: 'c1' },
          at: 'yes',
          number: 1,
          text: 'Happy path continues here.',
        },
      ],
      views: [{ id: 'happy', title: 'Happy path', focus: ['start', 'check', 'ship', 'yes'] }],
    });
  });
});

vitestDescribe('describe — golden sequence example', () => {
  it('produces the exact expected structural summary, with path selectors for id-less items', () => {
    const result = describe(SEQUENCE_GOLDEN);
    const expectedHash = createHash('sha256').update(SEQUENCE_GOLDEN).digest('hex');
    expect(result).toEqual({
      hash: expectedHash,
      valid: true,
      issues: [],
      type: 'sequence',
      title: 'Golden sequence',
      theme: 'light',
      layout: 'dagre',
      elements: [
        {
          kind: 'participant',
          key: 'user',
          id: 'user',
          selector: { id: 'user' },
          label: 'User',
          refs: [],
        },
        {
          kind: 'participant',
          key: 'api',
          id: 'api',
          selector: { id: 'api' },
          label: 'API',
          refs: [],
        },
        {
          kind: 'participant',
          key: 'db',
          id: 'db',
          selector: { id: 'db' },
          label: 'Database',
          refs: [],
        },
        {
          kind: 'message',
          key: 'm1',
          id: 'm1',
          selector: { id: 'm1' },
          from: 'user',
          to: 'api',
          path: 'messages[0]',
          label: 'POST /orders',
          refs: ['user', 'api'],
        },
        {
          kind: 'message',
          key: 'messages[1]',
          selector: { path: 'messages[1]' },
          from: 'api',
          to: 'db',
          path: 'messages[1]',
          label: 'check stock',
          refs: ['api', 'db'],
        },
        {
          kind: 'fragment',
          key: 'messages[2]',
          selector: { path: 'messages[2]' },
          path: 'messages[2]',
          label: 'in stock',
          refs: [],
        },
        {
          kind: 'message',
          key: 'messages[2].messages[0]',
          selector: { path: 'messages[2].messages[0]' },
          from: 'db',
          to: 'api',
          path: 'messages[2].messages[0]',
          label: 'confirmed',
          refs: ['db', 'api'],
        },
      ],
      notes: [
        {
          key: 'notes[0]',
          selector: { path: 'notes[0]' },
          at: 'm1',
          text: 'Entry point.',
        },
      ],
      callouts: [],
      views: [],
    });
  });
});

vitestDescribe('describe — invalid input', () => {
  it('reports valid: false with issues, keeping whatever meta it can read', () => {
    const result = describe('diagrammar: 1\ntype: bogus\ntitle: Broken\n');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.title).toBe('Broken');
    expect(result.elements).toEqual([]);
    expect(result.hash).toBe(
      createHash('sha256').update('diagrammar: 1\ntype: bogus\ntitle: Broken\n').digest('hex'),
    );
  });

  it('drops an invalid enum-like meta field instead of returning a bogus-typed value (M10)', () => {
    const result = describe('diagrammar: 1\ntype: bogus\ntheme: neon\ntitle: Broken\n');
    expect(result.valid).toBe(false);
    expect(result.type).toBeUndefined();
    expect(result.theme).toBeUndefined();
    expect(result.title).toBe('Broken');
  });
});
