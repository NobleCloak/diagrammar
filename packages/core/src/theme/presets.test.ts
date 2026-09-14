import { describe, expect, it } from 'vitest';
import { PRESETS, PRESET_NAMES, isPresetName, presetTheme } from './presets.js';

describe('presets', () => {
  it('exposes exactly the four spec presets, in a fixed order', () => {
    expect(PRESET_NAMES).toEqual(['light', 'dark', 'colorblind', 'mono']);
  });
  it('maps each preset to its D2 theme id and mode (spec §3.1)', () => {
    expect(PRESETS.light).toMatchObject({ d2ThemeId: 0, mode: 'light' });
    expect(PRESETS.dark).toMatchObject({ d2ThemeId: 200, mode: 'dark' });
    expect(PRESETS.colorblind).toMatchObject({ d2ThemeId: 8, mode: 'light' });
    expect(PRESETS.mono).toMatchObject({ d2ThemeId: 1, mode: 'light' });
  });
  it('isPresetName narrows only real names', () => {
    expect(isPresetName('dark')).toBe(true);
    expect(isPresetName('neon')).toBe(false);
    expect(isPresetName('toString')).toBe(false);
  });
  it('presetTheme yields an empty palette, no overrides, and empty defaults', () => {
    const t = presetTheme('colorblind');
    expect(t).toEqual({
      name: 'colorblind',
      base: 'colorblind',
      mode: 'light',
      d2ThemeId: 8,
      overrides: {},
      palette: {},
      defaults: {
        nodes: {},
        groups: {},
        edges: {},
        participants: {},
        messages: {},
        shapes: {},
        kinds: {},
        messageStyles: {},
      },
    });
  });
});
