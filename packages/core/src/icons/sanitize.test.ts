import { describe, expect, it } from 'vitest';
import { ICON_MAX_BYTES, sanitizeSvg } from './sanitize.js';

const LUCIDE = `<!-- @license lucide-static v1.46.0 - ISC -->
<svg
  class="lucide lucide-database"
  xmlns="http://www.w3.org/2000/svg"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
>
  <ellipse cx="12" cy="5" rx="9" ry="3" />
  <path d="M3 5V19A9 3 0 0 0 21 19V5" />
</svg>
`;

describe('sanitizeSvg normalization', () => {
  it('drops the license comment, root width/height, and inter-tag whitespace; keeps viewBox', () => {
    const out = sanitizeSvg(LUCIDE);
    expect(out.startsWith('<svg')).toBe(true);
    expect(out).not.toContain('<!--');
    expect(out).not.toMatch(/\swidth="24"/);
    expect(out).not.toMatch(/\sheight="24"/);
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).not.toMatch(/>\s+</);
    expect(out.endsWith('</svg>')).toBe(true);
  });
  it('drops an XML declaration', () => {
    expect(sanitizeSvg('<?xml version="1.0"?><svg viewBox="0 0 1 1"><rect/></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect/></svg>',
    );
  });
  it('synthesizes a viewBox from width/height when none exists', () => {
    expect(
      sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect/></svg>'),
    ).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32"><rect/></svg>');
  });
  it('adds the SVG namespace when missing and keeps other root attributes', () => {
    expect(sanitizeSvg('<svg role="img" viewBox="0 0 24 24"><path d="M0 0"/></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 24 24"><path d="M0 0"/></svg>',
    );
  });
  it('keeps text content whitespace inside elements', () => {
    expect(
      sanitizeSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><text>a b</text></svg>',
      ),
    ).toContain('<text>a b</text>');
  });
  it('allows fragment hrefs (single quoted)', () => {
    const wrap = (inner: string): string =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9">${inner}</svg>`;
    expect(() => sanitizeSvg(wrap("<use href='#p'/>"))).not.toThrow();
  });
  it('allows unquoted fragment hrefs', () => {
    const wrap = (inner: string): string =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9">${inner}</svg>`;
    expect(() => sanitizeSvg(wrap('<use href=#p />'))).not.toThrow();
  });
  it('normalizes uppercase SVG root tag to lowercase', () => {
    expect(
      sanitizeSvg('<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect/></SVG>'),
    ).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect/></svg>');
  });
  it('ensures idempotence (sanitizing twice yields same result)', () => {
    const sanitized1 = sanitizeSvg(LUCIDE);
    const sanitized2 = sanitizeSvg(sanitized1);
    expect(sanitized2).toBe(sanitized1);
  });
});

describe('sanitizeSvg rejections (icon_invalid)', () => {
  const wrap = (inner: string): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9">${inner}</svg>`;
  it.each([
    ['script', wrap('<script>alert(1)</script>')],
    ['foreignObject', wrap('<foreignObject><div/></foreignObject>')],
    ['event handler', wrap('<rect onload="x()"/>')],
    ['external href', wrap('<image href="https://evil/x.png"/>')],
    ['external xlink:href', wrap('<use xlink:href="file:///etc/passwd"/>')],
    ['style', wrap('<style>@import url(x)</style>')],
    ['doctype', '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"/>'],
    ['entity', '<!ENTITY x "y"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"/>'],
    ['not an svg', '<div>hi</div>'],
    ['no size info', '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'],
    ['comment-obfuscated script', wrap('<scr<!--x-->ipt>alert(1)</scr<!--x-->ipt>')],
    ['comment-obfuscated style import', wrap('<style>a{}@imp<!--x-->ort url(evil);</style>')],
    ['comment-obfuscated xlink:href', wrap('<use xli<!--x-->nk:href="http://evil/x.svg"/>')],
    ['comment-obfuscated event handler', wrap('<rect on<!--x-->load="x()"/>')],
    [
      'custom namespace prefix href',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:x="http://www.w3.org/1999/xlink" viewBox="0 0 9 9"><use x:href="http://evil/x.svg"/></svg>',
    ],
    ['unquoted external href', wrap('<image href=http://evil/x.png />')],
    ['slash-delimited script tag', wrap('<script/src="http://evil/x.js"></script>')],
    ['slash-delimited event handler', wrap('<rect/onload="alert(1)"/>')],
    ['slash-delimited href', wrap('<use/href="http://evil/x.svg"/>')],
    ['style with CSS hex escape', wrap('<style>a{}@\\69mport url(evil);</style>')],
    ['style with content', wrap('<style>.a{fill:red}</style>')],
    ['slash-delimited foreignObject', wrap('<foreignObject/>')],
  ])('rejects %s', (_label, svg) => {
    expect(() => sanitizeSvg(svg)).toThrowError(expect.objectContaining({ code: 'icon_invalid' }));
  });
  it('allows fragment hrefs', () => {
    expect(() =>
      sanitizeSvg(wrap('<defs><path id="p" d="M0 0"/></defs><use href="#p"/>')),
    ).not.toThrow();
  });
  it('allows slash-delimited fragment hrefs', () => {
    expect(() => sanitizeSvg(wrap('<use/href="#p"/>'))).not.toThrow();
  });
  it('rejects an icon over the byte cap, naming the cap', () => {
    const big = wrap(`<path d="${'M0 0 '.repeat(ICON_MAX_BYTES / 5)}"/>`);
    expect(() => sanitizeSvg(big)).toThrowError(
      expect.objectContaining({
        code: 'icon_invalid',
        message: expect.stringContaining('262144') as string,
      }),
    );
  });
  it('honours a custom cap', () => {
    expect(() => sanitizeSvg(wrap('<rect/>'), { maxBytes: 10 })).toThrowError(
      expect.objectContaining({ code: 'icon_invalid' }),
    );
  });
});
