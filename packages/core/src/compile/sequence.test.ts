import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '../parse.js';
import { compileSequence } from './sequence.js';
import type { SequenceDiagram } from '../model/types.js';

function fixture(name: string, ext: 'yaml' | 'd2'): string {
  return readFileSync(
    fileURLToPath(new URL(`../../test/fixtures/compile/${name}.${ext}`, import.meta.url)),
    'utf-8',
  );
}

describe('compileSequence', () => {
  it('compiles participants and top-level messages to nested D2', () => {
    const yaml = fixture('sequence-basic', 'yaml');
    const expected = fixture('sequence-basic', 'd2');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as SequenceDiagram;
    expect(compileSequence(model)).toBe(expected);
  });

  it('compiles a fragment as a nested D2 group keyed by its model path', () => {
    const yaml = fixture('sequence-fragments', 'yaml');
    const expected = fixture('sequence-fragments', 'd2');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as SequenceDiagram;
    expect(compileSequence(model)).toBe(expected);
  });

  it('compiles a nested fragment, dimming it and its contents when a view excludes it', () => {
    const yaml = fixture('sequence-nested', 'yaml');
    const expected = fixture('sequence-nested', 'd2');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as SequenceDiagram;
    const view = model.views.find((v) => v.id === 'no-backorder');
    if (!view) throw new Error('fixture is missing the "no-backorder" view');
    expect(compileSequence(model, view)).toBe(expected);
  });

  it('dims non-focused participants and messages for a view', () => {
    const yaml = fixture('sequence-view', 'yaml');
    const expected = fixture('sequence-view', 'd2');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as SequenceDiagram;
    const view = model.views.find((v) => v.id === 'request-only');
    if (!view) throw new Error('fixture is missing the "request-only" view');
    expect(compileSequence(model, view)).toBe(expected);
  });

  it('view dimming overrides an authored opacity: exactly one style.opacity line at 0.25', () => {
    const yaml = `
diagrammar: 1
type: sequence
title: Opacity override

participants:
  - id: user
    label: User
    kind: actor
    style: { opacity: 0.8 }
  - id: api
    label: API

messages:
  - { from: user, to: api, label: 'ping' }

views:
  - id: only-api
    focus: [api]
`;
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as SequenceDiagram;
    const view = model.views.find((v) => v.id === 'only-api');
    if (!view) throw new Error('fixture is missing the "only-api" view');
    const d2 = compileSequence(model, view);
    const userBlockMatch = /"user": \{[\s\S]*?\n {2}\}/.exec(d2);
    if (!userBlockMatch) throw new Error('user block not found in compiled D2');
    const userBlock = userBlockMatch[0];
    const opacityLines = userBlock.match(/style\.opacity:[^\n]*/g) ?? [];
    expect(opacityLines).toEqual(['style.opacity: 0.25']);
  });
});
