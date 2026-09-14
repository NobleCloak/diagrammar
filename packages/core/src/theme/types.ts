import type { GraphShape, MessageStyle, ParticipantKind, Style } from '../model/types.js';

export type PresetName = 'light' | 'dark' | 'colorblind' | 'mono';
export type ThemeMode = 'light' | 'dark';
/** The only D2 theme-override slots that recolor reliably (spec §4.2). */
export type OverrideSlot = 'N1' | 'N2' | 'N7';

export interface Palette {
  background?: string;
  fill?: string;
  stroke?: string;
  text?: string;
  groupFill?: string;
  edge?: string;
}

/**
 * Normalized style defaults. Family blocks are always present (possibly
 * empty) with the palette already folded in as their weakest layer;
 * `messages` is the family-wide layer for messages (palette-only — the
 * theme file has no such block) and `messageStyles` is the per-kind layer
 * the file calls `messages` (spec §4.1).
 */
export interface ThemeDefaults {
  nodes: Style;
  groups: Style;
  edges: Style;
  participants: Style;
  messages: Style;
  shapes: Partial<Record<GraphShape, Style>>;
  kinds: Partial<Record<ParticipantKind, Style>>;
  messageStyles: Partial<Record<MessageStyle, Style>>;
}

export interface ResolvedTheme {
  /** Preset name, or the path exactly as written in the diagram. */
  name: string;
  base: PresetName;
  mode: ThemeMode;
  d2ThemeId: number;
  overrides: Partial<Record<OverrideSlot, string>>;
  /** As authored; the overlay reads `background` for its canvas colour. */
  palette: Palette;
  defaults: ThemeDefaults;
}
