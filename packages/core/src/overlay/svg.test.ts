import { describe, it, expect } from 'vitest';
import {
  escapeXml,
  parseViewBox,
  setViewBox,
  insertGroup,
  prependToOuterSvg,
  unescapeXml,
  stampAttribute,
} from './svg.js';

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`<a> & "b" 'c'`)).toBe('&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeXml('checks the ledger')).toBe('checks the ledger');
  });
});

describe('parseViewBox', () => {
  it('reads x/y/width/height out of a viewBox attribute', () => {
    const svg = '<svg viewBox="0 0 120 80" xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(parseViewBox(svg)).toEqual({ x: 0, y: 0, width: 120, height: 80 });
  });

  it('parses negative and decimal values', () => {
    const svg = '<svg viewBox="-10.5 -2 220.25 100"></svg>';
    expect(parseViewBox(svg)).toEqual({ x: -10.5, y: -2, width: 220.25, height: 100 });
  });

  it('throws a DiagrammarError with code "overlay" when there is no viewBox attribute', () => {
    expect(() => parseViewBox('<svg></svg>')).toThrow(expect.objectContaining({ code: 'overlay' }));
  });
});

describe('setViewBox', () => {
  it('replaces an existing viewBox', () => {
    const svg = '<svg viewBox="0 0 120 80"><rect/></svg>';
    const result = setViewBox(svg, { x: -24, y: -24, width: 168, height: 128 });
    expect(result).toBe('<svg viewBox="-24 -24 168 128"><rect/></svg>');
  });

  it('injects a viewBox when none exists', () => {
    const svg = '<svg width="120" height="80"><rect/></svg>';
    const result = setViewBox(svg, { x: 0, y: 0, width: 120, height: 80 });
    expect(result).toBe(
      '<svg viewBox="0 0 0 120 80" width="120" height="80"><rect/></svg>'.replace(
        'viewBox="0 0 0 120 80"',
        'viewBox="0 0 120 80"',
      ),
    );
  });

  it('also updates width/height attributes on the same tag when present, so the pixel size stays in sync with the grown viewBox', () => {
    // D2's outer <svg> carries width/height matching its viewBox 1:1 at
    // scale:1 (spec section 4.2). If the canvas grows (spec section 5.5) but
    // width/height stay at their old values, resvg/browsers scale the larger
    // viewBox down to fit the old pixel box, shrinking every annotation.
    const svg = '<svg width="120" height="80" viewBox="0 0 120 80"><rect/></svg>';
    const result = setViewBox(svg, { x: -24, y: -24, width: 168, height: 128 });
    expect(result).toBe('<svg width="168" height="128" viewBox="-24 -24 168 128"><rect/></svg>');
  });

  it('does not touch width/height on a nested inner <svg> when growing the outer one', () => {
    // The inner <svg>'s own viewBox/width/height describe D2's shape space
    // and must not change just because the outer canvas grew to fit
    // annotations drawn outside D2's own content.
    const svg =
      '<svg viewBox="0 0 120 80"><svg width="120" height="80" viewBox="10 10 120 80"><rect/></svg></svg>';
    const result = setViewBox(svg, { x: -24, y: -24, width: 168, height: 128 });
    expect(result).toBe(
      '<svg viewBox="-24 -24 168 128"><svg width="120" height="80" viewBox="10 10 120 80"><rect/></svg></svg>',
    );
  });

  it('leaves the tag unchanged when it has no width/height attributes to sync', () => {
    const svg = '<svg viewBox="0 0 120 80"><rect/></svg>';
    const result = setViewBox(svg, { x: 0, y: 0, width: 200, height: 200 });
    expect(result).toBe('<svg viewBox="0 0 200 200"><rect/></svg>');
  });
});

describe('insertGroup', () => {
  it('inserts markup immediately before the outermost closing </svg>', () => {
    const svg = '<svg viewBox="0 0 10 10"><rect/></svg>';
    const result = insertGroup(svg, '<g id="x"></g>');
    expect(result).toBe('<svg viewBox="0 0 10 10"><rect/><g id="x"></g></svg>');
  });

  it('inserts before the outermost </svg> even when an inner <svg> is present', () => {
    const svg = '<svg viewBox="0 0 10 10"><svg><rect/></svg></svg>';
    const result = insertGroup(svg, '<g id="x"></g>');
    expect(result).toBe('<svg viewBox="0 0 10 10"><svg><rect/></svg><g id="x"></g></svg>');
  });

  it('throws a DiagrammarError with code "overlay" when there is no closing </svg>', () => {
    expect(() => insertGroup('<svg>', '<g/>')).toThrow(
      expect.objectContaining({ code: 'overlay' }),
    );
  });
});

describe('prependToOuterSvg', () => {
  it('inserts markup immediately after the outer <svg ...> opening tag, before any content', () => {
    const svg = '<svg viewBox="0 0 10 10"><rect/></svg>';
    const result = prependToOuterSvg(svg, '<rect fill="red"/>');
    expect(result).toBe('<svg viewBox="0 0 10 10"><rect fill="red"/><rect/></svg>');
  });

  it('inserts before a nested inner <svg>, not inside it', () => {
    const svg = '<svg viewBox="0 0 10 10"><svg><rect/></svg></svg>';
    const result = prependToOuterSvg(svg, '<rect fill="red"/>');
    expect(result).toBe('<svg viewBox="0 0 10 10"><rect fill="red"/><svg><rect/></svg></svg>');
  });

  it('throws a DiagrammarError with code "overlay" when there is no opening <svg ...> tag', () => {
    expect(() => prependToOuterSvg('not an svg', '<rect/>')).toThrow(
      expect.objectContaining({ code: 'overlay' }),
    );
  });
});

describe('unescapeXml', () => {
  it('decodes the five named XML entities', () => {
    expect(unescapeXml('&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;')).toBe(`<a> & "b" 'c'`);
  });

  it('decodes decimal numeric character references', () => {
    expect(unescapeXml('&#34;quoted&#34;')).toBe('"quoted"');
  });

  it('decodes hex numeric character references', () => {
    expect(unescapeXml('&#x22;quoted&#x22;')).toBe('"quoted"');
  });

  it('leaves plain text untouched', () => {
    expect(unescapeXml('plain text')).toBe('plain text');
  });
});

// Captured from a real compileAndRender() output (@d2lang/d2 0.1.34 / D2 0.9.0,
// dagre layout, theme light) per Task 3 Step 10 (capture script run from the
// scratchpad, deleted after capture — see the task report). Confirmed against
// the Task 3 controller ruling: D2's SVG carries no `id="..."` attribute on
// shape/connection elements; each top-level shape/connection is wrapped as
// `<g class="<base64(xmlEscape(id))>">`. Re-run the capture and update these
// four constants if a future @d2lang/d2 upgrade changes D2's own SVG markup.
//
// Source fixture: packages/core/test/fixtures/compile/architecture-nested.yaml
// laidOut.shapes ids: ["warehouse","warehouse.fulfilment","gateway",
//   "warehouse.fulfilment.worker","warehouse.fulfilment.db"]
// laidOut.connections ids: ["(gateway -> warehouse.fulfilment.worker)[0]",
//   "warehouse.fulfilment.(worker -> db)[0]"]

/** Case (a): plain node `gateway` -> class token base64("gateway"). */
const CAPTURED_NODE_TAG = '<g class="Z2F0ZXdheQ==">';
const CAPTURED_NODE_ID = 'gateway';

/** Case (b): nested container shape `warehouse.fulfilment.db`. */
const CAPTURED_CONTAINER_TAG = '<g class="d2FyZWhvdXNlLmZ1bGZpbG1lbnQuZGI=">';
const CAPTURED_CONTAINER_ID = 'warehouse.fulfilment.db';

/**
 * Case (c): connection `worker -> db` (prefix-factored id, per the
 * 2026-09-11 D2/resvg spike). D2's own class token base64-encodes the
 * XML-escaped id (`-&gt;` for `->`); the raw id below is what
 * `LaidOutConnection.id` carries and what `stampAttribute`'s caller passes.
 */
const CAPTURED_CONNECTION_TAG =
  '<g class="d2FyZWhvdXNlLmZ1bGZpbG1lbnQuKHdvcmtlciAtJmd0OyBkYilbMF0=">';
const CAPTURED_CONNECTION_RAW_ID = 'warehouse.fulfilment.(worker -> db)[0]';

/**
 * Case (d): sequence fragment container `seq."messages[1]"` (from
 * packages/core/test/fixtures/compile/sequence-fragments.yaml). D2 encodes
 * the literal `"` in the id as the numeric entity `&#34;` before
 * base64-encoding, proving `unescapeXml`'s numeric-entity decoding is
 * exercised for real (not just hand-typed) markup.
 */
const CAPTURED_FRAGMENT_TAG = '<g class="c2VxLiYjMzQ7bWVzc2FnZXNbMV0mIzM0Ow==">';
const CAPTURED_FRAGMENT_RAW_ID = 'seq."messages[1]"';

/**
 * Case (e), captured 2026-09-11 (C1 fix): a dimmed/opacity-styled shape's
 * wrapper carries a `style='...'` attribute right after `class="..."` —
 * `<g class="<base64 id>" style='opacity:0.25'>` — rather than closing the
 * tag immediately. Class token is base64("start").
 */
const CAPTURED_STYLED_TAG = `<g class="c3RhcnQ=" style='opacity:0.25'>`;
const CAPTURED_STYLED_ID = 'start';

describe('stampAttribute', () => {
  it('stamps the captured plain-node tag', () => {
    const svg = `<svg viewBox="0 0 100 100">${CAPTURED_NODE_TAG}<rect/></g></svg>`;
    const stamped = stampAttribute(svg, CAPTURED_NODE_ID, {
      'data-dg-id': 'gateway',
      'data-dg-kind': 'node',
    });
    expect(stamped).toBe(
      '<svg viewBox="0 0 100 100"><g data-dg-id="gateway" data-dg-kind="node" class="Z2F0ZXdheQ=="><rect/></g></svg>',
    );
  });

  it('stamps the captured connection tag, matching by the raw (unescaped) id', () => {
    const svg = `<svg viewBox="0 0 100 100">${CAPTURED_CONNECTION_TAG}<path d="M0 0 L1 1"/></g></svg>`;
    const stamped = stampAttribute(svg, CAPTURED_CONNECTION_RAW_ID, {
      'data-dg-id': CAPTURED_CONNECTION_RAW_ID,
      'data-dg-kind': 'edge',
    });
    expect(stamped).toBe(
      '<svg viewBox="0 0 100 100"><g data-dg-id="warehouse.fulfilment.(worker -&gt; db)[0]" data-dg-kind="edge" class="d2FyZWhvdXNlLmZ1bGZpbG1lbnQuKHdvcmtlciAtJmd0OyBkYilbMF0="><path d="M0 0 L1 1"/></g></svg>',
    );
  });

  it('stamps the captured fragment tag, proving numeric-entity (&#34;) decoding', () => {
    const svg = `<svg viewBox="0 0 100 100">${CAPTURED_FRAGMENT_TAG}<rect/></g></svg>`;
    const stamped = stampAttribute(svg, CAPTURED_FRAGMENT_RAW_ID, {
      'data-dg-id': CAPTURED_FRAGMENT_RAW_ID,
    });
    expect(stamped).toBe(
      '<svg viewBox="0 0 100 100"><g data-dg-id="seq.&quot;messages[1]&quot;" class="c2VxLiYjMzQ7bWVzc2FnZXNbMV0mIzM0Ow=="><rect/></g></svg>',
    );
  });

  it('stamps the captured nested-container tag', () => {
    const svg = `<svg viewBox="0 0 100 100">${CAPTURED_CONTAINER_TAG}<path d="M0 0"/></g></svg>`;
    const stamped = stampAttribute(svg, CAPTURED_CONTAINER_ID, {
      'data-dg-id': 'warehouse.fulfilment.db',
      'data-dg-kind': 'group',
    });
    expect(stamped).toBe(
      '<svg viewBox="0 0 100 100"><g data-dg-id="warehouse.fulfilment.db" data-dg-kind="group" class="d2FyZWhvdXNlLmZ1bGZpbG1lbnQuZGI="><path d="M0 0"/></g></svg>',
    );
  });

  it('stamps a captured styled tag (C1: class followed by style=... rather than closing the tag)', () => {
    const svg = `<svg viewBox="0 0 100 100">${CAPTURED_STYLED_TAG}<rect/></g></svg>`;
    const stamped = stampAttribute(svg, CAPTURED_STYLED_ID, {
      'data-dg-id': 'start',
      'data-dg-kind': 'node',
    });
    expect(stamped).toBe(
      `<svg viewBox="0 0 100 100"><g data-dg-id="start" data-dg-kind="node" class="c3RhcnQ=" style='opacity:0.25'><rect/></g></svg>`,
    );
  });

  it('does not misfire on a bare utility class tag with a space before the closing bracket', () => {
    // Real D2 markup: `<g class="shape" >` (a trailing space before `>`).
    // The lookahead added for C1 must accept this form for scanning purposes
    // without treating "shape" as a match for an unrelated id.
    const svg = '<svg><g class="shape" ><rect/></g></svg>';
    expect(stampAttribute(svg, 'shape', { 'data-dg-id': 'x' })).toBe(svg);
  });

  it('returns the input unchanged when the id is not found', () => {
    const svg = `<svg>${CAPTURED_NODE_TAG}</g></svg>`;
    expect(stampAttribute(svg, 'missing', { 'data-dg-id': 'x' })).toBe(svg);
  });

  it('escapes attribute values it injects', () => {
    const svg = `<svg>${CAPTURED_NODE_TAG}</g></svg>`;
    const stamped = stampAttribute(svg, CAPTURED_NODE_ID, {
      'data-dg-id': 'a "quoted" & <tagged>',
    });
    expect(stamped).toBe(
      '<svg><g data-dg-id="a &quot;quoted&quot; &amp; &lt;tagged&gt;" class="Z2F0ZXdheQ=="></g></svg>',
    );
  });

  it('does not treat a D2 utility class (not base64 of any real id) as a match', () => {
    // Real D2 markup includes inner utility wrappers like `<g class="shape">`
    // alongside the id-bearing outer `<g class="<base64 id>">`. "shape" is
    // itself a syntactically valid base64 token, but decodes to unrelated
    // bytes — proving stampAttribute matches by decoded content, not by
    // whether the id string happens to appear literally in the markup.
    const svg = '<svg><g class="shape"><rect/></g></svg>';
    expect(stampAttribute(svg, 'shape', { 'data-dg-id': 'x' })).toBe(svg);
  });
});
