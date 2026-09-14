import { describe, it, expect } from 'vitest';
import { d2String, styleLines, themeOverrideLines } from './style.js';
import type { Style } from '../model/types.js';

describe('d2String', () => {
  it('wraps a plain string in double quotes', () => {
    expect(d2String('hello')).toBe('"hello"');
  });

  it('escapes double quotes', () => {
    expect(d2String('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('escapes backslashes', () => {
    expect(d2String('a\\b')).toBe('"a\\\\b"');
  });

  it('escapes backslashes before quotes so order does not double-escape', () => {
    expect(d2String('\\"')).toBe('"\\\\\\""');
  });
});

describe('styleLines', () => {
  it('returns an empty array for undefined style', () => {
    expect(styleLines(undefined)).toEqual([]);
  });

  it('returns an empty array for an empty style object', () => {
    expect(styleLines({})).toEqual([]);
  });

  it('emits fill as a quoted style.fill line', () => {
    const style: Style = { fill: '#eef' };
    expect(styleLines(style)).toEqual(['style.fill: "#eef"']);
  });

  it('emits stroke, strokeWidth, and opacity in field order', () => {
    const style: Style = { stroke: 'red', strokeWidth: 2, opacity: 0.5 };
    expect(styleLines(style)).toEqual([
      'style.stroke: "red"',
      'style.stroke-width: 2',
      'style.opacity: 0.5',
    ]);
  });

  it('emits dashed as a fixed stroke-dash of 3', () => {
    expect(styleLines({ dashed: true })).toEqual(['style.stroke-dash: 3']);
  });

  it('omits dashed when false', () => {
    expect(styleLines({ dashed: false })).toEqual([]);
  });

  it('emits bold and italic as boolean lines', () => {
    expect(styleLines({ bold: true, italic: true })).toEqual([
      'style.bold: true',
      'style.italic: true',
    ]);
  });

  it('emits fontColor as style.font-color', () => {
    expect(styleLines({ fontColor: 'blue' })).toEqual(['style.font-color: "blue"']);
  });

  it('emits every field in fixed declaration order regardless of input key order', () => {
    const style: Style = { opacity: 0.9, fill: 'red', bold: true };
    expect(styleLines(style)).toEqual([
      'style.fill: "red"',
      'style.bold: true',
      'style.opacity: 0.9',
    ]);
  });
});

describe('themeOverrideLines', () => {
  it('emits N1, N2, N7 in that fixed order, quoted', () => {
    expect(themeOverrideLines({ N7: '#fff', N1: '#111', N2: '#222' })).toEqual([
      'N1: "#111"',
      'N2: "#222"',
      'N7: "#fff"',
    ]);
  });
  it('emits nothing for an empty map', () => {
    expect(themeOverrideLines({})).toEqual([]);
  });
});
