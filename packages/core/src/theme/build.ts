import { buildStyle } from '../model/build.js';
import type { Style } from '../model/types.js';
import type { StyleInput } from '../schema/style.js';
import { buildPalette, paletteFamilyStyles, paletteOverrides } from './palette.js';
import { PRESETS } from './presets.js';
import type { ThemeFileInput } from './schema.js';
import type { ResolvedTheme } from './types.js';

function styleOrEmpty(input: StyleInput | undefined): Style {
  return input === undefined ? {} : buildStyle(input);
}

function buildKeyed<K extends string>(
  input: Partial<Record<K, StyleInput | undefined>> | undefined,
): Partial<Record<K, Style>> {
  const out: Partial<Record<K, Style>> = {};
  if (input === undefined) return out;
  for (const key of Object.keys(input) as K[]) {
    const value = input[key];
    if (value !== undefined) out[key] = buildStyle(value);
  }
  return out;
}

/**
 * Normalizes a validated theme file into a `ResolvedTheme`. The palette's
 * per-element slots become the weakest layer of each family default
 * (spec §4.2/§4.3); `text`/`background` become D2 overrides.
 */
export function buildTheme(input: ThemeFileInput, name: string): ResolvedTheme {
  const spec = PRESETS[input.base];
  const palette = buildPalette(input.palette ?? {});
  const family = paletteFamilyStyles(palette);
  const d = input.defaults ?? {};
  return {
    name,
    base: input.base,
    mode: spec.mode,
    d2ThemeId: spec.d2ThemeId,
    overrides: paletteOverrides(palette),
    palette,
    defaults: {
      nodes: { ...family.nodes, ...styleOrEmpty(d.nodes) },
      groups: { ...family.groups, ...styleOrEmpty(d.groups) },
      edges: { ...family.edges, ...styleOrEmpty(d.edges) },
      participants: { ...family.participants, ...styleOrEmpty(d.participants) },
      messages: { ...family.messages },
      shapes: buildKeyed(d.shapes),
      kinds: buildKeyed(d.kinds),
      messageStyles: buildKeyed(d.messages),
    },
  };
}
