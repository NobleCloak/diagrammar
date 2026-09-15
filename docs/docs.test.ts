import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, OpSchema, JsonPatchOpSchema, parseThemeFile } from '@noblecloak/diagrammar-core';

// This suite keeps the three user/agent-facing docs (README.md,
// docs/format-guide.md, plugin/skills/diagrammar/SKILL.md) honest: every fenced ```yaml block in
// them must be a complete, self-contained Diagrammar document that actually
// parses — except a block whose text contains a `diagrammar-theme:` line,
// which is validated as a theme file (`parseThemeFile`) instead. For ```json
// blocks: one that IS an array, or an object carrying its ops/patch under an
// "ops"/"patch" key (the shape of a `diagrammar_edit` call — an array either
// way, once unwrapped), must contain only operations that validate against
// the real `OpSchema`/`JsonPatchOpSchema` from @noblecloak/diagrammar-core
// (M11) — a doc that drifts from the schema fails here before it misleads a
// reader or an agent. A ```json block that parses to some other object shape
// (e.g. an `.mcp.json`-style client config) is only required to parse as
// JSON; it isn't an ops/patch example and isn't held to that schema.

const docsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(docsDir, '..');

const DOC_FILES = [
  path.join(repoRoot, 'README.md'),
  path.join(docsDir, 'format-guide.md'),
  path.join(repoRoot, 'plugin/skills/diagrammar/SKILL.md'),
];

function extractFencedBlocks(markdown: string, lang: 'yaml' | 'json'): string[] {
  const re = new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g');
  const blocks: string[] = [];
  for (const match of markdown.matchAll(re)) {
    const body = match[1];
    if (body !== undefined) blocks.push(body);
  }
  return blocks;
}

/** An item that validates against either op shape is accepted — `diagrammar_edit` and `diagrammar edit` both accept typed ops OR an RFC 6902 JSON Patch array. */
function isValidEditItem(item: unknown): boolean {
  return OpSchema.safeParse(item).success || JsonPatchOpSchema.safeParse(item).success;
}

/** `Array.isArray` narrows to `any[]` in lib.d.ts; this re-widens to `unknown[]` right after the check so callers never handle an implicit `any`. */
function asUnknownArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? (value as unknown[]) : undefined;
}

/** Pulls the array of operations out of a `diagrammar_edit`-shaped JSON block: a bare array, or an object carrying it under "ops" or "patch". */
function extractOpsArray(parsed: unknown): unknown[] | undefined {
  const bare = asUnknownArray(parsed);
  if (bare !== undefined) return bare;
  if (typeof parsed === 'object' && parsed !== null) {
    const record = parsed as Record<string, unknown>;
    return asUnknownArray(record.ops) ?? asUnknownArray(record.patch);
  }
  return undefined;
}

describe('docs YAML blocks parse as valid Diagrammar documents', () => {
  for (const file of DOC_FILES) {
    const name = path.relative(repoRoot, file);
    const text = readFileSync(file, 'utf-8');
    const blocks = extractFencedBlocks(text, 'yaml');

    it(`${name} has at least one \`\`\`yaml block`, () => {
      expect(blocks.length).toBeGreaterThan(0);
    });

    it.each(blocks.map((block, index) => ({ index, block })))(
      `${name} yaml block #$index parses`,
      ({ block }) => {
        if (/^diagrammar-theme:/m.test(block)) {
          const result = parseThemeFile(block, 'doc-block.yaml');
          expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true);
          return;
        }
        const result = parse(block);
        expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true);
      },
    );
  }
});

describe('docs JSON blocks parse; ops/patch arrays validate against OpSchema/JsonPatchOpSchema', () => {
  for (const file of DOC_FILES) {
    const name = path.relative(repoRoot, file);
    const text = readFileSync(file, 'utf-8');
    const blocks = extractFencedBlocks(text, 'json');

    it.each(blocks.map((block, index) => ({ index, block })))(
      `${name} json block #$index parses, and its ops (if any) validate`,
      ({ block }) => {
        // M11: only a block that parses to an array — a bare ops/patch array,
        // or an object's "ops"/"patch" field once unwrapped — is held to
        // OpSchema/JsonPatchOpSchema. Anything else (e.g. a plain client
        // config object) just needs to be valid JSON, which the JSON.parse
        // above already demands.
        const parsed: unknown = JSON.parse(block);
        const ops = extractOpsArray(parsed);
        if (ops === undefined) return;
        for (const op of ops) {
          expect(isValidEditItem(op), `invalid op/patch item: ${JSON.stringify(op)}`).toBe(true);
        }
      },
    );
  }
});
