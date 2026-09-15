import type { ResolvedTheme } from '../theme/types.js';
import type { ThemeTokens } from './types.js';

// Light matches D2 theme 0; dark matches D2 theme 200 (spec section 5.5).
const LIGHT_TOKENS: ThemeTokens = {
  accent: '#0D5FBA',
  badgeText: '#FFFFFF',
  noteFill: '#FFF8C5',
  noteStroke: '#E3C55B',
  noteText: '#1F1F1F',
  legendText: '#1F1F1F',
  leader: '#8A8A8A',
  canvas: '#FFFFFF',
};

// canvas: D2 theme 200's own background rect fill (`fill-N7`), confirmed by
// rendering a dark-theme diagram and reading its background rect's fill.
const DARK_TOKENS: ThemeTokens = {
  accent: '#7DB0F5',
  badgeText: '#0B0B0B',
  noteFill: '#3A3520',
  noteStroke: '#8A7A2E',
  noteText: '#F0F0F0',
  legendText: '#F0F0F0',
  leader: '#9A9A9A',
  canvas: '#1E1E2E',
};

/** Light/dark token set by `mode`; the canvas follows the palette's `background` (spec §4.2). */
export function tokensFor(theme: ResolvedTheme): ThemeTokens {
  const base = theme.mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  return theme.palette.background !== undefined
    ? { ...base, canvas: theme.palette.background }
    : base;
}
