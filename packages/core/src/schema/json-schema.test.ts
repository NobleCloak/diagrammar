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

  it('emits the theme path pattern flagless, spelling out case-insensitivity in the pattern itself', () => {
    // The top-level schema is a `oneOf` of the graph/sequence file schemas,
    // each carrying its own `theme` property, so search the serialized
    // schema rather than navigating one fixed path.
    const serialized = JSON.stringify(generateJsonSchema());
    const patterns = [...serialized.matchAll(/"pattern":"((?:\\.|[^"\\])*)"/g)].map(
      (m) => m[1] ?? '',
    );
    expect(patterns.length).toBeGreaterThan(0);
    // No JSON Schema `pattern` carries regex flags, so the source itself
    // must already be case-insensitive: it should spell out [yY] rather
    // than relying on an /i flag that toJSONSchema cannot express.
    expect(patterns.some((p) => p.includes('[yY]'))).toBe(true);
  });

  it('emits icon as an anyOf of the two accepted forms, not a bare string', () => {
    const result = generateJsonSchema();
    const nodeDefs = JSON.stringify(result);
    // Structural sanity check: the union produces two `pattern` branches
    // (set-ref form and .svg path form) rather than a single bare-string
    // `icon` property (spec §8's published JSON Schema).
    const iconMatches = [...nodeDefs.matchAll(/"icon":\{"anyOf":\[(\{[^}]*\}),(\{[^}]*\})\]\}/g)];
    expect(iconMatches.length).toBeGreaterThan(0);
    for (const match of iconMatches) {
      expect(match[1]).toContain('"pattern"');
      expect(match[2]).toContain('"pattern"');
    }
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
