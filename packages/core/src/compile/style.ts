import type { Style } from '../model/types.js';
import type { OverrideSlot } from '../theme/types.js';

/**
 * Quotes and escapes a string for use as a D2 string literal (a label value,
 * a style value, or a quoted key). D2 uses the same escaping as JSON strings
 * for `"` and `\`.
 */
export function d2String(s: string): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/** The fixed D2 line emitted to dim an out-of-focus element for a view. */
export const DIM_OPACITY_LINE = 'style.opacity: 0.25';

const OVERRIDE_ORDER: readonly OverrideSlot[] = ['N1', 'N2', 'N7'];

/** D2 `theme-overrides` entries in a fixed slot order (spec §4.2). */
export function themeOverrideLines(overrides: Partial<Record<OverrideSlot, string>>): string[] {
  const lines: string[] = [];
  for (const slot of OVERRIDE_ORDER) {
    const value = overrides[slot];
    if (value !== undefined) lines.push(`${slot}: ${d2String(value)}`);
  }
  return lines;
}

/**
 * Quotes an absolute, dot-joined D2 key segment by segment (e.g.
 * `warehouse.fulfilment.db` -> `"warehouse"."fulfilment"."db"`), so a model
 * id that happens to collide with a D2 reserved keyword (`link`, `icon`,
 * `label`, `style`, `shape`, ...) still compiles. Model ids never contain a
 * literal `.` (schema-enforced), so splitting on `.` only ever separates
 * container nesting, never a single id.
 */
export function quoteKey(key: string): string {
  return key.split('.').map(d2String).join('.');
}

/**
 * Converts the constrained Style subset (spec §3.5) into D2 `style.*` lines,
 * in a fixed field order so output is deterministic regardless of the input
 * object's key order. Returns an empty array for `undefined` or an all-empty
 * style.
 *
 * When `dim` is true, view dimming wins over an authored `style.opacity`:
 * the authored opacity line is suppressed and `DIM_OPACITY_LINE` is appended
 * last instead (even when `style` is undefined), so a dimmed element never
 * emits two `style.opacity:` lines.
 */
export function styleLines(style: Style | undefined, dim = false): string[] {
  if (!style) return dim ? [DIM_OPACITY_LINE] : [];
  const lines: string[] = [];
  if (style.fill !== undefined) lines.push(`style.fill: ${d2String(style.fill)}`);
  if (style.stroke !== undefined) lines.push(`style.stroke: ${d2String(style.stroke)}`);
  if (style.strokeWidth !== undefined) lines.push(`style.stroke-width: ${style.strokeWidth}`);
  if (style.dashed === true) lines.push('style.stroke-dash: 3');
  if (style.bold === true) lines.push('style.bold: true');
  if (style.italic === true) lines.push('style.italic: true');
  if (style.fontColor !== undefined) lines.push(`style.font-color: ${d2String(style.fontColor)}`);
  if (!dim && style.opacity !== undefined) lines.push(`style.opacity: ${style.opacity}`);
  if (dim) lines.push(DIM_OPACITY_LINE);
  return lines;
}
