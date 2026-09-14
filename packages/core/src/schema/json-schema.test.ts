import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateJsonSchema, generateThemeJsonSchema } from './json-schema.js';

describe('generateJsonSchema', () => {
  it('produces a draft 2020-12 object schema with the discriminated union inline', () => {
    const result = generateJsonSchema();
    expect(result['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    // A discriminated union of two `.strict()` object schemas compiles to
    // an "anyOf" (or "oneOf") of two object schemas under Zod 4's
    // z.toJSONSchema — assert structurally rather than on the exact key,
    // since either is a correct draft 2020-12 rendering of a Zod union.
    const hasUnionKeyword = 'anyOf' in result || 'oneOf' in result;
    expect(hasUnionKeyword).toBe(true);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const committedPath = join(here, '..', '..', 'schema', 'diagrammar-v1.json');

describe('committed schema/diagrammar-v1.json', () => {
  it('matches a fresh generation (no drift)', () => {
    const committed = readFileSync(committedPath, 'utf8');
    const fresh = `${JSON.stringify(generateJsonSchema(), null, 2)}\n`;
    expect(committed).toBe(fresh);
  });
});

describe('committed schema/diagrammar-theme-v1.json', () => {
  it('matches a fresh generation (no drift)', () => {
    const committed = readFileSync(
      join(here, '..', '..', 'schema', 'diagrammar-theme-v1.json'),
      'utf8',
    );
    const fresh = `${JSON.stringify(generateThemeJsonSchema(), null, 2)}\n`;
    expect(committed).toBe(fresh);
  });
});
