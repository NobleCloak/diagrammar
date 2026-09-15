import type { Style } from '../model/types.js';
import type { OverrideSlot, Palette } from './types.js';

/** Zod's `.optional()` yields `T | undefined`; the model wants omitted keys. */
export function buildPalette(input: { [K in keyof Palette]?: string | undefined }): Palette {
  return {
    ...(input.background !== undefined ? { background: input.background } : {}),
    ...(input.fill !== undefined ? { fill: input.fill } : {}),
    ...(input.stroke !== undefined ? { stroke: input.stroke } : {}),
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.groupFill !== undefined ? { groupFill: input.groupFill } : {}),
    ...(input.edge !== undefined ? { edge: input.edge } : {}),
  };
}

/**
 * The two palette slots that lower to D2 `theme-overrides` (spec §4.2):
 * `text` colours every label via N1 (shape/container/fragment text) and N2
 * (edge/message label text); `background` is N7. Everything else is
 * emitted per element, because D2 picks a shape's fill slot by nesting
 * level and shape type (see the spike note's slot map).
 */
export function paletteOverrides(palette: Palette): Partial<Record<OverrideSlot, string>> {
  const out: Partial<Record<OverrideSlot, string>> = {};
  if (palette.text !== undefined) {
    out.N1 = palette.text;
    out.N2 = palette.text;
  }
  if (palette.background !== undefined) out.N7 = palette.background;
  return out;
}

export interface FamilyStyles {
  nodes: Style;
  groups: Style;
  edges: Style;
  participants: Style;
  messages: Style;
}

/** Per-element lowering of `fill`, `stroke`, `groupFill`, `edge` (spec §4.2). */
export function paletteFamilyStyles(palette: Palette): FamilyStyles {
  const shape: Style = {
    ...(palette.fill !== undefined ? { fill: palette.fill } : {}),
    ...(palette.stroke !== undefined ? { stroke: palette.stroke } : {}),
  };
  const line: Style = palette.edge !== undefined ? { stroke: palette.edge } : {};
  return {
    nodes: { ...shape },
    participants: { ...shape },
    groups: {
      ...(palette.groupFill !== undefined ? { fill: palette.groupFill } : {}),
      ...(palette.stroke !== undefined ? { stroke: palette.stroke } : {}),
    },
    edges: { ...line },
    messages: { ...line },
  };
}
