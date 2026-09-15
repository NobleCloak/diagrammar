import { describe, expect, it } from 'vitest';
import * as core from './index.js';

describe('public API surface (Plan 01 portion)', () => {
  it('exports VERSION, the error classes, and shutdown', () => {
    expect(typeof core.VERSION).toBe('string');
    expect(typeof core.DiagrammarError).toBe('function');
    expect(typeof core.ValidationError).toBe('function');
    expect(typeof core.ConflictError).toBe('function');
    expect(typeof core.shutdown).toBe('function');
  });

  it('shutdown resolves without throwing when no engine has been created yet', async () => {
    await expect(core.shutdown()).resolves.toBeUndefined();
  });

  it('exports the theme and asset-resolver surface', () => {
    expect(core.PRESET_NAMES).toEqual(['light', 'dark', 'colorblind', 'mono']);
    expect(typeof core.fileResolver).toBe('function');
    expect(typeof core.memoryResolver).toBe('function');
    expect(typeof core.resolveTheme).toBe('function');
    expect(typeof core.checkThemeRef).toBe('function');
    expect(typeof core.generateThemeJsonSchema).toBe('function');
  });

  it('exports the icon surface', () => {
    expect(typeof core.IconRegistry).toBe('function');
    expect(typeof core.openIconSetDir).toBe('function');
    expect(typeof core.sanitizeSvg).toBe('function');
    expect(typeof core.checkIconRefs).toBe('function');
    expect(core.ICON_MAX_BYTES).toBe(262144);
  });
});
