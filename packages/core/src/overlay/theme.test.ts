import { describe, expect, it } from 'vitest';
import { buildTheme, presetTheme } from '../theme/index.js';
import { tokensFor } from './theme.js';

describe('tokensFor', () => {
  it('picks the light set for light-mode presets and the dark set for dark', () => {
    expect(tokensFor(presetTheme('light')).canvas).toBe('#FFFFFF');
    expect(tokensFor(presetTheme('colorblind')).canvas).toBe('#FFFFFF');
    expect(tokensFor(presetTheme('dark')).canvas).toBe('#1E1E2E');
  });
  it('uses the palette background as the canvas colour', () => {
    const theme = buildTheme(
      { 'diagrammar-theme': 1, base: 'dark', palette: { background: '#000000' } },
      'x.yaml',
    );
    const tokens = tokensFor(theme);
    expect(tokens.canvas).toBe('#000000');
    expect(tokens.noteText).toBe('#F0F0F0');
  });
});
