import { describe, it, expect } from 'vitest';
import type { LaidOutDiagram } from '../engine/types.js';
import type { GraphDiagram } from '../model/types.js';
import type { KeyMap } from './types.js';
import { FONT_FAMILY } from '../engine/fonts.js';
import { applyOverlay } from './index.js';
import { presetTheme } from '../theme/index.js';

function keyMapFor(shapeIds: Record<string, string>): KeyMap {
  return { shapeKey: (id) => shapeIds[id], connectionKey: () => undefined };
}

function baseModel(overrides: Partial<GraphDiagram> = {}): GraphDiagram {
  return {
    version: 1,
    type: 'flowchart',
    theme: 'light',
    layout: 'dagre',
    direction: 'down',
    notes: [],
    callouts: [],
    views: [],
    groups: [],
    nodes: [{ kind: 'node', id: 'check', label: 'Check stock', shape: 'rect' }],
    edges: [],
    ...overrides,
  };
}

// Per Task 3/8's controller ruling (reused verbatim from stamp.test.ts): D2's
// SVG carries no `id="..."` attribute on shape/connection elements — each is
// wrapped as `<g class="<base64(xmlEscape(id))>">`. These fixtures use that
// real encoding (base64("check") = "Y2hlY2s=") so stampAll's `stampAttribute`
// call can actually find and stamp the shape, matching stamp.test.ts's own
// captured-markup convention rather than an invented `id="check"` tag.
const CHECK_TAG = '<g class="Y2hlY2s=">';

describe('applyOverlay (pure composition)', () => {
  it('inserts the annotations group, stamps the node, and grows the viewBox', async () => {
    const svg = `<svg viewBox="0 0 100 100">${CHECK_TAG}<rect width="40" height="20"/></g></svg>`;
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 40, height: 20, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const model = baseModel({
      callouts: [{ kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1, text: 'note it' }],
    });
    const result = await applyOverlay(svg, laidOut, model, keyMapFor({ check: 'check' }), {
      theme: presetTheme('light'),
      legend: true,
    });

    expect(result.svg).toContain('<g id="diagrammar-annotations">');
    expect(result.svg).toContain('id="dg-callout-1"');
    expect(result.svg).toContain('data-dg-id="check" data-dg-kind="node"');
    expect(result.svg).toContain(`font-family="${FONT_FAMILY}"`);
    expect(result.layout['check']).toEqual({
      kind: 'node',
      bbox: { x: 0, y: 0, width: 40, height: 20 },
    });
    expect(result.layout['c1']).toBeDefined();
    expect(result.warnings).toEqual([]);

    // viewBox grew beyond the original 100x100 to fit the badge and legend
    const viewBoxMatch = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(result.svg);
    expect(viewBoxMatch).not.toBeNull();
    const [, , , width, height] = viewBoxMatch!;
    expect(Number(width)).toBeGreaterThan(100);
    expect(Number(height)).toBeGreaterThan(100);
  });

  it('omits the legend markup when opts.legend is false', async () => {
    const svg = `<svg viewBox="0 0 100 100">${CHECK_TAG}<rect width="40" height="20"/></g></svg>`;
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 40, height: 20, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const model = baseModel({
      callouts: [{ kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1, text: 'note it' }],
    });
    const result = await applyOverlay(svg, laidOut, model, keyMapFor({ check: 'check' }), {
      theme: presetTheme('light'),
      legend: false,
    });
    expect(result.svg).not.toContain('dg-legend');
  });

  it('returns the input SVG with only stamping applied and an unchanged viewBox when there are no callouts or notes', async () => {
    const svg = `<svg viewBox="0 0 100 100">${CHECK_TAG}<rect width="40" height="20"/></g></svg>`;
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 40, height: 20, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const model = baseModel();
    const result = await applyOverlay(svg, laidOut, model, keyMapFor({ check: 'check' }), {
      theme: presetTheme('light'),
      legend: true,
    });

    expect(result.svg).toContain('viewBox="0 0 100 100"');
    expect(result.svg).toContain('data-dg-id="check" data-dg-kind="node"');
    expect(result.svg).toContain('<g id="diagrammar-annotations"></g>');
    expect(result.warnings).toEqual([]);
    // C2: nothing grew, so no canvas-fill rect should have been painted.
    expect(result.svg).not.toContain('fill="#FFFFFF"/>');
  });

  it('paints the grown canvas with the dark theme canvas colour, right after the outer <svg> open tag', async () => {
    const svg = `<svg viewBox="0 0 100 100">${CHECK_TAG}<rect width="40" height="20"/></g></svg>`;
    const laidOut: LaidOutDiagram = {
      shapes: [
        { id: 'check', type: 'rectangle', pos: { x: 0, y: 0 }, width: 40, height: 20, level: 0 },
      ],
      connections: [],
      origin: { x: 0, y: 0 },
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
    };
    const model = baseModel({
      callouts: [{ kind: 'callout', key: 'c1', id: 'c1', at: 'check', number: 1, text: 'note it' }],
    });
    const result = await applyOverlay(svg, laidOut, model, keyMapFor({ check: 'check' }), {
      theme: presetTheme('dark'),
      legend: true,
    });

    const rectMatch =
      /^<svg[^>]*><rect x="[-\d.]+" y="[-\d.]+" width="[-\d.]+" height="[-\d.]+" fill="#1E1E2E"\/>/.exec(
        result.svg,
      );
    expect(rectMatch).not.toBeNull();
  });
});
