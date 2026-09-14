import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ValidationIssue } from './errors.js';
import { validate } from './validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const validDir = join(here, '..', 'test', 'fixtures', 'valid');
const invalidDir = join(here, '..', 'test', 'fixtures', 'invalid');

interface ExpectedIssue {
  path: string;
  message: string;
  line?: number;
}

describe('valid fixtures', () => {
  const files = readdirSync(validDir).filter((f) => f.endsWith('.yaml'));

  it('has at least 5 valid fixtures', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of files) {
    it(`${file} validates cleanly`, () => {
      const text = readFileSync(join(validDir, file), 'utf8');
      expect(validate(text)).toEqual({ ok: true, issues: [] });
    });
  }
});

describe('invalid fixtures', () => {
  const files = readdirSync(invalidDir).filter((f) => f.endsWith('.yaml'));

  it('has at least 10 invalid fixtures (one per rule/class)', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    it(`${file} fails validation with the expected issues`, () => {
      const text = readFileSync(join(invalidDir, file), 'utf8');
      const expectedPath = join(invalidDir, `${file.replace(/\.yaml$/, '')}.issues.json`);
      const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as ExpectedIssue[];

      const result = validate(text);
      expect(result.ok).toBe(false);
      const actual: ValidationIssue[] = result.issues;

      expect(actual).toHaveLength(expected.length);

      for (const exp of expected) {
        const match = actual.find(
          (a) =>
            a.path === exp.path &&
            (exp.message.length === 0 ||
              a.message.toLowerCase().includes(exp.message.toLowerCase())) &&
            (exp.line === undefined || a.line === exp.line),
        );
        expect(
          match,
          `expected an issue matching ${JSON.stringify(exp)} in ${JSON.stringify(actual)}`,
        ).toBeDefined();
      }
    });
  }
});
