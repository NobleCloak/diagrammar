import { describe, it, expect } from 'vitest';
import { tokensFor } from './theme.js';

describe('tokensFor', () => {
  it('returns the light palette for theme "light"', () => {
    const tokens = tokensFor('light');
    expect(tokens.accent).toBe('#0D5FBA');
    expect(tokens.noteFill).toBe('#FFF8C5');
    expect(tokens.noteStroke).toBe('#E3C55B');
    expect(tokens.noteText).toBe('#1F1F1F');
    expect(tokens.canvas).toBe('#FFFFFF');
  });

  it('returns the dark palette for theme "dark"', () => {
    const tokens = tokensFor('dark');
    expect(tokens.accent).toBe('#7DB0F5');
    expect(tokens.noteFill).toBe('#3A3520');
    expect(tokens.noteStroke).toBe('#8A7A2E');
    expect(tokens.noteText).toBe('#F0F0F0');
    expect(tokens.canvas).toBe('#1E1E2E');
  });

  it('gives every token a non-empty hex value in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const tokens = tokensFor(theme);
      for (const value of Object.values(tokens)) {
        expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});
