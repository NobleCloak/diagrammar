import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parse, OpSchema, JsonPatchOpSchema } from '@noblecloak/diagrammar-core';
import { GUIDE } from './guide.js';

function extractFencedBlocks(markdown: string, lang: string): string[] {
  const blocks: string[] = [];
  const fence = new RegExp('```' + lang + '\\n([\\s\\S]*?)```', 'g');
  for (const match of markdown.matchAll(fence)) {
    const block = match[1];
    if (block !== undefined) blocks.push(block);
  }
  return blocks;
}

const yamlBlocks = extractFencedBlocks(GUIDE, 'yaml');
const jsonBlocks = extractFencedBlocks(GUIDE, 'json');

// Any item in a `diagrammar_edit` JSON example is either a typed Op or a
// JSON Patch op — the guide never mixes the two shapes within one example,
// but this validates each item against whichever schema it actually
// matches rather than assuming example order.
const opOrPatchSchema = z.union([OpSchema, JsonPatchOpSchema]);

describe('GUIDE', () => {
  it('contains at least one fenced yaml example', () => {
    expect(yamlBlocks.length).toBeGreaterThan(0);
  });

  it.each(yamlBlocks.map((block, i) => [i, block] as const))(
    'fenced yaml example %i parses successfully',
    (_i, block) => {
      const result = parse(block);
      expect(result.ok).toBe(true);
    },
  );

  it('documents every OpSchema discriminator value (derived from the schema, not hand-copied)', () => {
    const opNames = OpSchema.options.map((option) => option.shape.op.value);
    expect(opNames.length).toBeGreaterThan(0);
    for (const name of opNames) {
      expect(GUIDE).toContain(name);
    }
  });

  it('contains at least one fenced json example for diagrammar_edit', () => {
    expect(jsonBlocks.length).toBeGreaterThan(0);
  });

  it.each(jsonBlocks.map((block, i) => [i, block] as const))(
    'fenced json example %i parses and every item validates against OpSchema or JsonPatchOpSchema',
    (_i, block) => {
      const parsed: unknown = JSON.parse(block);
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed as unknown[]) {
        const result = opOrPatchSchema.safeParse(item);
        expect(result.success).toBe(true);
      }
    },
  );

  it('does not use "yes"/"no" as a bare YAML id (M18)', () => {
    expect(GUIDE).not.toMatch(/id:\s*yes\b/);
    expect(GUIDE).not.toMatch(/at:\s*yes\b/);
  });
});
