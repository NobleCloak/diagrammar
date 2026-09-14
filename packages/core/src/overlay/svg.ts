import type { Box } from './types.js';
import { DiagrammarError } from '../errors.js';

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Decodes the XML entities D2 uses inside class-encoded ids (see
 * `stampAttribute` below): the five named entities plus numeric decimal
 * (`&#34;`) and hex (`&#x22;`) character references. A single regex pass
 * (rather than chained `.replace` calls) avoids double-unescaping — e.g. a
 * literal `&amp;lt;` in the source must decode to `&lt;`, not `<`.
 */
const ENTITY_RE = /&lt;|&gt;|&amp;|&quot;|&apos;|&#(\d+);|&#x([0-9a-fA-F]+);/g;

export function unescapeXml(s: string): string {
  return s.replace(ENTITY_RE, (match, dec: string | undefined, hex: string | undefined) => {
    if (dec !== undefined) return String.fromCharCode(Number(dec));
    if (hex !== undefined) return String.fromCharCode(parseInt(hex, 16));
    switch (match) {
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&amp;':
        return '&';
      case '&quot;':
        return '"';
      case '&apos;':
        return "'";
      default:
        return match;
    }
  });
}

const VIEWBOX_RE = /viewBox="([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)\s+([-\d.eE]+)"/;

export function parseViewBox(svg: string): Box {
  const match = VIEWBOX_RE.exec(svg);
  if (match === null) {
    throw new DiagrammarError('parseViewBox: svg has no viewBox attribute', 'overlay');
  }
  const [, x, y, width, height] = match;
  return { x: Number(x), y: Number(y), width: Number(width), height: Number(height) };
}

const OPEN_TAG_RE = /<svg\b[^>]*>/;
const WIDTH_ATTR_RE = /\bwidth="[-\d.eE]+"/;
const HEIGHT_ATTR_RE = /\bheight="[-\d.eE]+"/;

export function setViewBox(svg: string, box: Box): string {
  const value = `${box.x} ${box.y} ${box.width} ${box.height}`;
  const tagMatch = OPEN_TAG_RE.exec(svg);
  if (tagMatch === null) {
    // No opening <svg ...> tag at all (malformed input) — fall back to the
    // pre-existing whole-string behavior, which will simply find nothing to
    // replace and append a bare viewBox after the literal "<svg" substring.
    if (VIEWBOX_RE.test(svg)) {
      return svg.replace(VIEWBOX_RE, `viewBox="${value}"`);
    }
    return svg.replace(/<svg\b/, `<svg viewBox="${value}"`);
  }
  // Scope every replacement to THIS tag's own text (the outermost <svg ...>,
  // since OPEN_TAG_RE.exec without the global flag returns the first match,
  // and D2's outer <svg> is always the first tag in the document). This is
  // deliberate: by the time applyOverlay calls setViewBox, insertGroup has
  // already appended annotation markup (rects, text) containing their own
  // width="..."/height="..." attributes later in the string, and a nested
  // inner <svg> may carry its own width/height too — neither must be touched.
  let tag = tagMatch[0];
  tag = VIEWBOX_RE.test(tag)
    ? tag.replace(VIEWBOX_RE, `viewBox="${value}"`)
    : tag.replace(/<svg\b/, `<svg viewBox="${value}"`);
  // Keep the outer tag's own width/height attributes (if any) in sync with
  // the grown viewBox so the rendered pixel size doesn't silently shrink
  // everything back down. A tag with no width/height attribute is left as-is
  // — there is nothing to keep in sync, and this function never adds
  // attributes that weren't already present.
  if (WIDTH_ATTR_RE.test(tag)) {
    tag = tag.replace(WIDTH_ATTR_RE, `width="${box.width}"`);
  }
  if (HEIGHT_ATTR_RE.test(tag)) {
    tag = tag.replace(HEIGHT_ATTR_RE, `height="${box.height}"`);
  }
  return svg.slice(0, tagMatch.index) + tag + svg.slice(tagMatch.index + tagMatch[0].length);
}

export function insertGroup(svg: string, groupMarkup: string): string {
  // Per docs/spikes/2026-09-11-d2-resvg-spike.md ("Surprises for
  // later plans"): D2 nests an inner <svg> (shape coordinate space) inside an
  // outer <svg> (canvas size), and the annotation group must be appended as
  // the last child of the OUTER <svg>, immediately before its closing tag —
  // callers translate shape/route coordinates into outer space themselves by
  // adding `laidOut.origin` before building this group's markup, so plain
  // numeric coordinates drawn here already land correctly once the group
  // sits in the outer element. `lastIndexOf('</svg>')` finds the OUTER
  // closing tag when an inner <svg> is present, and is equally correct for a
  // single-<svg> document (there is only one "</svg>" to find).
  const idx = svg.lastIndexOf('</svg>');
  if (idx === -1) {
    throw new DiagrammarError('insertGroup: svg has no closing </svg> tag', 'overlay');
  }
  return svg.slice(0, idx) + groupMarkup + svg.slice(idx);
}

/**
 * Inserts `markup` immediately after the outer `<svg ...>` opening tag —
 * i.e. before any of D2's own content, including its own background rect —
 * so a caller drawing a full-canvas background (spec §5.5: the grown canvas
 * is filled with the theme's canvas colour) paints underneath everything D2
 * drew, never over it.
 */
export function prependToOuterSvg(svg: string, markup: string): string {
  const match = OPEN_TAG_RE.exec(svg);
  if (match === null) {
    throw new DiagrammarError('prependToOuterSvg: svg has no opening <svg ...> tag', 'overlay');
  }
  const insertAt = match.index + match[0].length;
  return svg.slice(0, insertAt) + markup + svg.slice(insertAt);
}

/**
 * Matches D2's own wrapper `<g class="...">` around a top-level shape or
 * connection element, whose class value is a single base64 token (no other
 * classes present — e.g. `class="shape"` or `class="shape blend"` never
 * matches this pattern because a space breaks the character class). The
 * lookahead `(?=[\s>])` accepts either the bare `<g class="X">` form or the
 * form D2 emits for a dimmed/opacity-styled element, `<g class="X"
 * style='opacity:0.25'>` — either way `class` must still be the very first
 * attribute right after `<g `, which is what keeps `stampAttribute`
 * idempotent (see its own doc comment below): once stamped, `class` is no
 * longer the first attribute, so a second pass finds nothing to re-match.
 */
const GROUP_CLASS_RE = /<g class="([A-Za-z0-9+/=]+)"(?=[\s>])/g;

/**
 * Finds D2's wrapper `<g class="...">` whose base64-decoded, XML-unescaped
 * class equals `d2ElementId`, and inserts `attrs` (XML-escaped values) into
 * that opening tag, immediately after `<g` and before ` class=`. Returns
 * `svg` unchanged when no element matches.
 *
 * Per the Task 3 controller ruling: D2's SVG carries no `id="..."` attribute
 * on shape/connection elements — each is wrapped as
 * `<g class="<base64(xmlEscape(id))>">`. This is decode-side matching: it
 * decodes each candidate class and compares against the caller's plain
 * `d2ElementId`, rather than re-deriving D2's own escaping locally.
 *
 * Idempotent by construction: once stamped, a `<g ...>` carries `attrs`
 * before ` class=`, so its class value no longer matches `GROUP_CLASS_RE`
 * as a lone base64 token and a second call finds nothing to re-stamp —
 * callers are expected to stamp each element once.
 */
export function stampAttribute(
  svg: string,
  d2ElementId: string,
  attrs: Record<string, string>,
): string {
  GROUP_CLASS_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GROUP_CLASS_RE.exec(svg)) !== null) {
    const token = match[1];
    if (token === undefined) continue;
    const decoded = unescapeXml(Buffer.from(token, 'base64').toString('utf8'));
    if (decoded !== d2ElementId) continue;
    const insertAt = match.index + '<g'.length;
    const attrString = Object.entries(attrs)
      .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
      .join('');
    return svg.slice(0, insertAt) + attrString + svg.slice(insertAt);
  }
  return svg;
}
