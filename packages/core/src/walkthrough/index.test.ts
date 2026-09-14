import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '../parse.js';
import { walkthrough } from './index.js';
import type { Diagram } from '../model/types.js';

function fixture(name: string, ext: 'yaml' | 'md'): string {
  return readFileSync(
    fileURLToPath(new URL(`../../test/fixtures/walkthrough/${name}.${ext}`, import.meta.url)),
    'utf-8',
  );
}

describe('walkthrough', () => {
  it('emits title, image, ordered callouts, and elements for a full example', () => {
    const yaml = fixture('flowchart', 'yaml');
    const expected = fixture('flowchart', 'md');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    expect(walkthrough(parsed.diagram, { imagePath: 'order-fulfilment.png' })).toBe(expected);
  });

  it('flattens messages inside a nested fragment in file order for a sequence diagram', () => {
    const yaml = fixture('sequence', 'yaml');
    const expected = fixture('sequence', 'md');
    const parsed = parse(yaml);
    if (!parsed.ok) throw new Error(`fixture failed to parse: ${JSON.stringify(parsed.issues)}`);
    expect(walkthrough(parsed.diagram)).toBe(expected);
  });

  it('defaults the title to "Untitled diagram" when title is absent', () => {
    const model: Diagram = {
      version: 1,
      type: 'flowchart',
      theme: 'light',
      layout: 'dagre',
      direction: 'down',
      notes: [],
      callouts: [],
      views: [],
      groups: [],
      nodes: [{ kind: 'node', id: 'a', label: 'A', shape: 'rect' }],
      edges: [],
    };
    expect(walkthrough(model)).toContain('# Untitled diagram');
  });

  it('omits the image line when imagePath is not given', () => {
    const model: Diagram = {
      version: 1,
      type: 'flowchart',
      title: 'No image',
      theme: 'light',
      layout: 'dagre',
      direction: 'down',
      notes: [],
      callouts: [],
      views: [],
      groups: [],
      nodes: [],
      edges: [],
    };
    expect(walkthrough(model)).not.toContain('![');
  });

  it('omits the Callouts section when there are no callouts', () => {
    const model: Diagram = {
      version: 1,
      type: 'flowchart',
      title: 'No callouts',
      theme: 'light',
      layout: 'dagre',
      direction: 'down',
      notes: [],
      callouts: [],
      views: [],
      groups: [],
      nodes: [],
      edges: [],
    };
    expect(walkthrough(model)).not.toContain('## Callouts');
  });

  it('lists a node without a description by label only', () => {
    const model: Diagram = {
      version: 1,
      type: 'flowchart',
      title: 'Plain node',
      theme: 'light',
      layout: 'dagre',
      direction: 'down',
      notes: [],
      callouts: [],
      views: [],
      groups: [],
      nodes: [{ kind: 'node', id: 'a', label: 'A', shape: 'rect' }],
      edges: [],
    };
    expect(walkthrough(model)).toContain('- **A** (`a`)\n');
  });

  it('omits the Elements section and ends in a single newline for an element-free model', () => {
    const model: Diagram = {
      version: 1,
      type: 'flowchart',
      title: 'Empty',
      theme: 'light',
      layout: 'dagre',
      direction: 'down',
      notes: [],
      callouts: [],
      views: [],
      groups: [],
      nodes: [],
      edges: [],
    };
    const md = walkthrough(model);
    expect(md).toBe('# Empty\n');
  });
});
