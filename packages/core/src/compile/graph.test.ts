import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '../parse.js';
import { compileGraph, absNodeKey, absGroupKey } from './graph.js';
import type { GraphDiagram } from '../model/types.js';

function fixture(name: string, ext: 'yaml' | 'd2'): string {
  return readFileSync(
    fileURLToPath(new URL(`../../test/fixtures/compile/${name}.${ext}`, import.meta.url)),
    'utf-8',
  );
}

describe('compileGraph', () => {
  it('compiles flowchart-basic to the expected D2 text', () => {
    const yaml = fixture('flowchart-basic', 'yaml');
    const expected = fixture('flowchart-basic', 'd2');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as GraphDiagram;
    expect(compileGraph(model)).toBe(expected);
  });

  it('absNodeKey returns the bare id for a top-level node', () => {
    const yaml = fixture('flowchart-basic', 'yaml');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error('fixture failed to parse');
    const model = parsed.diagram as GraphDiagram;
    expect(absNodeKey(model, 'start')).toBe('start');
  });

  it('nests a node inside a flat group by absolute dotted key', () => {
    const yaml = fixture('flowchart-groups', 'yaml');
    const expected = fixture('flowchart-groups', 'd2');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as GraphDiagram;
    expect(compileGraph(model)).toBe(expected);
  });

  it('nests a node two levels deep for architecture group parenting', () => {
    const yaml = fixture('architecture-nested', 'yaml');
    const expected = fixture('architecture-nested', 'd2');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as GraphDiagram;
    expect(compileGraph(model)).toBe(expected);
  });

  it('absNodeKey and absGroupKey compute correct nested paths', () => {
    const yaml = fixture('architecture-nested', 'yaml');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error('fixture failed to parse');
    const model = parsed.diagram as GraphDiagram;
    expect(absGroupKey(model, 'fulfilment')).toBe('warehouse.fulfilment');
    expect(absNodeKey(model, 'db')).toBe('warehouse.fulfilment.db');
    expect(absNodeKey(model, 'gateway')).toBe('gateway');
  });

  it('dims nodes and edges not in the view focus list', () => {
    const yaml = fixture('flowchart-view', 'yaml');
    const expected = fixture('flowchart-view', 'd2');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as GraphDiagram;
    const view = model.views.find((v) => v.id === 'happy');
    if (!view) throw new Error('fixture is missing the "happy" view');
    expect(compileGraph(model, view)).toBe(expected);
  });

  it('does not dim anything when no view is passed', () => {
    const yaml = fixture('flowchart-view', 'yaml');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error('fixture failed to parse');
    const model = parsed.diagram as GraphDiagram;
    expect(compileGraph(model)).not.toContain('style.opacity');
  });

  it('view dimming overrides an authored opacity: exactly one style.opacity line at 0.25', () => {
    const yaml = `
diagrammar: 1
type: flowchart
title: Opacity override
direction: down
layout: dagre

nodes:
  - id: start
    label: Start
    shape: oval
    style: { opacity: 0.8 }
  - id: ship
    label: Ship order

edges:
  - { from: start, to: ship }

views:
  - id: only-ship
    focus: [ship]
`;
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    const model = parsed.diagram as GraphDiagram;
    const view = model.views.find((v) => v.id === 'only-ship');
    if (!view) throw new Error('fixture is missing the "only-ship" view');
    const d2 = compileGraph(model, view);
    const startBlockMatch = /"start": \{[\s\S]*?\n\}/.exec(d2);
    if (!startBlockMatch) throw new Error('start block not found in compiled D2');
    const startBlock = startBlockMatch[0];
    const opacityLines = startBlock.match(/style\.opacity:[^\n]*/g) ?? [];
    expect(opacityLines).toEqual(['style.opacity: 0.25']);
  });
});
