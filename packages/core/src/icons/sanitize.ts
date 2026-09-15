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
  [/<script[\s>]/i, '<script> is not allowed'],
  [/<foreignObject[\s>]/i, '<foreignObject> is not allowed'],
  [/\son[a-z]+\s*=/i, 'event-handler attributes are not allowed'],
  [/<style[\s>][^]*?@import/i, '<style> with @import is not allowed'],
];

/** Every href/xlink:href must be a same-document fragment. */
const HREF_RE = /\s(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi;

/**
 * The security boundary for icons (spec §5.3): applied at set build time and
 * to every local `.svg` at load. Pure; string-based (icons are small and the
 * forbidden constructs are lexical), never touches the filesystem.
 */
export function sanitizeSvg(text: string, options: SanitizeOptions = {}): string {
  const maxBytes = options.maxBytes ?? ICON_MAX_BYTES;
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(text)) reject(reason);
  }
  for (const match of text.matchAll(HREF_RE)) {
    const value = match[1] ?? '';
    if (!value.startsWith('#')) reject(`external reference "${value}" is not allowed`);
  }

  let out = text
    .replace(/<\?xml[^]*?\?>/g, '')
    .replace(/<!--[^]*?-->/g, '')
    .trim();
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
  attrs = ` xmlns="http://www.w3.org/2000/svg"${attrs.replace(/\s+/g, ' ').trimEnd()}`;

  out = `<svg${attrs}>${out.slice(rootMatch[0].length)}`;
  out = out.replace(/>\s+</g, '><').trim();

  const bytes = Buffer.byteLength(out, 'utf8');
  if (bytes > maxBytes) reject(`${bytes} bytes exceeds the ${maxBytes}-byte cap`);
  return out;
}
