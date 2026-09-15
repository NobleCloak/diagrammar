import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { Diagram } from '../model/types.js';
import { indexElements } from '../model/types.js';
import { parse } from '../parse.js';
import { compile, createKeyMap } from '../compile/index.js';
import { compileAndRender, shutdown } from '../engine/index.js';
import { getRasterizer } from '../raster/index.js';
import { resolveTheme } from '../theme/index.js';
import { applyOverlay } from './index.js';
import { escapeXml, parseViewBox } from './svg.js';
import type { Box, OverlayOptions, OverlayResult } from './types.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function parseOrThrow(text: string, label: string): Diagram {
  const parsed = parse(text);
  if (!parsed.ok) {
    throw new Error(`${label} failed to parse: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.diagram;
}

function loadFixture(name: string): Diagram {
  const text = readFileSync(
    fileURLToPath(new URL(`../../test/fixtures/compile/${name}`, import.meta.url)),
    'utf-8',
  );
  return parseOrThrow(text, name);
}

interface RenderedOverlay {
  before: Box;
  connectionCount: number;
  unresolvedConnectionCount: number;
  result1: OverlayResult;
  result2: OverlayResult;
}

/**
 * Compiles `model` to real D2, renders it through the real WASM engine, and
 * runs `applyOverlay` twice over the identical (svg, laidOut, keyMap) inputs
 * — this is the determinism check's setup, not a synthetic-layout stand-in.
 */
async function renderAndOverlay(model: Diagram, opts: OverlayOptions): Promise<RenderedOverlay> {
  const { d2: d2Source } = compile(model, undefined, opts.theme);
  const { svg, laidOut } = await compileAndRender(d2Source, {
    layout: model.layout,
    themeId: opts.theme.d2ThemeId,
  });
  const keyMap = createKeyMap(model, laidOut);

  const unresolvedConnectionCount = laidOut.connections.filter(
    (c) => keyMap.connectionKey(c) === undefined,
  ).length;

  const result1 = await applyOverlay(svg, laidOut, model, keyMap, opts);
  const result2 = await applyOverlay(svg, laidOut, model, keyMap, opts);

  return {
    before: parseViewBox(svg),
    connectionCount: laidOut.connections.length,
    unresolvedConnectionCount,
    result1,
    result2,
  };
}

/**
 * Shared invariants for every fixture: every model element is stamped
 * exactly once, the annotation group appears exactly once inside the outer
 * `<svg>`, the sidecar covers exactly the model's addressable elements, the
 * two runs are byte-identical, and there are no warnings.
 */
function assertCoreInvariants(
  model: Diagram,
  result1: OverlayResult,
  result2: OverlayResult,
): void {
  const expectedKeys = indexElements(model).keys();

  for (const key of expectedKeys) {
    const needle = `data-dg-id="${escapeXml(key)}"`;
    const occurrences = result1.svg.split(needle).length - 1;
    expect(occurrences).toBe(1);
  }

  const groupTag = '<g id="diagrammar-annotations">';
  expect((result1.svg.match(/<g id="diagrammar-annotations">/g) ?? []).length).toBe(1);
  expect(result1.svg.indexOf(groupTag)).toBeLessThan(result1.svg.lastIndexOf('</svg>'));

  expect(Object.keys(result1.layout).sort()).toEqual([...expectedKeys].sort());

  expect(result1.svg).toBe(result2.svg);
  expect(JSON.stringify(result1.layout)).toBe(JSON.stringify(result2.layout));

  expect(result1.warnings).toEqual([]);
}

function expectUnchangedViewBox(before: Box, after: Box): void {
  expect(after).toEqual(before);
}

/** `after` must fully contain `before` (spec §5.5 canvas growth by union). */
function expectGrownViewBox(before: Box, after: Box): void {
  expect(after.x).toBeLessThanOrEqual(before.x);
  expect(after.y).toBeLessThanOrEqual(before.y);
  expect(after.x + after.width).toBeGreaterThanOrEqual(before.x + before.width);
  expect(after.y + after.height).toBeGreaterThanOrEqual(before.y + before.height);
  expect(after.width).toBeGreaterThan(before.width);
  expect(after.height).toBeGreaterThan(before.height);
}

/**
 * Proves the overlay's markup is well-formed for resvg, not merely
 * well-formed enough for a browser/string match.
 */
async function expectValidPng(svg: string): Promise<void> {
  const png = await getRasterizer().rasterize(svg, { scale: 1 });
  expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
}

const INLINE_YAML = `
diagrammar: 1
type: flowchart
direction: down
layout: dagre

nodes:
  - id: start
    label: Order received
    shape: oval
  - id: check
    label: Check stock
  - id: ship
    label: Ship order

edges:
  - id: go
    from: start
    to: check
  - id: yes
    from: check
    to: ship
    label: 'yes'

notes:
  - id: n1
    at: check
    side: right
    width: 200
    text: 'Checks the reservation ledger, not raw stock.'
  - id: n2
    side: left
    width: 200
    text: 'Floating note about the whole flow.'

callouts:
  - id: c1
    at: yes
    number: 1
    text: 'Happy path continues here.'

views:
  - id: happy
    title: Happy path
    focus: [start, check, go]
`;

describe('applyOverlay against a real D2 render', () => {
  describe.each([
    { label: 'architecture (nested groups, edges)', file: 'architecture-nested.yaml' },
    { label: 'sequence (participants, messages, a fragment)', file: 'sequence-fragments.yaml' },
  ])('$label, no annotations', ({ file }: { label: string; file: string }) => {
    it('stamps every element once, sidecar matches, viewBox unchanged, deterministic, no warnings, valid PNG', async () => {
      const model = loadFixture(file);
      const { before, connectionCount, unresolvedConnectionCount, result1, result2 } =
        await renderAndOverlay(model, {
          theme: await resolveTheme(model.theme, undefined),
          legend: true,
        });

      assertCoreInvariants(model, result1, result2);
      expectUnchangedViewBox(before, parseViewBox(result1.svg));
      await expectValidPng(result1.svg);

      if (model.type === 'sequence') {
        // D2 draws synthetic per-participant lifeline connections that
        // never resolve to a model key (contract §11 item 19) — they
        // must be silently skipped, not warned about.
        expect(connectionCount).toBeGreaterThan(0);
        expect(unresolvedConnectionCount).toBeGreaterThan(0);
        expect(result1.warnings).toEqual([]);
      }
    });
  });

  it('places a badge, an anchored note, a floating note, and the legend, and grows the canvas', async () => {
    const model = parseOrThrow(INLINE_YAML, 'inline callout/note/view fixture');
    const { before, result1, result2 } = await renderAndOverlay(model, {
      theme: await resolveTheme(model.theme, undefined),
      legend: true,
    });

    assertCoreInvariants(model, result1, result2);
    expectGrownViewBox(before, parseViewBox(result1.svg));
    await expectValidPng(result1.svg);

    expect((result1.svg.match(/id="dg-callout-\d+"/g) ?? []).length).toBe(1);
    expect((result1.svg.match(/id="dg-note-\d+"/g) ?? []).length).toBe(2);
    expect(result1.svg).toContain('Happy path continues here.'); // badge title + legend
    expect(result1.svg).toContain('Checks the reservation ledger, not raw stock.'); // note title
    expect(result1.svg).toContain('Floating note about the whole flow.'); // note title
  });

  it('stamps every shape/edge exactly once — including dimmed ones — when rendering the inline fixture WITH a view set (C1)', async () => {
    // The inline fixture declares a `views:` block but the other tests above
    // never pass `opts.view` — this exercises the view-dimmed compile path,
    // where D2 emits `<g class="..." style='opacity:0.25'>` for out-of-focus
    // shapes/connections (a captured-style tag, not the bare
    // `<g class="...">` form) — exactly the C1 regression: before the
    // GROUP_CLASS_RE fix, a dimmed element's wrapper wasn't recognized at
    // all and came back unstamped.
    //
    // The "happy" view's focus is [start, check, go]; "ship" and "yes" are
    // therefore dimmed (still drawn by D2, just at opacity 0.25) and "c1"
    // (a callout on "yes") is hidden by the overlay itself (spec §5.4: "the
    // overlay hides notes and callouts whose target is out of focus") — a
    // pre-existing, unrelated design point, not part of C1: a hidden
    // badge/note is not drawn at all, so it carries no `data-dg-id` stamp of
    // its own (unlike a dimmed shape/edge, which D2 still draws). This test
    // therefore checks every model key EXCEPT the hidden callout, plus
    // separately confirms the hidden callout has no stamp and no visible
    // badge markup.
    const model = parseOrThrow(INLINE_YAML, 'inline callout/note/view fixture');
    const { result1, result2 } = await renderAndOverlay(model, {
      theme: await resolveTheme(model.theme, undefined),
      legend: true,
      view: 'happy',
    });

    expect(result1.svg).toBe(result2.svg); // deterministic across repeated calls
    expect(result1.warnings).toEqual([]);

    const expectedKeys = [...indexElements(model).keys()].filter((key) => key !== 'c1');
    for (const key of expectedKeys) {
      const needle = `data-dg-id="${escapeXml(key)}"`;
      expect(result1.svg.split(needle).length - 1).toBe(1);
    }
    expect(result1.svg.split('data-dg-id="c1"').length - 1).toBe(0);
    expect(result1.svg).not.toContain('id="dg-callout-1"');

    // The layout sidecar itself stays complete regardless of visibility —
    // buildSidecar records every badge/note unconditionally.
    expect(Object.keys(result1.layout).sort()).toEqual([...indexElements(model).keys()].sort());

    await expectValidPng(result1.svg);
  });

  it('stamps a node carrying an inline style with no view set (C1)', async () => {
    const yaml = `
diagrammar: 1
type: flowchart
direction: down
layout: dagre

nodes:
  - id: start
    label: Order received
    shape: oval
    style: { opacity: 0.4 }
  - id: check
    label: Check stock

edges:
  - id: go
    from: start
    to: check
`;
    const model = parseOrThrow(yaml, 'styled node, no view fixture');
    const { result1, result2 } = await renderAndOverlay(model, {
      theme: await resolveTheme(model.theme, undefined),
      legend: true,
    });

    assertCoreInvariants(model, result1, result2);
    await expectValidPng(result1.svg);
  });
}, 30_000);

afterAll(async () => {
  await shutdown();
});
