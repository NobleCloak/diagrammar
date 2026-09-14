import type { PresetName, ResolvedTheme, ThemeDefaults, ThemeMode } from './types.js';

export interface PresetSpec {
  d2ThemeId: number;
  mode: ThemeMode;
  /** Shown by `diagrammar themes list`. */
  description: string;
}

export const PRESET_NAMES = [
  'light',
  'dark',
  'colorblind',
  'mono',
] as const satisfies readonly PresetName[];

export const PRESETS: Record<PresetName, PresetSpec> = {
  light: { d2ThemeId: 0, mode: 'light', description: 'D2 "Neutral default"' },
  dark: { d2ThemeId: 200, mode: 'dark', description: 'D2 "Dark mauve"' },
  colorblind: { d2ThemeId: 8, mode: 'light', description: 'D2 "Colorblind clear"' },
  mono: { d2ThemeId: 1, mode: 'light', description: 'D2 "Neutral grey"' },
};

export function isPresetName(value: string): value is PresetName {
  return (PRESET_NAMES as readonly string[]).includes(value);
}

export function emptyDefaults(): ThemeDefaults {
  return {
    nodes: {},
    groups: {},
    edges: {},
    participants: {},
    messages: {},
    shapes: {},
    kinds: {},
    messageStyles: {},
  };
}

export function presetTheme(name: PresetName): ResolvedTheme {
  const spec = PRESETS[name];
  return {
    name,
    base: name,
    mode: spec.mode,
    d2ThemeId: spec.d2ThemeId,
    overrides: {},
    palette: {},
    defaults: emptyDefaults(),
  };
}
