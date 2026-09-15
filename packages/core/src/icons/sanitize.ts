import { DiagrammarError } from '../errors.js';

/** Spec §5.3: 256 KB after normalization. */
export const ICON_MAX_BYTES = 262144;

export interface SanitizeOptions {
  maxBytes?: number;
}

function reject(reason: string): never {
  throw new DiagrammarError(`icon SVG rejected: ${reason}`, 'icon_invalid');
}

const FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/<!DOCTYPE/i, 'DOCTYPE declarations are not allowed'],
  [/<!ENTITY/i, 'ENTITY declarations are not allowed'],
  [/<(?:[A-Za-z_][\w.-]*:)?script(?![\w.-])/i, '<script> is not allowed'],
  [/<(?:[A-Za-z_][\w.-]*:)?foreignObject(?![\w.-])/i, '<foreignObject> is not allowed'],
  [/(?<![\w.-])on[a-z]+\s*=/i, 'event-handler attributes are not allowed'],
  [/<(?:[A-Za-z_][\w.-]*:)?style(?![\w.-])/i, '<style> is not allowed'],
];

/**
 * Every href (prefixed or not) and xlink:href must be a same-document fragment.
 * Matches: quoted (single or double), unquoted, with any prefix or delimiter.
 * Uses negative lookbehind to ensure href is a complete attribute name,
 * not part of a longer name like data-href or href-x.
 */
const HREF_RE = /(?<![\w.-])href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

/**
 * Collapses runs of whitespace in a root `<svg>` tag's attribute list to a
 * single space, but only *outside* quoted attribute values — a naive
 * `attrs.replace(/\s+/g, ' ')` would also collapse whitespace an author
 * put inside a value on purpose (e.g. `class="a  b"` naming two classes
 * separated by more than one space). The alternation tries the quoted-value
 * branch first so a quoted run is passed through untouched; only whitespace
 * matched by the bare `\s+` branch (i.e. outside any quotes) is replaced.
 */
function collapseAttrWhitespace(attrs: string): string {
  return attrs.replace(/("[^"]*"|'[^']*')|\s+/g, (match: string, quoted: string | undefined) =>
    quoted !== undefined ? quoted : ' ',
  );
}

/**
 * Runs the forbidden-construct and href checks over `text` and throws
 * `icon_invalid` on the first violation. Called twice by `sanitizeSvg`: once
 * on the comment/XML-declaration-stripped input, and again on the final
 * reconstructed string (after the root `<svg>` tag's attributes are
 * rewritten and inter-tag whitespace is collapsed). No known input differs
 * between the two passes — the root-tag rewrite only touches
 * `xmlns`/`width`/`height`/`viewBox`, none of which the checks below key
 * off, and whitespace collapse only removes runs matching `>\s+<`, which
 * cannot join two tokens into a new forbidden construct (e.g. it cannot
 * turn `a="on" load=` into `onload=`, since that spans an attribute value,
 * not `>...<`). The second pass is defense in depth against a future change
 * to the reconstruction step reintroducing something the first pass cleared.
 */
function check(text: string): void {
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(text)) reject(reason);
  }
  for (const match of text.matchAll(HREF_RE)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (!value.startsWith('#')) reject(`external reference "${value}" is not allowed`);
  }
}

/**
 * The security boundary for icons (spec §5.3): applied at set build time and
 * to every local `.svg` at load. Pure; string-based (icons are small and the
 * forbidden constructs are lexical), never touches the filesystem.
 */
export function sanitizeSvg(text: string, options: SanitizeOptions = {}): string {
  const maxBytes = options.maxBytes ?? ICON_MAX_BYTES;

  // Strip XML declarations and comments FIRST, then validate against the cleaned text.
  // This prevents comment-based obfuscation (e.g., <scr<!--x-->ipt>).
  let out = text
    .replace(/<\?xml[^]*?\?>/g, '')
    .replace(/<!--[^]*?-->/g, '')
    .trim();

  // Check forbidden patterns and href references against the stripped text.
  check(out);
  const rootMatch = /^<svg\b([^>]*)>/i.exec(out);
  if (rootMatch === null) reject('root element is not <svg>');
  let attrs = rootMatch[1] ?? '';

  const viewBox = /\sviewBox\s*=\s*["'][^"']*["']/i.exec(attrs);
  const width = /\swidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i.exec(attrs);
  const height = /\sheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i.exec(attrs);
  if (viewBox === null) {
    const w = width?.[1];
    const h = height?.[1];
    if (w === undefined || h === undefined)
      reject('root <svg> needs a viewBox or a numeric width and height');
    attrs = `${attrs} viewBox="0 0 ${w} ${h}"`;
  }
  attrs = attrs
    .replace(/\swidth\s*=\s*["'][^"']*["']/i, '')
    .replace(/\sheight\s*=\s*["'][^"']*["']/i, '');
  attrs = attrs.replace(/\sxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i, '');
  attrs = ` xmlns="http://www.w3.org/2000/svg"${collapseAttrWhitespace(attrs).trimEnd()}`;

  out = `<svg${attrs}>${out.slice(rootMatch[0].length)}`;
  out = out.replace(/>\s+</g, '><').trim();
  out = out.replace(/<\/svg>\s*$/i, '</svg>');

  // Re-check the final, reconstructed string (see the doc comment on `check`
  // above for why no known input distinguishes this pass from the first).
  check(out);

  const bytes = Buffer.byteLength(out, 'utf8');
  if (bytes > maxBytes) reject(`${bytes} bytes exceeds the ${maxBytes}-byte cap`);
  return out;
}
