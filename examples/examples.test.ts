import { describe as suite, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, validate, describe as describeDiagram } from '@noblecloak/diagrammar-core';

const examplesDir = path.dirname(fileURLToPath(import.meta.url));

function loadExample(name: string): string {
  return readFileSync(path.join(examplesDir, name), 'utf-8');
}

const EXAMPLES = [
  'flowchart.yaml',
  'architecture.yaml',
  'sequence.yaml',
  'annotated.yaml',
  'themed.yaml',
  'icons.yaml',
] as const;

suite('example files pass validate()', () => {
  it.each(EXAMPLES)('%s has no validation issues', (name) => {
    const result = validate(loadExample(name));
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

suite('example files describe() and parse() element counts', () => {
  it('flowchart.yaml has 5 nodes, 5 edges, 0 groups', () => {
    const result = parse(loadExample('flowchart.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const diagram = result.diagram;
    if (diagram.type === 'sequence') throw new Error('expected a graph diagram');
    expect(diagram.nodes).toHaveLength(5);
    expect(diagram.edges).toHaveLength(5);
    expect(diagram.groups).toHaveLength(0);
  });

  it('architecture.yaml has 7 nodes, 3 groups, 6 edges', () => {
    const result = parse(loadExample('architecture.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const diagram = result.diagram;
    if (diagram.type === 'sequence') throw new Error('expected a graph diagram');
    expect(diagram.nodes).toHaveLength(7);
    expect(diagram.groups).toHaveLength(3);
    expect(diagram.edges).toHaveLength(6);
  });

  it('sequence.yaml has 4 participants, 2 fragments, and 5 leaf messages', () => {
    const result = parse(loadExample('sequence.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const diagram = result.diagram;
    if (diagram.type !== 'sequence') throw new Error('expected a sequence diagram');
    expect(diagram.participants).toHaveLength(4);

    type Item = (typeof diagram)['items'][number];
    const countLeafMessages = (items: Item[]): number =>
      items.reduce(
        (sum, item) => sum + (item.kind === 'fragment' ? countLeafMessages(item.messages) : 1),
        0,
      );
    const countFragments = (items: Item[]): number =>
      items.reduce(
        (sum, item) => sum + (item.kind === 'fragment' ? 1 + countFragments(item.messages) : 0),
        0,
      );

    expect(countFragments(diagram.items)).toBe(2);
    expect(countLeafMessages(diagram.items)).toBe(5);
  });

  it('annotated.yaml has 2 groups, descriptions on every node, 3 notes (1 floating), 4 callouts on 4 distinct targets, and 2 views', () => {
    const result = parse(loadExample('annotated.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const diagram = result.diagram;
    if (diagram.type === 'sequence') throw new Error('expected a graph diagram');

    expect(diagram.groups).toHaveLength(2);
    expect(diagram.nodes).toHaveLength(5);
    expect(
      diagram.nodes.every((n) => typeof n.description === 'string' && n.description.length > 0),
    ).toBe(true);

    expect(diagram.notes).toHaveLength(3);
    expect(diagram.notes.filter((n) => n.at === undefined)).toHaveLength(1);

    expect(diagram.callouts).toHaveLength(4);
    // M13: each callout targets a distinct element — stacking multiple
    // callouts on one target (badges lining up side by side) is exercised
    // directly in packages/core/src/overlay/callouts.test.ts, not here.
    const byTarget = new Map<string, number>();
    for (const callout of diagram.callouts) {
      byTarget.set(callout.at, (byTarget.get(callout.at) ?? 0) + 1);
    }
    expect(byTarget.size).toBe(diagram.callouts.length);
    expect(diagram.callouts.every((c) => typeof c.text === 'string' && c.text.length > 0)).toBe(
      true,
    );

    expect(diagram.views).toHaveLength(2);

    const described = describeDiagram(loadExample('annotated.yaml'));
    expect(described.valid).toBe(true);
    expect(described.issues).toEqual([]);
    expect(described.views.map((v) => v.id).sort()).toEqual(['backorder-path', 'happy']);
  });

  it('themed.yaml references the house theme by relative path and has 5 nodes', () => {
    const result = parse(loadExample('themed.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diagram.theme).toBe('./themes/house.yaml');
    if (result.diagram.type === 'sequence') throw new Error('expected a graph diagram');
    expect(result.diagram.nodes).toHaveLength(5);
  });

  it('icons.yaml uses set-form and path-form icons and an image node', () => {
    const result = parse(loadExample('icons.yaml'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.diagram.type === 'sequence') throw new Error('expected a graph diagram');
    expect(result.diagram.nodes.filter((n) => n.shape === 'image')).toHaveLength(2);
    expect(result.diagram.nodes.find((n) => n.id === 'legacy')?.icon).toBe('./icons/custom.svg');
    expect(result.diagram.groups.every((g) => g.icon !== undefined)).toBe(true);
  });
});
