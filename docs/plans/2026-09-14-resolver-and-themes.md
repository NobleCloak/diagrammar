# Resolver + Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Diagrammar file name a built-in theme preset or a reusable theme file (palette + per-kind style defaults), resolved through an injected asset resolver, with a jailed resolver in the MCP server and a themed golden proving determinism.

**Architecture:** The diagram model keeps only the theme _reference_ string, so `parse()`/`validate()` stay synchronous. `render()` resolves the reference (preset table, or a theme file read through an `AssetResolver`) into a `ResolvedTheme`, hands it to `compile()` (which folds theme defaults into each element's D2 `style.*` lines and emits `N1`/`N2`/`N7` theme overrides), to the engine (D2 theme id) and to the overlay (light/dark token set, canvas colour). The CLI builds a `fileResolver` at the diagram's directory; the MCP server builds one wrapped in its existing root jail.

**Tech Stack:** TypeScript 6 strict (`exactOptionalPropertyTypes`), Bun 1.4 workspaces, Zod 4 (`z.partialRecord`, `z.toJSONSchema`), Vitest 5, `@d2lang/d2` 0.1.34 WASM, resvg WASM, `yaml` 2.9.

**Spec:** `docs/specs/2026-09-14-themes-and-icons-design.md` — §3.1, §4, §6, §7.1 (`themes list`), §7.3, §8, §9. Icons (§3.2–3.4, §5, `diagrammar_icons`) are plan 2 and are **not** touched here. Spike note: `docs/spikes/2026-09-14-icons-and-themes-spike.md`.

## Global Constraints

- All gates run from the repo root, **build first** (type-aware lint reads `dist/*.d.mts`): `bun install --frozen-lockfile && bun run build && bun run lint && bun run format:check && bun run typecheck && bun run test`. Every task ends with at least `bun run typecheck && bun run test` green; Task 12 runs the full chain plus coverage.
- Existing goldens in `examples/goldens/` must stay byte-identical (`examples/goldens.test.ts` enforces it). A preset theme must compile to exactly the D2 text it compiles to today.
- No `any`. Optional model fields are omitted, never set to `undefined` (`exactOptionalPropertyTypes`) — copy the `...(x !== undefined ? { x } : {})` pattern from `packages/core/src/model/build.ts`.
- Every commit is signed off (`git commit -s`, DCO check on PRs) and carries the session trailers shown in Task 1's commit step. Work on branch `design/themes-and-icons` (already exists, holds the spec); never commit to `main`.
- Preset names and D2 ids (spec §3.1): `light` → 0, `dark` → 200, `colorblind` → 8, `mono` → 1. Default theme stays `light`.
- Theme override slot order in emitted D2: `N1`, `N2`, `N7` (spec §4.2).
- New `DiagrammarError` codes (spec §6.3): `asset_resolver_missing`, `asset_fs_disabled`, `asset_outside_base`, `asset_not_found`, `theme_invalid`.
- Markdown under `docs/` and `README.md` is checked by Prettier; run `bunx prettier --write <file>` after editing docs.
- Do not edit `CLAUDE.md` (untracked, maintainer-owned) or `docs/superpowers/` (deleted on purpose).

## File structure

New files (all under `packages/core/src` unless noted):

| File                                                                              | Responsibility                                                                                 |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `assets/paths.ts`                                                                 | Pure path helpers: `isPathRef`, `normalizeRelativePath`.                                       |
| `assets/resolver.ts`                                                              | `AssetResolver` interface, `fileResolver(baseDir, {root})`, `memoryResolver(files)`.           |
| `assets/index.ts`                                                                 | Barrel.                                                                                        |
| `theme/types.ts`                                                                  | `PresetName`, `ThemeMode`, `OverrideSlot`, `Palette`, `ThemeDefaults`, `ResolvedTheme`.        |
| `theme/presets.ts`                                                                | `PRESETS`, `PRESET_NAMES`, `isPresetName`, `presetTheme`, `emptyDefaults`.                     |
| `theme/palette.ts`                                                                | `buildPalette`, `paletteOverrides`, `paletteFamilyStyles` (spec §4.2 lowering).                |
| `theme/schema.ts`                                                                 | Zod `ThemeFileSchema` (+ `ThemeFileInput`), `generateThemeJsonSchema`.                         |
| `theme/build.ts`                                                                  | `buildTheme(input, name)`: normalizes a parsed theme file into a `ResolvedTheme`.              |
| `theme/merge.ts`                                                                  | `StyleTarget`, `mergeStyle(theme, target, own)` — the only place precedence (§4.3) is encoded. |
| `theme/load.ts`                                                                   | `parseThemeFile(text, name)`, `resolveTheme(ref, resolver)`, `checkThemeRef(ref, resolver)`.   |
| `theme/index.ts`                                                                  | Barrel.                                                                                        |
| `packages/core/schema/diagrammar-theme-v1.json`                                   | Generated JSON Schema for theme files.                                                         |
| `packages/cli/src/commands/themes.ts`                                             | `diagrammar themes list`.                                                                      |
| `examples/themes/house.yaml`, `examples/themed.yaml`, `examples/goldens/themed.*` | Themed golden.                                                                                 |
| `.changeset/themes.md`                                                            | Minor bump for the fixed group.                                                                |

Modified files: `model/types.ts` (`Theme` widens to `string`), `model/build.ts` (export `buildStyle`), `model/semantic.ts` (rule 10), `schema/envelope.ts` (`ThemeSchema`), `schema/json-schema.ts`, `packages/core/scripts/generate-schema.ts`, `parse.ts` (export `withLine`, `yamlErrorsToIssues`), `compile/style.ts`, `compile/graph.ts`, `compile/sequence.ts`, `compile/index.ts`, `engine/types.ts`, `engine/D2Engine.ts`, `engine/index.ts`, `overlay/theme.ts`, `overlay/types.ts`, `render.ts`, `document/describe.ts`, `document/ops.ts`, `index.ts`, CLI `render.ts`/`validate.ts`/`main.ts`, MCP `fs.ts`/`tools/render.ts`/`tools/validate.ts`/`tools/schema.ts`/`resources.ts`/`guide.ts`, `examples/goldens.test.ts`, `examples/examples.test.ts`, `scripts/goldens-update.ts`, `docs/docs.test.ts`, `docs/format-guide.md`, `docs/SKILL.md`, `README.md`, and the tests beside each.

---

### Task 1: Asset path helpers and resolvers

**Files:**

- Create: `packages/core/src/assets/paths.ts`, `packages/core/src/assets/paths.test.ts`
- Create: `packages/core/src/assets/resolver.ts`, `packages/core/src/assets/resolver.test.ts`
- Create: `packages/core/src/assets/index.ts`

**Interfaces:**

- Consumes: `DiagrammarError` from `../errors.js`.
- Produces: `isPathRef(value: string): boolean`; `normalizeRelativePath(relPath: string): string` (throws `DiagrammarError` code `asset_outside_base`); `interface AssetResolver { read(relPath: string): Promise<Uint8Array> }`; `fileResolver(baseDir: string, options?: { root?: string }): AssetResolver`; `memoryResolver(files: Record<string, string>): AssetResolver` (missing key → code `asset_not_found`).

- [ ] **Step 1: Write the failing tests for the path helpers**

`packages/core/src/assets/paths.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isPathRef, normalizeRelativePath } from './paths.js';

describe('isPathRef', () => {
  it('treats a bare name as a preset reference', () => {
    expect(isPathRef('light')).toBe(false);
    expect(isPathRef('colorblind')).toBe(false);
  });
  it('treats anything with a slash or a yaml extension as a path', () => {
    expect(isPathRef('./themes/house.yaml')).toBe(true);
    expect(isPathRef('themes/house.yml')).toBe(true);
    expect(isPathRef('house.yaml')).toBe(true);
    expect(isPathRef('house.YML')).toBe(true);
  });
});

describe('normalizeRelativePath', () => {
  it('collapses . segments and joins with /', () => {
    expect(normalizeRelativePath('./themes/./house.yaml')).toBe('themes/house.yaml');
  });
  it('keeps .. that climbs above the base (containment is the resolver’s job)', () => {
    expect(normalizeRelativePath('../shared/house.yaml')).toBe('../shared/house.yaml');
    expect(normalizeRelativePath('a/../../b.yaml')).toBe('../b.yaml');
  });
  it.each([
    ['/etc/house.yaml', 'absolute'],
    ['C:/themes/house.yaml', 'drive letter'],
    ['themes\\house.yaml', 'backslash'],
    ['themes/hou\0se.yaml', 'null byte'],
    ['', 'empty'],
    ['.', 'no file segment'],
  ])('rejects %s (%s) with asset_outside_base', (input) => {
    expect(() => normalizeRelativePath(input)).toThrowError(
      expect.objectContaining({ code: 'asset_outside_base' }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd packages/core test -- src/assets/paths.test.ts`
Expected: FAIL — `Cannot find module './paths.js'`.

- [ ] **Step 3: Implement `paths.ts`**

```ts
import { DiagrammarError } from '../errors.js';

/**
 * A `theme:` value is a file reference (spec §3.1) when it contains a `/`
 * or ends in `.yaml`/`.yml`; otherwise it names a preset.
 */
export function isPathRef(value: string): boolean {
  return value.includes('/') || /\.ya?ml$/i.test(value);
}

/**
 * Validates and normalizes a relative asset path (spec §6.1): rejects
 * absolute paths, Windows drive letters, backslashes, null bytes and empty
 * results; collapses `.` and resolvable `..` segments; keeps a leading `..`
 * (a shared theme normally lives above the diagrams that use it — the
 * resolver, not this function, enforces the jail root). Pure: never touches
 * the filesystem.
 */
export function normalizeRelativePath(relPath: string): string {
  if (relPath.length === 0 || relPath.includes('\0')) {
    throw new DiagrammarError(`invalid asset path "${relPath}"`, 'asset_outside_base');
  }
  if (relPath.startsWith('/') || /^[A-Za-z]:/.test(relPath) || relPath.includes('\\')) {
    throw new DiagrammarError(
      `asset path must be relative and use "/" separators, got "${relPath}"`,
      'asset_outside_base',
    );
  }
  const out: string[] = [];
  for (const segment of relPath.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      const last = out[out.length - 1];
      if (last !== undefined && last !== '..') {
        out.pop();
      } else {
        out.push('..');
      }
      continue;
    }
    out.push(segment);
  }
  const last = out[out.length - 1];
  if (last === undefined || last === '..') {
    throw new DiagrammarError(`asset path "${relPath}" does not name a file`, 'asset_outside_base');
  }
  return out.join('/');
}
```

- [ ] **Step 4: Run the path tests**

Run: `bun run --cwd packages/core test -- src/assets/paths.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Write the failing resolver tests**

`packages/core/src/assets/resolver.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileResolver, memoryResolver } from './resolver.js';

describe('memoryResolver', () => {
  it('returns the UTF-8 bytes of a known file, keyed by normalized path', async () => {
    const r = memoryResolver({ 'themes/house.yaml': 'base: light\n' });
    const bytes = await r.read('./themes/house.yaml');
    expect(new TextDecoder().decode(bytes)).toBe('base: light\n');
  });
  it('rejects an unknown file with asset_not_found', async () => {
    const r = memoryResolver({});
    await expect(r.read('nope.yaml')).rejects.toMatchObject({ code: 'asset_not_found' });
  });
});

describe('fileResolver', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-resolver-'));
    await mkdir(join(dir, 'root', 'diagrams'), { recursive: true });
    await mkdir(join(dir, 'root', 'themes'), { recursive: true });
    await writeFile(join(dir, 'root', 'themes', 'house.yaml'), 'base: light\n', 'utf8');
    await writeFile(join(dir, 'outside.yaml'), 'base: dark\n', 'utf8');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads relative to baseDir, allowing .. when no root is set', async () => {
    const r = fileResolver(join(dir, 'root', 'diagrams'));
    const bytes = await r.read('../themes/house.yaml');
    expect(new TextDecoder().decode(bytes)).toBe('base: light\n');
  });

  it('allows .. that stays inside root', async () => {
    const r = fileResolver(join(dir, 'root', 'diagrams'), { root: join(dir, 'root') });
    await expect(r.read('../themes/house.yaml')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('rejects a path that escapes root with asset_outside_base', async () => {
    const r = fileResolver(join(dir, 'root', 'diagrams'), { root: join(dir, 'root') });
    await expect(r.read('../../outside.yaml')).rejects.toMatchObject({
      code: 'asset_outside_base',
    });
  });

  it('does not resolve symlinks itself (the MCP jail does)', async () => {
    await symlink(join(dir, 'outside.yaml'), join(dir, 'root', 'themes', 'link.yaml'));
    const r = fileResolver(join(dir, 'root', 'diagrams'), { root: join(dir, 'root') });
    const bytes = await r.read('../themes/link.yaml');
    expect(new TextDecoder().decode(bytes)).toBe('base: dark\n');
  });

  it('surfaces a missing file as asset_not_found', async () => {
    const r = fileResolver(join(dir, 'root', 'diagrams'));
    await expect(r.read('missing.yaml')).rejects.toMatchObject({ code: 'asset_not_found' });
  });

  it('rejects malformed paths before touching the disk', async () => {
    const r = fileResolver(join(dir, 'root'));
    await expect(r.read('/etc/passwd')).rejects.toMatchObject({ code: 'asset_outside_base' });
  });
});
```

- [ ] **Step 6: Run the resolver tests to verify they fail**

Run: `bun run --cwd packages/core test -- src/assets/resolver.test.ts`
Expected: FAIL — `Cannot find module './resolver.js'`.

- [ ] **Step 7: Implement `resolver.ts` and the barrel**

`packages/core/src/assets/resolver.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { DiagrammarError } from '../errors.js';
import { normalizeRelativePath } from './paths.js';

/**
 * Supplies the bytes of files a diagram references by relative path (a
 * theme file today; icons in plan 2). Core never reads the filesystem for
 * these itself — the CLI and the MCP server each hand `render()` a
 * resolver rooted where they decide (spec §6.2).
 */
export interface AssetResolver {
  /** `relPath` is `/`-separated and relative to the diagram's directory. */
  read(relPath: string): Promise<Uint8Array>;
}

export interface FileResolverOptions {
  /**
   * Absolute directory every resolved path must stay inside. Omit for
   * trusted local use (the CLI). The check is lexical; symlink targets are
   * the MCP jail's concern (spec §6.1).
   */
  root?: string;
}

function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function fileResolver(baseDir: string, options: FileResolverOptions = {}): AssetResolver {
  const baseAbs = resolve(baseDir);
  const rootAbs = options.root !== undefined ? resolve(options.root) : undefined;
  return {
    async read(relPath: string): Promise<Uint8Array> {
      const target = resolve(baseAbs, normalizeRelativePath(relPath));
      if (rootAbs !== undefined) {
        const rel = relative(rootAbs, target);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          throw new DiagrammarError(
            `asset path "${relPath}" escapes the allowed root`,
            'asset_outside_base',
          );
        }
      }
      try {
        return await readFile(target);
      } catch (error) {
        if (isErrno(error) && error.code === 'ENOENT') {
          throw new DiagrammarError(`asset "${relPath}" not found`, 'asset_not_found');
        }
        throw error;
      }
    },
  };
}

/** In-memory resolver for tests and docs; keys are normalized relative paths. */
export function memoryResolver(files: Record<string, string>): AssetResolver {
  return {
    read(relPath: string): Promise<Uint8Array> {
      const text = files[normalizeRelativePath(relPath)];
      if (text === undefined) {
        return Promise.reject(
          new DiagrammarError(`asset "${relPath}" not found`, 'asset_not_found'),
        );
      }
      return Promise.resolve(new TextEncoder().encode(text));
    },
  };
}
```

`packages/core/src/assets/index.ts`:

```ts
export { isPathRef, normalizeRelativePath } from './paths.js';
export { fileResolver, memoryResolver } from './resolver.js';
export type { AssetResolver, FileResolverOptions } from './resolver.js';
```

- [ ] **Step 8: Run both test files and the typecheck**

Run: `bun run --cwd packages/core test -- src/assets && bun run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/assets
git commit -s -m "feat(core): asset path helpers and file/memory resolvers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 2: Theme types, presets, and palette lowering

**Files:**

- Create: `packages/core/src/theme/types.ts`
- Create: `packages/core/src/theme/presets.ts`, `packages/core/src/theme/presets.test.ts`
- Create: `packages/core/src/theme/palette.ts`, `packages/core/src/theme/palette.test.ts`

**Interfaces:**

- Consumes: `Style`, `GraphShape`, `ParticipantKind`, `MessageStyle` from `../model/types.js`.
- Produces: types `PresetName`, `ThemeMode`, `OverrideSlot`, `Palette`, `ThemeDefaults`, `ResolvedTheme`; `PRESETS`, `PRESET_NAMES` (tuple `['light','dark','colorblind','mono']`), `isPresetName(v: string): v is PresetName`, `presetTheme(name: PresetName): ResolvedTheme`, `emptyDefaults(): ThemeDefaults`; `buildPalette(input): Palette`, `paletteOverrides(p: Palette): Partial<Record<OverrideSlot,string>>`, `paletteFamilyStyles(p: Palette): FamilyStyles`.

- [ ] **Step 1: Write `theme/types.ts`** (types only, no test)

```ts
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
```

- [ ] **Step 2: Write the failing preset tests**

`packages/core/src/theme/presets.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/theme/presets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `presets.ts`**

```ts
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
```

- [ ] **Step 5: Run the preset tests**

Run: `bun run --cwd packages/core test -- src/theme/presets.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing palette tests**

`packages/core/src/theme/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildPalette, paletteFamilyStyles, paletteOverrides } from './palette.js';

describe('buildPalette', () => {
  it('copies only defined slots', () => {
    expect(buildPalette({ fill: '#fff', text: undefined })).toEqual({ fill: '#fff' });
  });
});

describe('paletteOverrides (spec §4.2)', () => {
  it('lowers text to N1 and N2, background to N7, nothing else', () => {
    expect(
      paletteOverrides({ text: '#111', background: '#eee', fill: '#f00', edge: '#0f0' }),
    ).toEqual({ N1: '#111', N2: '#111', N7: '#eee' });
  });
  it('is empty for an empty palette', () => {
    expect(paletteOverrides({})).toEqual({});
  });
});

describe('paletteFamilyStyles (spec §4.2)', () => {
  it('lowers fill/stroke to nodes and participants, groupFill/stroke to groups, edge to edges and messages', () => {
    expect(
      paletteFamilyStyles({
        fill: '#f7f8fe',
        stroke: '#0d32b2',
        groupFill: '#eef1fb',
        edge: '#333',
      }),
    ).toEqual({
      nodes: { fill: '#f7f8fe', stroke: '#0d32b2' },
      participants: { fill: '#f7f8fe', stroke: '#0d32b2' },
      groups: { fill: '#eef1fb', stroke: '#0d32b2' },
      edges: { stroke: '#333' },
      messages: { stroke: '#333' },
    });
  });
  it('never lowers text or background to a per-element style', () => {
    expect(paletteFamilyStyles({ text: '#111', background: '#eee' })).toEqual({
      nodes: {},
      participants: {},
      groups: {},
      edges: {},
      messages: {},
    });
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/theme/palette.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `palette.ts`**

```ts
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
```

- [ ] **Step 9: Run tests and typecheck**

Run: `bun run --cwd packages/core test -- src/theme && bun run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/theme
git commit -s -m "feat(core): theme types, presets, and palette lowering

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 3: Theme file schema, builder, and parser

**Files:**

- Create: `packages/core/src/theme/schema.ts`, `packages/core/src/theme/schema.test.ts`
- Create: `packages/core/src/theme/build.ts`, `packages/core/src/theme/build.test.ts`
- Create: `packages/core/src/theme/load.ts` (parse half; `resolveTheme` is Task 5), `packages/core/src/theme/load.test.ts`
- Modify: `packages/core/src/model/build.ts` (export `buildStyle`), `packages/core/src/parse.ts` (export `withLine` and a new `yamlErrorsToIssues`)

**Interfaces:**

- Consumes: `StyleSchema` (`../schema/style.js`), `GraphShapeSchema` (`../schema/graph.js`), `ParticipantKindSchema`, `MessageStyleSchema` (`../schema/sequence.js`), `loadYaml`/`withLine`/`yamlErrorsToIssues` (`../parse.js`), `zodErrorToIssues` (`../schema/issues.js`), Task 2's presets and palette helpers.
- Produces: `ThemeFileSchema`, `ThemeFileInput`, `generateThemeJsonSchema(): Record<string, unknown>`; `buildTheme(input: ThemeFileInput, name: string): ResolvedTheme`; `parseThemeFile(text: string, name: string): ThemeParseResult` where `ThemeParseResult = { ok: true; theme: ResolvedTheme } | { ok: false; issues: ValidationIssue[] }`.

- [ ] **Step 1: Export the two helpers the theme parser reuses**

In `packages/core/src/model/build.ts` change `function buildStyle(` to `export function buildStyle(`.

In `packages/core/src/parse.ts`, replace the `if (doc.errors.length > 0) { ... }` block inside `loadAndBuild` with a call to a new exported helper, and export `withLine`:

```ts
/** First line of each YAML parse error, with its line number, as issues. */
export function yamlErrorsToIssues(doc: Document): ValidationIssue[] {
  return doc.errors.map((error) => ({
    path: '',
    message: error.message.split('\n')[0] ?? error.message,
    ...(error.linePos?.[0]?.line !== undefined ? { line: error.linePos[0].line } : {}),
  }));
}
```

and in `loadAndBuild`:

```ts
if (doc.errors.length > 0) {
  return { ok: false, issues: yamlErrorsToIssues(doc) };
}
```

Change `function withLine(` to `export function withLine(`. Run `bun run --cwd packages/core test -- src/parse.test.ts` — still PASS.

- [ ] **Step 2: Write the failing schema tests**

`packages/core/src/theme/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ThemeFileSchema, generateThemeJsonSchema } from './schema.js';

const VALID = {
  'diagrammar-theme': 1,
  base: 'light',
  palette: { background: '#fff', fill: '#f7f8fe', text: '#0a0f25' },
  defaults: {
    nodes: { strokeWidth: 2 },
    shapes: { cylinder: { fill: '#e8f5e9' } },
    kinds: { database: { fill: '#e8f5e9' } },
    messages: { return: { dashed: true } },
  },
};

describe('ThemeFileSchema', () => {
  it('accepts the spec §4.1 example', () => {
    expect(ThemeFileSchema.safeParse(VALID).success).toBe(true);
  });
  it('requires diagrammar-theme: 1 and a preset base', () => {
    expect(ThemeFileSchema.safeParse({ base: 'light' }).success).toBe(false);
    expect(ThemeFileSchema.safeParse({ 'diagrammar-theme': 1 }).success).toBe(false);
    expect(ThemeFileSchema.safeParse({ 'diagrammar-theme': 1, base: './other.yaml' }).success).toBe(
      false,
    );
  });
  it('is strict at every level', () => {
    expect(ThemeFileSchema.safeParse({ ...VALID, extra: 1 }).success).toBe(false);
    expect(
      ThemeFileSchema.safeParse({ ...VALID, palette: { ...VALID.palette, accent: '#000' } })
        .success,
    ).toBe(false);
    expect(
      ThemeFileSchema.safeParse({ ...VALID, defaults: { shapes: { blob: {} } } }).success,
    ).toBe(false);
    expect(
      ThemeFileSchema.safeParse({ ...VALID, defaults: { nodes: { color: 'red' } } }).success,
    ).toBe(false);
  });
});

describe('generateThemeJsonSchema', () => {
  it('produces a draft 2020-12 schema whose required keys are the envelope', () => {
    const schema = generateThemeJsonSchema();
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema['required']).toEqual(['diagrammar-theme', 'base']);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/theme/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `schema.ts`**

```ts
import { z } from 'zod';
import { StyleSchema } from '../schema/style.js';
import { GraphShapeSchema } from '../schema/graph.js';
import { MessageStyleSchema, ParticipantKindSchema } from '../schema/sequence.js';
import { PRESET_NAMES } from './presets.js';

export const PresetNameSchema = z.enum(PRESET_NAMES);

export const PaletteSchema = z
  .object({
    background: z.string().optional(),
    fill: z.string().optional(),
    stroke: z.string().optional(),
    text: z.string().optional(),
    groupFill: z.string().optional(),
    edge: z.string().optional(),
  })
  .strict();

export const ThemeDefaultsSchema = z
  .object({
    nodes: StyleSchema.optional(),
    groups: StyleSchema.optional(),
    edges: StyleSchema.optional(),
    participants: StyleSchema.optional(),
    shapes: z.partialRecord(GraphShapeSchema, StyleSchema).optional(),
    kinds: z.partialRecord(ParticipantKindSchema, StyleSchema).optional(),
    messages: z.partialRecord(MessageStyleSchema, StyleSchema).optional(),
  })
  .strict();

/** Spec §4.1. `base` is a preset only — a theme file never names another file. */
export const ThemeFileSchema = z
  .object({
    'diagrammar-theme': z.literal(1),
    base: PresetNameSchema,
    palette: PaletteSchema.optional(),
    defaults: ThemeDefaultsSchema.optional(),
  })
  .strict();
export type ThemeFileInput = z.infer<typeof ThemeFileSchema>;

export function generateThemeJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ThemeFileSchema, { target: 'draft-2020-12', io: 'input' });
}
```

- [ ] **Step 5: Run the schema tests**

Run: `bun run --cwd packages/core test -- src/theme/schema.test.ts`
Expected: PASS. If `z.partialRecord` is not exported by the pinned Zod (4.6.2 has it), replace each with `z.record(<KeySchema>, StyleSchema).partial()` is NOT valid — instead use `z.object({ cylinder: StyleSchema.optional(), ... }).strict()` built from the enum's `.options`; stop and report before doing so.

- [ ] **Step 6: Write the failing builder tests**

`packages/core/src/theme/build.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTheme } from './build.js';

describe('buildTheme', () => {
  it('folds the palette under the family defaults, file defaults winning per key', () => {
    const theme = buildTheme(
      {
        'diagrammar-theme': 1,
        base: 'dark',
        palette: {
          fill: '#111',
          stroke: '#222',
          groupFill: '#333',
          edge: '#444',
          text: '#eee',
          background: '#000',
        },
        defaults: {
          nodes: { fill: '#999' },
          groups: { dashed: true },
          shapes: { cylinder: { fill: '#e8f5e9' } },
          kinds: { database: { bold: true } },
          messages: { return: { dashed: true } },
        },
      },
      './themes/x.yaml',
    );
    expect(theme.name).toBe('./themes/x.yaml');
    expect(theme.base).toBe('dark');
    expect(theme.mode).toBe('dark');
    expect(theme.d2ThemeId).toBe(200);
    expect(theme.overrides).toEqual({ N1: '#eee', N2: '#eee', N7: '#000' });
    expect(theme.palette.background).toBe('#000');
    expect(theme.defaults.nodes).toEqual({ fill: '#999', stroke: '#222' });
    expect(theme.defaults.groups).toEqual({ fill: '#333', stroke: '#222', dashed: true });
    expect(theme.defaults.edges).toEqual({ stroke: '#444' });
    expect(theme.defaults.participants).toEqual({ fill: '#111', stroke: '#222' });
    expect(theme.defaults.messages).toEqual({ stroke: '#444' });
    expect(theme.defaults.shapes).toEqual({ cylinder: { fill: '#e8f5e9' } });
    expect(theme.defaults.kinds).toEqual({ database: { bold: true } });
    expect(theme.defaults.messageStyles).toEqual({ return: { dashed: true } });
  });

  it('yields empty blocks when palette and defaults are absent', () => {
    const theme = buildTheme({ 'diagrammar-theme': 1, base: 'light' }, 'x.yaml');
    expect(theme.overrides).toEqual({});
    expect(theme.defaults.nodes).toEqual({});
    expect(theme.defaults.shapes).toEqual({});
  });

  it('never carries an undefined-valued key (exactOptionalPropertyTypes)', () => {
    const theme = buildTheme(
      { 'diagrammar-theme': 1, base: 'light', defaults: { nodes: { fill: undefined } } },
      'x.yaml',
    );
    expect(Object.keys(theme.defaults.nodes)).toEqual([]);
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/theme/build.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `build.ts`**

```ts
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
```

- [ ] **Step 9: Run the builder tests**

Run: `bun run --cwd packages/core test -- src/theme/build.test.ts`
Expected: PASS.

- [ ] **Step 10: Write the failing parser tests**

`packages/core/src/theme/load.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseThemeFile } from './load.js';

describe('parseThemeFile', () => {
  it('parses a valid theme file into a ResolvedTheme named after the reference', () => {
    const result = parseThemeFile(
      'diagrammar-theme: 1\nbase: mono\npalette:\n  fill: "#eee"\n',
      './themes/house.yaml',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.name).toBe('./themes/house.yaml');
    expect(result.theme.d2ThemeId).toBe(1);
    expect(result.theme.defaults.nodes).toEqual({ fill: '#eee' });
  });

  it('reports schema issues with the theme file’s own line numbers', () => {
    const result = parseThemeFile(
      'diagrammar-theme: 1\nbase: light\npalette:\n  accent: "#000"\n',
      'x.yaml',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([
      { path: 'palette.accent', message: 'Unrecognized key "accent"', line: 4 },
    ]);
  });

  it('reports a YAML syntax error', () => {
    const result = parseThemeFile('diagrammar-theme: 1\nbase: [\n', 'x.yaml');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.path).toBe('');
    expect(result.issues[0]?.message.length).toBeGreaterThan(0);
  });

  it('rejects a diagram file handed in as a theme', () => {
    const result = parseThemeFile('diagrammar: 1\ntype: flowchart\n', 'x.yaml');
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 11: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/theme/load.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 12: Implement the parse half of `load.ts`**

```ts
import type { ValidationIssue } from '../errors.js';
import { loadYaml, withLine, yamlErrorsToIssues } from '../parse.js';
import { zodErrorToIssues } from '../schema/issues.js';
import { buildTheme } from './build.js';
import { ThemeFileSchema } from './schema.js';
import type { ResolvedTheme } from './types.js';

export type ThemeParseResult =
  { ok: true; theme: ResolvedTheme } | { ok: false; issues: ValidationIssue[] };

/**
 * Parses and validates theme-file YAML. `name` is the reference as written
 * in the diagram and becomes `ResolvedTheme.name`. Issues carry the theme
 * file's own JSON paths and line numbers; `resolveTheme` (Task 5) prefixes
 * the file name when it turns them into an error message.
 */
export function parseThemeFile(text: string, name: string): ThemeParseResult {
  const { doc, value, lineOf } = loadYaml(text);
  if (doc.errors.length > 0) {
    return { ok: false, issues: yamlErrorsToIssues(doc) };
  }
  const parsed = ThemeFileSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: zodErrorToIssues(parsed.error, value).map((issue) => withLine(issue, lineOf)),
    };
  }
  return { ok: true, theme: buildTheme(parsed.data, name) };
}
```

- [ ] **Step 13: Run all theme tests and the typecheck**

Run: `bun run --cwd packages/core test -- src/theme src/parse.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add packages/core/src/theme packages/core/src/model/build.ts packages/core/src/parse.ts
git commit -s -m "feat(core): theme file schema, builder, and parser

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 4: Style precedence merge

**Files:**

- Create: `packages/core/src/theme/merge.ts`, `packages/core/src/theme/merge.test.ts`
- Create: `packages/core/src/theme/index.ts`

**Interfaces:**

- Consumes: `ResolvedTheme`, `presetTheme`, `buildTheme`.
- Produces: `type StyleTarget = { family: 'node'; shape: GraphShape } | { family: 'group' } | { family: 'edge' } | { family: 'participant'; kind: ParticipantKind } | { family: 'message'; messageStyle: MessageStyle }`; `mergeStyle(theme: ResolvedTheme | undefined, target: StyleTarget, own: Style | undefined): Style | undefined`. Contract: with `theme === undefined` returns `own` **by identity**; with a preset theme and `own === undefined` returns `undefined` (so untouched diagrams compile byte-identically).

- [ ] **Step 1: Write the failing tests**

`packages/core/src/theme/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildTheme } from './build.js';
import { mergeStyle } from './merge.js';
import { presetTheme } from './presets.js';

const theme = buildTheme(
  {
    'diagrammar-theme': 1,
    base: 'light',
    palette: { fill: '#pal', stroke: '#pstroke', edge: '#pedge' },
    defaults: {
      nodes: { fill: '#fam', strokeWidth: 2 },
      shapes: { cylinder: { fill: '#kind' } },
      participants: { bold: true },
      kinds: { database: { fill: '#dbkind' } },
      messages: { return: { fontColor: '#ret' } },
    },
  },
  'x.yaml',
);

describe('mergeStyle precedence (spec §4.3)', () => {
  it('returns own by identity when there is no theme', () => {
    const own = { fill: '#own' };
    expect(mergeStyle(undefined, { family: 'node', shape: 'rect' }, own)).toBe(own);
    expect(mergeStyle(undefined, { family: 'edge' }, undefined)).toBeUndefined();
  });
  it('returns undefined for a preset theme with no own style', () => {
    expect(mergeStyle(presetTheme('dark'), { family: 'group' }, undefined)).toBeUndefined();
  });
  it('own > per-kind > family (palette already folded into family)', () => {
    expect(mergeStyle(theme, { family: 'node', shape: 'rect' }, undefined)).toEqual({
      fill: '#fam',
      stroke: '#pstroke',
      strokeWidth: 2,
    });
    expect(mergeStyle(theme, { family: 'node', shape: 'cylinder' }, undefined)).toEqual({
      fill: '#kind',
      stroke: '#pstroke',
      strokeWidth: 2,
    });
    expect(mergeStyle(theme, { family: 'node', shape: 'cylinder' }, { fill: '#own' })).toEqual({
      fill: '#own',
      stroke: '#pstroke',
      strokeWidth: 2,
    });
  });
  it('resolves participants by kind and messages by message style', () => {
    expect(mergeStyle(theme, { family: 'participant', kind: 'database' }, undefined)).toEqual({
      fill: '#dbkind',
      stroke: '#pstroke',
      bold: true,
    });
    expect(mergeStyle(theme, { family: 'participant', kind: 'actor' }, undefined)).toEqual({
      fill: '#pal',
      stroke: '#pstroke',
      bold: true,
    });
    expect(
      mergeStyle(theme, { family: 'message', messageStyle: 'return' }, { dashed: true }),
    ).toEqual({
      stroke: '#pedge',
      fontColor: '#ret',
      dashed: true,
    });
    expect(mergeStyle(theme, { family: 'message', messageStyle: 'sync' }, undefined)).toEqual({
      stroke: '#pedge',
    });
  });
  it('returns undefined when every layer is empty', () => {
    const bare = buildTheme({ 'diagrammar-theme': 1, base: 'light' }, 'x.yaml');
    expect(mergeStyle(bare, { family: 'edge' }, undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/theme/merge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `merge.ts` and the barrel**

`packages/core/src/theme/merge.ts`:

```ts
import type { GraphShape, MessageStyle, ParticipantKind, Style } from '../model/types.js';
import type { ResolvedTheme } from './types.js';

export type StyleTarget =
  | { family: 'node'; shape: GraphShape }
  | { family: 'group' }
  | { family: 'edge' }
  | { family: 'participant'; kind: ParticipantKind }
  | { family: 'message'; messageStyle: MessageStyle };

/**
 * Spec §4.3, strongest first: the element's own style, its per-kind
 * default, its family default (which already carries the palette, see
 * buildTheme). Merged per key. With no theme the caller's `own` is
 * returned untouched, so existing compile output is byte-identical.
 */
export function mergeStyle(
  theme: ResolvedTheme | undefined,
  target: StyleTarget,
  own: Style | undefined,
): Style | undefined {
  if (theme === undefined) return own;
  const d = theme.defaults;
  let family: Style;
  let kind: Style | undefined;
  switch (target.family) {
    case 'node':
      family = d.nodes;
      kind = d.shapes[target.shape];
      break;
    case 'group':
      family = d.groups;
      break;
    case 'edge':
      family = d.edges;
      break;
    case 'participant':
      family = d.participants;
      kind = d.kinds[target.kind];
      break;
    case 'message':
      family = d.messages;
      kind = d.messageStyles[target.messageStyle];
      break;
  }
  const merged: Style = { ...family, ...kind, ...own };
  return Object.keys(merged).length === 0 ? undefined : merged;
}
```

`packages/core/src/theme/index.ts`:

```ts
export type {
  OverrideSlot,
  Palette,
  PresetName,
  ResolvedTheme,
  ThemeDefaults,
  ThemeMode,
} from './types.js';
export { PRESETS, PRESET_NAMES, isPresetName, presetTheme, emptyDefaults } from './presets.js';
export type { PresetSpec } from './presets.js';
export { ThemeFileSchema, generateThemeJsonSchema } from './schema.js';
export type { ThemeFileInput } from './schema.js';
export { buildTheme } from './build.js';
export { mergeStyle } from './merge.js';
export type { StyleTarget } from './merge.js';
export { parseThemeFile } from './load.js';
export type { ThemeParseResult } from './load.js';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun run --cwd packages/core test -- src/theme && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/theme
git commit -s -m "feat(core): mergeStyle encodes theme precedence

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 5: `resolveTheme` and `checkThemeRef`

**Files:**

- Modify: `packages/core/src/theme/load.ts`, `packages/core/src/theme/load.test.ts`, `packages/core/src/theme/index.ts`

**Interfaces:**

- Consumes: `AssetResolver`, `memoryResolver`, `isPathRef` (Task 1); `isPresetName`, `presetTheme`, `PRESET_NAMES` (Task 2); `parseThemeFile` (Task 3).
- Produces: `resolveTheme(ref: string, resolver: AssetResolver | undefined): Promise<ResolvedTheme>` throwing `DiagrammarError` with codes `theme_invalid` (unknown preset / bad file), `asset_resolver_missing`, and whatever the resolver throws (`asset_not_found`, `asset_outside_base`); `checkThemeRef(ref, resolver): Promise<ValidationIssue[]>` (empty when fine; otherwise one issue at path `theme`).

- [ ] **Step 1: Append the failing tests to `load.test.ts`**

```ts
import { memoryResolver } from '../assets/resolver.js';
import { checkThemeRef, resolveTheme } from './load.js';

describe('resolveTheme', () => {
  it('returns the preset for a preset name without touching the resolver', async () => {
    const theme = await resolveTheme('colorblind', undefined);
    expect(theme).toMatchObject({ name: 'colorblind', d2ThemeId: 8 });
  });
  it('rejects an unknown bare name with theme_invalid naming the presets', async () => {
    await expect(resolveTheme('neon', undefined)).rejects.toMatchObject({
      code: 'theme_invalid',
      message: expect.stringContaining('light, dark, colorblind, mono') as string,
    });
  });
  it('rejects a path reference with no resolver with asset_resolver_missing', async () => {
    await expect(resolveTheme('./themes/house.yaml', undefined)).rejects.toMatchObject({
      code: 'asset_resolver_missing',
    });
  });
  it('loads and names a theme file through the resolver', async () => {
    const resolver = memoryResolver({
      'themes/house.yaml': 'diagrammar-theme: 1\nbase: dark\npalette:\n  background: "#000"\n',
    });
    const theme = await resolveTheme('./themes/house.yaml', resolver);
    expect(theme.name).toBe('./themes/house.yaml');
    expect(theme.mode).toBe('dark');
    expect(theme.overrides).toEqual({ N7: '#000' });
  });
  it('wraps theme-file issues into theme_invalid with the file name and line', async () => {
    const resolver = memoryResolver({
      'bad.yaml': 'diagrammar-theme: 1\nbase: light\npalette:\n  accent: "#000"\n',
    });
    await expect(resolveTheme('bad.yaml', resolver)).rejects.toMatchObject({
      code: 'theme_invalid',
      message:
        'theme file "bad.yaml" is invalid: palette.accent: Unrecognized key "accent" (line 4)',
    });
  });
  it('passes resolver errors through unchanged', async () => {
    await expect(resolveTheme('missing.yaml', memoryResolver({}))).rejects.toMatchObject({
      code: 'asset_not_found',
    });
  });
});

describe('checkThemeRef', () => {
  it('returns no issues for a preset or a good file', async () => {
    expect(await checkThemeRef('light', undefined)).toEqual([]);
    const resolver = memoryResolver({ 't.yaml': 'diagrammar-theme: 1\nbase: light\n' });
    expect(await checkThemeRef('t.yaml', resolver)).toEqual([]);
  });
  it('turns a DiagrammarError into one issue at path "theme"', async () => {
    const issues = await checkThemeRef('missing.yaml', memoryResolver({}));
    expect(issues).toEqual([{ path: 'theme', message: 'asset "missing.yaml" not found' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/theme/load.test.ts`
Expected: FAIL — `resolveTheme is not a function` (or not exported).

- [ ] **Step 3: Add `resolveTheme` and `checkThemeRef` to `load.ts`**

Append these imports at the top of `load.ts`:

```ts
import { isPathRef } from '../assets/paths.js';
import type { AssetResolver } from '../assets/resolver.js';
import { DiagrammarError } from '../errors.js';
import { PRESET_NAMES, isPresetName, presetTheme } from './presets.js';
```

and these functions at the bottom:

```ts
function formatIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => {
      const location = issue.line !== undefined ? ` (line ${issue.line})` : '';
      const path = issue.path.length > 0 ? `${issue.path}: ` : '';
      return `${path}${issue.message}${location}`;
    })
    .join('; ');
}

/**
 * Resolves a `theme:` reference (spec §3.1): a preset name from the table,
 * or a relative path read through `resolver`, parsed and validated. Every
 * failure is a `DiagrammarError`; see spec §6.3 for the codes.
 */
export async function resolveTheme(
  ref: string,
  resolver: AssetResolver | undefined,
): Promise<ResolvedTheme> {
  if (isPresetName(ref)) return presetTheme(ref);
  if (!isPathRef(ref)) {
    throw new DiagrammarError(
      `unknown theme "${ref}": expected one of ${PRESET_NAMES.join(', ')} or a relative path to a .yaml theme file`,
      'theme_invalid',
    );
  }
  if (resolver === undefined) {
    throw new DiagrammarError(
      `theme "${ref}" is a file reference but no asset resolver was supplied; pass RenderOptions.resolver (e.g. fileResolver(dirname(file)))`,
      'asset_resolver_missing',
    );
  }
  const bytes = await resolver.read(ref);
  const result = parseThemeFile(new TextDecoder().decode(bytes), ref);
  if (!result.ok) {
    throw new DiagrammarError(
      `theme file "${ref}" is invalid: ${formatIssues(result.issues)}`,
      'theme_invalid',
    );
  }
  return result.theme;
}

/**
 * `validate()` is synchronous and only checks a theme reference's syntax;
 * this is the async existence/content check the CLI and MCP run after it
 * (spec §6.3). Non-Diagrammar errors (I/O faults) propagate.
 */
export async function checkThemeRef(
  ref: string,
  resolver: AssetResolver | undefined,
): Promise<ValidationIssue[]> {
  try {
    await resolveTheme(ref, resolver);
    return [];
  } catch (error) {
    if (error instanceof DiagrammarError) {
      return [{ path: 'theme', message: error.message }];
    }
    throw error;
  }
}
```

Add to `theme/index.ts`: `export { parseThemeFile, resolveTheme, checkThemeRef } from './load.js';` (replacing the existing `parseThemeFile` line).

- [ ] **Step 4: Run tests and typecheck**

Run: `bun run --cwd packages/core test -- src/theme && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/theme
git commit -s -m "feat(core): resolveTheme and checkThemeRef

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 6: Compile with a resolved theme

**Files:**

- Modify: `packages/core/src/compile/style.ts`, `packages/core/src/compile/style.test.ts`, `packages/core/src/compile/graph.ts`, `packages/core/src/compile/sequence.ts`, `packages/core/src/compile/index.ts`, `packages/core/src/compile/index.test.ts`

**Interfaces:**

- Consumes: `mergeStyle`, `StyleTarget`, `ResolvedTheme`, `OverrideSlot`, `buildTheme`, `presetTheme`.
- Produces: `themeOverrideLines(overrides: Partial<Record<OverrideSlot,string>>): string[]` (order N1, N2, N7); `compile(model, view?, theme?: ResolvedTheme): CompileResult`; `compileGraph(model, view?, theme?)`; `compileSequence(model, view?, theme?)`. With `theme` omitted or a preset, output is byte-identical to today.

- [ ] **Step 1: Write the failing override-lines test**

Append to `packages/core/src/compile/style.test.ts`:

```ts
import { themeOverrideLines } from './style.js';

describe('themeOverrideLines', () => {
  it('emits N1, N2, N7 in that fixed order, quoted', () => {
    expect(themeOverrideLines({ N7: '#fff', N1: '#111', N2: '#222' })).toEqual([
      'N1: "#111"',
      'N2: "#222"',
      'N7: "#fff"',
    ]);
  });
  it('emits nothing for an empty map', () => {
    expect(themeOverrideLines({})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/compile/style.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Add `themeOverrideLines` to `style.ts`**

```ts
import type { OverrideSlot } from '../theme/types.js';

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
```

Run the style tests → PASS.

- [ ] **Step 4: Write the failing compile tests**

Append to `packages/core/src/compile/index.test.ts` (it already imports `compile` and `parse`; add `buildTheme`/`presetTheme` imports from `../theme/index.js`):

```ts
const THEME = buildTheme(
  {
    'diagrammar-theme': 1,
    base: 'light',
    palette: { background: '#fafafa', text: '#101010', edge: '#333333' },
    defaults: {
      shapes: { cylinder: { fill: '#e8f5e9' } },
      messages: { return: { fontColor: '#777' } },
    },
  },
  './house.yaml',
);

describe('compile with a theme', () => {
  const graphYaml =
    'diagrammar: 1\ntype: architecture\nnodes:\n  - { id: db, shape: cylinder }\n  - { id: api, style: { fill: "#own" } }\nedges:\n  - { from: api, to: db }\n';
  const seqYaml =
    'diagrammar: 1\ntype: sequence\nparticipants:\n  - { id: a }\n  - { id: b }\nmessages:\n  - { from: a, to: b, style: return }\n';

  it('is byte-identical to no theme when given a preset', () => {
    const p = parse(graphYaml);
    if (!p.ok) throw new Error('fixture');
    expect(compile(p.diagram, undefined, presetTheme('light')).d2).toBe(compile(p.diagram).d2);
  });

  it('emits theme-overrides inside d2-config for a graph and applies per-shape defaults', () => {
    const p = parse(graphYaml);
    if (!p.ok) throw new Error('fixture');
    const { d2 } = compile(p.diagram, undefined, THEME);
    expect(d2).toContain(
      'vars: {\n  d2-config: {\n    layout-engine: tala\n    theme-overrides: {\n      N1: "#101010"\n      N2: "#101010"\n      N7: "#fafafa"\n    }\n  }\n}',
    );
    expect(d2).toContain('"db": {\n  shape: cylinder\n  label: "db"\n  style.fill: "#e8f5e9"\n}');
    expect(d2).toContain('"api": {\n  shape: rectangle\n  label: "api"\n  style.fill: "#own"\n}');
    expect(d2).toContain('"api" -> "db": {\n  style.stroke: "#333333"\n}');
  });

  it('emits a vars block before seq for a sequence diagram and themes messages', () => {
    const p = parse(seqYaml);
    if (!p.ok) throw new Error('fixture');
    const { d2 } = compile(p.diagram, undefined, THEME);
    expect(
      d2.startsWith('vars: {\n  d2-config: {\n    theme-overrides: {\n      N1: "#101010"'),
    ).toBe(true);
    expect(d2).toContain(
      '  "a" -> "b": {\n    style.stroke: "#333333"\n    style.stroke-dash: 3\n    style.font-color: "#777"\n    target-arrowhead: {\n      shape: arrow\n    }\n  }',
    );
  });

  it('keeps view dimming last, after the arrowhead block, for a themed dimmed return message', () => {
    const p = parse(seqYaml + 'views:\n  - { id: v, focus: [a] }\n');
    if (!p.ok) throw new Error('fixture');
    const { d2 } = compile(p.diagram, 'v', THEME);
    expect(d2).toContain(
      '    target-arrowhead: {\n      shape: arrow\n    }\n    style.opacity: 0.25\n  }',
    );
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/compile/index.test.ts`
Expected: FAIL — `compile` ignores the third argument.

- [ ] **Step 6: Thread the theme through `graph.ts`**

In `compileGraph`, change the signature to `export function compileGraph(model: GraphDiagram, view?: ViewModel, theme?: ResolvedTheme): string`, import `mergeStyle` from `'../theme/merge.js'`, `themeOverrideLines` from `'./style.js'`, and `type { ResolvedTheme } from '../theme/types.js'`. Replace the `vars` block emission with:

```ts
lines.push('vars: {');
lines.push('  d2-config: {');
lines.push(`    layout-engine: ${model.layout}`);
const overrides = themeOverrideLines(theme?.overrides ?? {});
if (overrides.length > 0) {
  lines.push('    theme-overrides: {');
  for (const l of overrides) lines.push(`      ${l}`);
  lines.push('    }');
}
lines.push('  }');
lines.push('}');
```

and the three `styleLines(...)` calls with:

```ts
styleLines(mergeStyle(theme, { family: 'group' }, group.style), dim);
styleLines(mergeStyle(theme, { family: 'node', shape: node.shape }, node.style), dim);
styleLines(mergeStyle(theme, { family: 'edge' }, edge.style), dim);
```

- [ ] **Step 7: Thread the theme through `sequence.ts`**

Replace `messageExtraLines` with:

```ts
/**
 * A message's own semantics (`async`/`return` are dashed) are its "own
 * style" for precedence purposes. `styleLines` appends the dim line last;
 * it is pulled off and re-appended after the arrowhead block so a dimmed
 * return message keeps today's exact line order (sequence-view.d2 fixture).
 */
function messageExtraLines(
  style: MessageStyle,
  dim: boolean,
  theme: ResolvedTheme | undefined,
): string[] {
  const own: Style | undefined = style === 'sync' ? undefined : { dashed: true };
  const merged = mergeStyle(theme, { family: 'message', messageStyle: style }, own);
  const lines = styleLines(merged, dim);
  const dimLine = dim ? lines.pop() : undefined;
  if (style === 'return') lines.push('target-arrowhead: {', '  shape: arrow', '}');
  if (dimLine !== undefined) lines.push(dimLine);
  return lines;
}
```

Add `theme: ResolvedTheme | undefined` as the last parameter of `emitMessage`, `emitFragment`, and `emitItems`, passing it through every call; `emitMessage` calls `messageExtraLines(msg.style, dim, theme)`. Change `compileSequence` to `(model: SequenceDiagram, view?: ViewModel, theme?: ResolvedTheme)`; at the very start of its body (before `lines.push('seq: {')`):

```ts
const overrides = themeOverrideLines(theme?.overrides ?? {});
if (overrides.length > 0) {
  lines.push('vars: {', '  d2-config: {', '    theme-overrides: {');
  for (const l of overrides) lines.push(`      ${l}`);
  lines.push('    }', '  }', '}', '');
}
```

Participants: `styleLines(mergeStyle(theme, { family: 'participant', kind: p.participantKind }, p.style), dim)`. Add imports: `mergeStyle`, `themeOverrideLines`, `type ResolvedTheme`, `type Style`. Remove `DIM_OPACITY_LINE` from the import only if it is no longer referenced (`emitFragment` still uses it).

- [ ] **Step 8: Thread the theme through `compile/index.ts`**

```ts
export function compile(model: Diagram, view?: string, theme?: ResolvedTheme): CompileResult {
  pairNextIndex.delete(model);
  const viewModel = findView(model, view);
  const d2 =
    model.type === 'sequence'
      ? compileSequence(model, viewModel, theme)
      : compileGraph(model, viewModel, theme);
  return { d2, keyMap: buildKeyMap(model) };
}
```

with `import type { ResolvedTheme } from '../theme/types.js';`.

- [ ] **Step 9: Run the compile suite, then the whole core suite**

Run: `bun run --cwd packages/core test -- src/compile && bun run --cwd packages/core test`
Expected: PASS, including every `test/fixtures/compile/*.d2` exact-text comparison.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/compile
git commit -s -m "feat(core): compile folds theme defaults and overrides into D2

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 7: Engine, overlay, and render take the resolved theme; public exports

**Files:**

- Modify: `packages/core/src/engine/types.ts`, `packages/core/src/engine/D2Engine.ts`, `packages/core/src/engine/index.ts`, `packages/core/src/engine/D2Engine.test.ts`, `packages/core/src/engine/D2Engine.coverage.test.ts`
- Modify: `packages/core/src/overlay/types.ts`, `packages/core/src/overlay/theme.ts`, `packages/core/src/overlay/theme.test.ts` (create if absent), `packages/core/src/overlay/callouts.test.ts`, `packages/core/src/overlay/index.integration.test.ts`, any other overlay test that builds `OverlayOptions`
- Modify: `packages/core/src/render.ts`, `packages/core/src/render.test.ts`, `packages/core/src/index.ts`, `packages/core/src/publicApi.test.ts`

**Interfaces:**

- Consumes: `ResolvedTheme`, `presetTheme`, `resolveTheme`.
- Produces: `EngineOptions { layout: LayoutEngine; themeId: number }` (the `Theme` re-export leaves `engine/types.ts` and `engine/index.ts`); `OverlayOptions.theme: ResolvedTheme`; `tokensFor(theme: ResolvedTheme): ThemeTokens` (canvas = `theme.palette.background` when set); `RenderOptions.theme?: string` (preset name or theme path, resolved exactly like the file's own `theme:`), `RenderOptions.resolver?: AssetResolver`; public exports: `fileResolver`, `memoryResolver`, `isPathRef`, `normalizeRelativePath`, `type AssetResolver`, `PRESETS`, `PRESET_NAMES`, `isPresetName`, `presetTheme`, `resolveTheme`, `checkThemeRef`, `parseThemeFile`, `mergeStyle`, `buildTheme`, `ThemeFileSchema`, `generateThemeJsonSchema`, and the theme types. This task is one unit because the engine/overlay contract change and the `render()` rewrite must land together for `tsc -b` to stay green.

- [ ] **Step 1: Write the failing overlay token test**

`packages/core/src/overlay/theme.test.ts` (create, or append if it exists):

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/overlay/theme.test.ts`
Expected: FAIL — type/argument mismatch (`tokensFor` expects a string).

- [ ] **Step 3: Change the engine and overlay contracts**

`packages/core/src/engine/types.ts`: remove the `Theme` import/re-export; change `EngineOptions` to:

```ts
export interface EngineOptions {
  layout: LayoutEngine;
  /** D2 built-in theme id (`ResolvedTheme.d2ThemeId`). */
  themeId: number;
}
```

`packages/core/src/engine/index.ts`: drop `Theme` from the type export list.

`packages/core/src/engine/D2Engine.ts`: delete `const THEME_ID: Record<Theme, number> = { light: 0, dark: 200 };` and the `Theme` import; in `d2.compile(...)` use `themeID: opts.themeId,`.

`packages/core/src/overlay/types.ts`: `theme: ResolvedTheme;` with `import type { ResolvedTheme } from '../theme/types.js';` (drop the `Theme` import if now unused).

`packages/core/src/overlay/theme.ts`:

```ts
import type { ResolvedTheme } from '../theme/types.js';
import type { ThemeTokens } from './types.js';
// ... LIGHT_TOKENS / DARK_TOKENS unchanged ...

/** Light/dark token set by `mode`; the canvas follows the palette's `background` (spec §4.2). */
export function tokensFor(theme: ResolvedTheme): ThemeTokens {
  const base = theme.mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  return theme.palette.background !== undefined
    ? { ...base, canvas: theme.palette.background }
    : base;
}
```

- [ ] **Step 4: Update the engine and overlay tests**

Engine tests: in `D2Engine.test.ts` and `D2Engine.coverage.test.ts` replace every `theme: 'light'` with `themeId: 0` and every `theme: 'dark'` with `themeId: 200`:

```bash
sed -i '' "s/theme: 'light'/themeId: 0/g; s/theme: 'dark'/themeId: 200/g" packages/core/src/engine/D2Engine.test.ts packages/core/src/engine/D2Engine.coverage.test.ts
```

Overlay tests: `grep -rn "theme:" packages/core/src/overlay/*.test.ts`. Replace literal `theme: 'light'` with `theme: presetTheme('light')` (import `presetTheme` from `'../theme/index.js'`), and `theme: model.theme` with `theme: await resolveTheme(model.theme, undefined)` (import `resolveTheme`; the enclosing functions in `index.integration.test.ts` are already async — if one is not, make it async).

- [ ] **Step 5: Run engine + overlay suites and typecheck**

Run: `bun run --cwd packages/core test -- src/engine src/overlay && bun run typecheck`
Expected: PASS for the two suites. `bun run typecheck` reports only `render.ts` at this point — the next steps fix it; do not commit yet.

- [ ] **Step 6: Write the failing render tests**

Append to `packages/core/src/render.test.ts`:

```ts
import { memoryResolver } from './assets/resolver.js';

const HOUSE =
  'diagrammar-theme: 1\nbase: light\npalette:\n  background: "#123456"\n  fill: "#abcdef"\n';
const DARK_HOUSE = 'diagrammar-theme: 1\nbase: dark\npalette:\n  background: "#0b0b0b"\n';

describe('render with themes', () => {
  it('fails with asset_resolver_missing when a theme path is used without a resolver', async () => {
    await expect(
      render(fixture, { format: 'svg', theme: './themes/house.yaml' }),
    ).rejects.toMatchObject({
      code: 'asset_resolver_missing',
    });
  }, 30000);

  it('applies a theme file through the resolver: palette colours reach the SVG', async () => {
    const resolver = memoryResolver({ 'themes/house.yaml': HOUSE });
    const result = await render(fixture, { format: 'svg', theme: './themes/house.yaml', resolver });
    expect(result.svg).toContain('#123456');
    expect(result.svg).toContain('#abcdef');
  }, 30000);

  it('a dark-based theme file uses the dark D2 theme and the overridden background', async () => {
    const resolver = memoryResolver({ 'themes/dark.yaml': DARK_HOUSE });
    const result = await render(fixture, { format: 'svg', theme: './themes/dark.yaml', resolver });
    expect(result.svg).toContain('#0b0b0b');
    expect(result.svg).not.toContain('#1E1E2E'); // D2 dark background replaced by the palette
    expect(result.svg).toContain('#CDD6F4'); // D2 dark-theme text colour still present
  }, 30000);

  it('opts.theme accepts any preset and changes the output', async () => {
    const light = await render(fixture, { format: 'svg' });
    const cb = await render(fixture, { format: 'svg', theme: 'colorblind' });
    expect(cb.svg).not.toBe(light.svg);
  }, 30000);

  it('rejects an unknown preset with theme_invalid', async () => {
    await expect(render(fixture, { format: 'svg', theme: 'neon' })).rejects.toMatchObject({
      code: 'theme_invalid',
    });
  }, 30000);

  it('is deterministic with a theme file', async () => {
    const resolver = memoryResolver({ 'themes/house.yaml': HOUSE });
    const a = await render(fixture, { format: 'png', theme: './themes/house.yaml', resolver });
    const b = await render(fixture, { format: 'png', theme: './themes/house.yaml', resolver });
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  }, 30000);
});
```

- [ ] **Step 7: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/render.test.ts`
Expected: FAIL (typecheck error on `resolver`/`theme`, or the theme path is passed straight to the engine).

- [ ] **Step 8: Rewrite the theme handling in `render.ts`**

Replace the imports of `Theme`/`LayoutEngine` and the body of `render` so it reads:

```ts
import type { AssetResolver } from './assets/resolver.js';
import { resolveTheme } from './theme/load.js';
import type { LayoutEngine } from './model/types.js';

export interface RenderOptions {
  /** Output format, default `png`. */
  format?: 'png' | 'svg';
  /** ID of a view to focus; others dimmed. */
  view?: string;
  /** Raster scale factor for PNG, 1 or 2, default 1. */
  scale?: 1 | 2;
  /**
   * Overrides the document's `theme:`. A preset name or a relative theme
   * path, resolved exactly like the file's own value (spec §3.1).
   */
  theme?: string;
  /**
   * Supplies theme files (and, in a later release, icons) named by relative
   * path. Required whenever the document or `theme` uses the path form;
   * `fileResolver(dirname(file))` is the usual choice. See spec §6.
   */
  resolver?: AssetResolver;
  /** Draw the callout legend, default true. */
  legend?: boolean;
  /** Include the compiled D2 text in the result. */
  emitD2?: boolean;
}
```

and inside `render`:

```ts
const format = opts.format ?? 'png';
const theme = await resolveTheme(opts.theme ?? model.theme, opts.resolver);
const layout: LayoutEngine = model.layout;
const legend = opts.legend ?? true;

const { d2 } = compile(model, opts.view, theme);
const { svg, laidOut } = await compileAndRender(d2, { layout, themeId: theme.d2ThemeId });
```

(the `applyOverlay` call already passes `{ theme, legend, ...view }` — `theme` is now the `ResolvedTheme`). Extend the doc comment's error list with: `theme_invalid`, `asset_resolver_missing`, `asset_not_found`, `asset_outside_base` (all thrown by `resolveTheme` before the engine runs).

- [ ] **Step 9: Export the new surface from `index.ts`**

Add after the `validate` exports:

```ts
export { fileResolver, memoryResolver, isPathRef, normalizeRelativePath } from './assets/index.js';
export type { AssetResolver, FileResolverOptions } from './assets/index.js';
export {
  PRESETS,
  PRESET_NAMES,
  isPresetName,
  presetTheme,
  buildTheme,
  mergeStyle,
  parseThemeFile,
  resolveTheme,
  checkThemeRef,
  ThemeFileSchema,
  generateThemeJsonSchema,
} from './theme/index.js';
export type {
  PresetName,
  PresetSpec,
  ThemeMode,
  OverrideSlot,
  Palette,
  ThemeDefaults,
  ResolvedTheme,
  ThemeFileInput,
  ThemeParseResult,
  StyleTarget,
} from './theme/index.js';
```

Append to `publicApi.test.ts`:

```ts
it('exports the theme and asset-resolver surface', () => {
  expect(core.PRESET_NAMES).toEqual(['light', 'dark', 'colorblind', 'mono']);
  expect(typeof core.fileResolver).toBe('function');
  expect(typeof core.memoryResolver).toBe('function');
  expect(typeof core.resolveTheme).toBe('function');
  expect(typeof core.checkThemeRef).toBe('function');
  expect(typeof core.generateThemeJsonSchema).toBe('function');
});
```

- [ ] **Step 10: Run the core suite, typecheck, and build**

Run: `bun run --cwd packages/core test && bun run typecheck && bun run build`
Expected: PASS; build succeeds (later packages compile against `dist/*.d.mts`).

- [ ] **Step 11: Commit**

```bash
git add packages/core/src
git commit -s -m "feat(core): engine, overlay, and render take the resolved theme

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 8: Format changes — `theme:` accepts presets and paths

**Files:**

- Modify: `packages/core/src/render.test.ts`, `packages/core/src/model/types.ts`, `packages/core/src/schema/envelope.ts`, `packages/core/src/schema/envelope.test.ts`, `packages/core/src/model/semantic.ts`, `packages/core/src/model/semantic.test.ts`, `packages/core/src/document/ops.ts`, `packages/core/src/document/describe.ts`, `packages/core/src/document/describe.test.ts`, `packages/core/src/schema/json-schema.ts`, `packages/core/src/schema/json-schema.test.ts`, `packages/core/scripts/generate-schema.ts`
- Generate: `packages/core/schema/diagrammar-v1.json` (changes: `theme` becomes a string), `packages/core/schema/diagrammar-theme-v1.json` (new)

**Interfaces:**

- Consumes: `isPresetName`, `PRESET_NAMES` (`../theme/presets.js`), `isPathRef`, `normalizeRelativePath` (`../assets/paths.js`), `generateThemeJsonSchema` (`../theme/schema.js`).
- Produces: `model/types.ts` `export type Theme = string;` (doc: preset name or relative path, as written); `DiagramBase.theme: Theme` unchanged in name; semantic rule 10; `Description.theme?: string`; `SetMetaOp.patch.theme?: string`.

- [ ] **Step 1: Write the failing envelope tests**

Append to `packages/core/src/schema/envelope.test.ts` (keep existing tests; if one asserts that `theme: colorblind` or a path is _rejected_, delete that assertion):

```ts
import { ThemeSchema } from './envelope.js';

describe('ThemeSchema (spec §3.1)', () => {
  it.each(['light', 'dark', 'colorblind', 'mono'])('accepts preset %s', (name) => {
    expect(ThemeSchema.safeParse(name).success).toBe(true);
  });
  it.each(['./themes/house.yaml', 'house.yml', '../shared/t.yaml'])('accepts path %s', (p) => {
    expect(ThemeSchema.safeParse(p).success).toBe(true);
  });
  it('rejects an unknown bare name with a message naming the presets', () => {
    const result = ThemeSchema.safeParse('neon');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toContain('light, dark, colorblind, mono');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/schema/envelope.test.ts`
Expected: FAIL — `colorblind`, paths rejected by the current enum.

- [ ] **Step 3: Widen the model type and the envelope schema**

`packages/core/src/model/types.ts` — replace `export type Theme = 'light' | 'dark';` with:

```ts
/**
 * A theme *reference* exactly as written in the file: a preset name
 * (`light`, `dark`, `colorblind`, `mono`) or a relative path to a theme
 * file (spec §3.1). Resolution to a `ResolvedTheme` happens in `render()`.
 */
export type Theme = string;
```

`packages/core/src/schema/envelope.ts` — replace the `THEMES`/`ThemeSchema` lines with:

```ts
import { isPathRef } from '../assets/paths.js';
import { PRESET_NAMES, isPresetName } from '../theme/presets.js';

/** Spec §3.1: a preset name, or anything containing `/` or ending in .yaml/.yml. */
export const ThemeSchema = z.string().refine((value) => isPresetName(value) || isPathRef(value), {
  message: `theme must be one of ${PRESET_NAMES.join(', ')} or a relative path to a .yaml theme file`,
});
```

(remove the now-unused `Theme` import from the type-only import line if TypeScript flags it).

- [ ] **Step 4: Run envelope tests**

Run: `bun run --cwd packages/core test -- src/schema/envelope.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing semantic-rule test**

Append to `packages/core/src/model/semantic.test.ts` (use the file's existing helper that parses YAML text into issues; if it builds models by hand, add a `theme` field to the fixture):

```ts
import { parse } from '../parse.js';

describe('rule 10: theme path form is a well-formed relative path', () => {
  it('accepts a preset and a relative path, including a leading ..', () => {
    expect(parse('diagrammar: 1\ntype: flowchart\ntheme: mono\n').ok).toBe(true);
    expect(parse('diagrammar: 1\ntype: flowchart\ntheme: ../t/house.yaml\n').ok).toBe(true);
  });
  it('rejects an absolute path at path "theme"', () => {
    const result = parse('diagrammar: 1\ntype: flowchart\ntheme: /etc/house.yaml\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toMatchObject({ path: 'theme', line: 3 });
  });
  it('rejects a backslash path', () => {
    expect(parse('diagrammar: 1\ntype: flowchart\ntheme: "themes\\\\house.yaml"\n').ok).toBe(false);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `bun run --cwd packages/core test -- src/model/semantic.test.ts`
Expected: FAIL — the absolute-path case currently parses OK.

- [ ] **Step 7: Add rule 10 to `semantic.ts`**

Add imports:

```ts
import { normalizeRelativePath } from '../assets/paths.js';
import { isPresetName } from '../theme/presets.js';
```

Add `...checkThemePath(diagram),` to the initial `issues` array in `runSemanticRules` (after `checkDuplicateCalloutNumbers`), and the rule:

```ts
// --- Rule 10: a path-form theme is a well-formed relative path -------------

/**
 * Syntax only (spec §6.1): the schema already guarantees a path form looks
 * like a path; this rejects absolute paths, drive letters, backslashes and
 * null bytes. Whether the file exists is `checkThemeRef`'s job, because it
 * needs an asset resolver and parsing stays synchronous.
 */
function checkThemePath(diagram: Diagram): ValidationIssue[] {
  if (isPresetName(diagram.theme)) return [];
  try {
    normalizeRelativePath(diagram.theme);
    return [];
  } catch (error) {
    return [{ path: 'theme', message: error instanceof Error ? error.message : String(error) }];
  }
}
```

- [ ] **Step 8: Run the semantic tests**

Run: `bun run --cwd packages/core test -- src/model/semantic.test.ts`
Expected: PASS.

- [ ] **Step 9: Widen `setMeta` and `describe()`**

`packages/core/src/document/ops.ts` line ~390: replace `theme: z.enum(['light', 'dark']).optional(),` with `theme: ThemeSchema.optional(),` and add `import { ThemeSchema } from '../schema/envelope.js';`. The `SetMetaOp.patch.theme?: Theme` type is now `string` automatically.

`packages/core/src/document/describe.ts`: delete `const THEMES = ['light', 'dark'] as const;` and in `readPartialMeta` replace `theme: oneOf(THEMES, record.theme),` with `theme: typeof record.theme === 'string' ? record.theme : undefined,`. `Description.theme?: Theme` stays (it is `string` now).

In `packages/core/src/document/describe.test.ts` around line 207–210, the invalid-file test asserts `result.theme` is `undefined` for `theme: neon`; change that expectation to `expect(result.theme).toBe('neon');` and update its title to say the raw string is echoed (the enum narrowing was removed because `theme` is a free reference now). Run: `bun run --cwd packages/core test -- src/document` → PASS.

- [ ] **Step 10: Generate both JSON schemas and guard drift**

`packages/core/src/schema/json-schema.ts` — add:

```ts
export { generateThemeJsonSchema } from '../theme/schema.js';
```

`packages/core/scripts/generate-schema.ts` — replace the body after `const here = ...` with:

```ts
import { generateJsonSchema, generateThemeJsonSchema } from '../src/schema/json-schema.js';

const schemaDir = join(here, '..', 'schema');
mkdirSync(schemaDir, { recursive: true });
const outputs: Array<[string, Record<string, unknown>]> = [
  ['diagrammar-v1.json', generateJsonSchema()],
  ['diagrammar-theme-v1.json', generateThemeJsonSchema()],
];
for (const [file, schema] of outputs) {
  const outPath = join(schemaDir, file);
  writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}
```

Append to `packages/core/src/schema/json-schema.test.ts`:

```ts
import { generateThemeJsonSchema } from './json-schema.js';

describe('committed schema/diagrammar-theme-v1.json', () => {
  it('matches a fresh generation (no drift)', () => {
    const committed = readFileSync(
      join(here, '..', '..', 'schema', 'diagrammar-theme-v1.json'),
      'utf8',
    );
    const fresh = `${JSON.stringify(generateThemeJsonSchema(), null, 2)}\n`;
    expect(committed).toBe(fresh);
  });
});
```

Run: `bun run schema:generate && git diff --stat packages/core/schema` — expect `diagrammar-v1.json` modified (theme enum → string) and `diagrammar-theme-v1.json` new.

- [ ] **Step 11: Add the in-file theme-path render tests**

Append to `packages/core/src/render.test.ts` (the `memoryResolver` import and `HOUSE` constant exist from the previous task):

```ts
const THEMED = `diagrammar: 1
type: flowchart
theme: ./themes/house.yaml
nodes:
  - { id: a }
  - { id: b }
edges:
  - { from: a, to: b }
`;

describe('render with an in-file theme path', () => {
  it('fails with asset_resolver_missing when no resolver is supplied', async () => {
    await expect(render(THEMED, { format: 'svg' })).rejects.toMatchObject({
      code: 'asset_resolver_missing',
    });
  }, 30000);

  it('resolves the file’s own theme: path through the resolver', async () => {
    const resolver = memoryResolver({ 'themes/house.yaml': HOUSE });
    const result = await render(THEMED, { format: 'svg', resolver });
    expect(result.svg).toContain('#123456');
  }, 30000);

  it('opts.theme wins over the file’s theme:', async () => {
    const resolver = memoryResolver({ 'themes/house.yaml': HOUSE });
    const result = await render(THEMED, { format: 'svg', resolver, theme: 'mono' });
    expect(result.svg).not.toContain('#123456');
  }, 30000);
});
```

Run: `bun run --cwd packages/core test -- src/render.test.ts` → PASS.

- [ ] **Step 12: Run the whole core suite and typecheck**

Run: `bun run --cwd packages/core test && bun run typecheck`
Expected: PASS. Fixtures under `packages/core/test/fixtures` are unaffected (they use presets or no theme).

- [ ] **Step 13: Commit**

```bash
git add packages/core/src packages/core/schema packages/core/scripts
git commit -s -m "feat(core): theme accepts presets and relative theme-file paths

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 9: Themed example and goldens

**Files:**

- Create: `examples/themes/house.yaml`, `examples/themed.yaml`
- Generate: `examples/goldens/themed.svg`, `examples/goldens/themed.png`, `examples/goldens/themed.md`
- Modify: `examples/goldens.test.ts`, `examples/examples.test.ts`, `scripts/goldens-update.ts`

**Interfaces:**

- Consumes: `fileResolver` from `@noblecloak/diagrammar-core`.
- Produces: the themed golden the four-cell CI matrix compares.

- [ ] **Step 1: Add the theme file and the diagram**

`examples/themes/house.yaml`:

```yaml
diagrammar-theme: 1
base: light
palette:
  background: '#f6f3ee'
  fill: '#fffdf8'
  stroke: '#4a3f35'
  text: '#2b2520'
  groupFill: '#efe8dc'
  edge: '#8c5a2b'
defaults:
  nodes:
    strokeWidth: 2
  groups:
    dashed: true
  shapes:
    cylinder: { fill: '#e6efe3' }
    queue: { fill: '#fbe9d0' }
    person: { fill: '#e9e3f5' }
```

`examples/themed.yaml`:

```yaml
diagrammar: 1
type: architecture
title: Order platform (house theme)
theme: ./themes/house.yaml
direction: right

groups:
  - id: edge
    label: Edge
  - id: platform
    label: Platform
  - id: data
    label: Data

nodes:
  - id: client
    label: Web client
    shape: person
    in: edge
  - id: gateway
    label: API gateway
    shape: cloud
    in: edge
  - id: orders
    label: Order service
    shape: rect
    in: platform
    style: { fill: '#fff3cd' }
  - id: queue
    label: Fulfilment queue
    shape: queue
    in: platform
  - id: db
    label: Orders database
    shape: cylinder
    in: data

edges:
  - { from: client, to: gateway, label: 'HTTPS' }
  - { from: gateway, to: orders, label: 'gRPC' }
  - { from: orders, to: queue, label: 'publish' }
  - { from: orders, to: db, label: 'read/write', style: { dashed: true } }
```

- [ ] **Step 2: Teach the golden test and updater to pass a resolver**

`examples/goldens.test.ts`: import `fileResolver` alongside `render`; add `const resolver = fileResolver(examplesDir);`; add `'themed'` to `STEMS`; pass `resolver` in **every** `render(...)` call in the file (`{ format: 'svg', resolver }` etc.). A resolver on the preset-themed examples is inert, so their goldens do not move.

`scripts/goldens-update.ts`: same — import `fileResolver`, `const resolver = fileResolver(examplesDir);`, add `resolver` to every `render` call. `readdir(examplesDir)` is non-recursive, so `themes/house.yaml` is not mistaken for an example.

`examples/examples.test.ts`: add `'themed.yaml'` to `EXAMPLES` and this case to the second suite:

```ts
it('themed.yaml references the house theme by relative path and has 5 nodes', () => {
  const result = parse(loadExample('themed.yaml'));
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.diagram.theme).toBe('./themes/house.yaml');
  if (result.diagram.type === 'sequence') throw new Error('expected a graph diagram');
  expect(result.diagram.nodes).toHaveLength(5);
});
```

- [ ] **Step 3: Run the golden test to see the missing-golden failure, then generate**

Run: `bun run --cwd examples test` → FAIL on `themed` (no golden files).
Run: `bun run goldens:update` → prints `updated goldens for themed.yaml` and leaves the other goldens untouched (`git status --short examples/goldens` must list only the three new `themed.*` files).

- [ ] **Step 4: Look at the render and verify the theme took**

Run: `grep -c '#f6f3ee' examples/goldens/themed.svg` → at least 1 (canvas), and `grep -c '#e6efe3' examples/goldens/themed.svg` → at least 1 (cylinder). Open `examples/goldens/themed.png` (Read tool) and confirm: warm off-white background, brown edges, the Order service node yellow (its own `style` wins), the database green, dashed group borders.

- [ ] **Step 5: Run the example and determinism suites three times**

Run: `for i in 1 2 3; do bun run --cwd examples test || exit 1; done`
Expected: PASS every time (byte-identical goldens across runs).

- [ ] **Step 6: Commit**

```bash
git add examples scripts/goldens-update.ts
git commit -s -m "test(examples): themed golden with a house theme file

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 10: CLI — resolver on render, theme check on validate, `themes list`

**Files:**

- Modify: `packages/cli/src/commands/render.ts`, `packages/cli/src/commands/render.test.ts`, `packages/cli/src/commands/validate.ts`, `packages/cli/src/commands/validate.test.ts`, `packages/cli/src/main.ts`, `packages/cli/src/main.test.ts`
- Create: `packages/cli/src/commands/themes.ts`, `packages/cli/src/commands/themes.test.ts`

**Interfaces:**

- Consumes: `fileResolver`, `checkThemeRef`, `parse`, `PRESETS`, `PRESET_NAMES`, `DiagrammarError` from `@noblecloak/diagrammar-core`.
- Produces: `diagrammar themes list`; `render --theme <preset|path>`; `validate` reports theme-file problems as an issue at path `theme`.

- [ ] **Step 1: Write the failing render-command tests**

Append to `packages/cli/src/commands/render.test.ts` inside the `describe('render command', ...)` block:

```ts
it('resolves a theme file relative to the diagram (not the cwd)', async () => {
  await mkdir(join(dir, 'sub', 'themes'), { recursive: true });
  await writeFile(
    join(dir, 'sub', 'themes', 'house.yaml'),
    'diagrammar-theme: 1\nbase: light\npalette:\n  background: "#123456"\n',
    'utf8',
  );
  await writeFile(
    join(dir, 'sub', 't.yaml'),
    'diagrammar: 1\ntype: flowchart\ntheme: ./themes/house.yaml\nnodes:\n  - { id: a }\n',
    'utf8',
  );
  const code = await run(['sub/t.yaml', '--format', 'svg']);
  expect(code).toBe(0);
  await expect(readFile(join(dir, 'sub', 't.svg'), 'utf8')).resolves.toContain('#123456');
}, 30000);

it('accepts any preset for --theme and rejects an unknown one with exit 1', async () => {
  expect(await run(['f.yaml', '--format', 'svg', '--theme', 'colorblind'])).toBe(0);
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await run(['f.yaml', '--format', 'svg', '--theme', 'neon'])).toBe(1);
  expect(errSpy.mock.calls.flat().join('\n')).toContain('unknown theme "neon"');
}, 30000);

it('reports a missing theme file by name with exit 1', async () => {
  await writeFile(
    join(dir, 'm.yaml'),
    'diagrammar: 1\ntype: flowchart\ntheme: ./nope.yaml\nnodes:\n  - { id: a }\n',
    'utf8',
  );
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await run(['m.yaml', '--format', 'svg'])).toBe(1);
  expect(errSpy.mock.calls.flat().join('\n')).toContain('nope.yaml');
}, 30000);
```

(add `mkdir` to the `node:fs/promises` import).

- [ ] **Step 2: Run to verify failure**

Run: `bun run --cwd packages/cli test -- src/commands/render.test.ts`
Expected: FAIL — `--theme colorblind` rejected; theme file not resolved.

- [ ] **Step 3: Update `render.ts`**

- `help`: change `[--theme light|dark]` to `[--theme <preset|path>]` and the option line to `--theme           Preset (light, dark, colorblind, mono) or a relative theme file path (default: from the file).`
- Delete the `values.theme !== 'light' && values.theme !== 'dark'` check; keep `const theme = values.theme;`.
- Import `fileResolver` from `@noblecloak/diagrammar-core`; inside the per-file loop, after computing `outDir`, add `const resolver = fileResolver(dirname(file));` and set `options.resolver = resolver;` next to the other option assignments.
- Errors from `render()` already flow into the `catch` → `describeIoError(err, outDir)`, which returns `err.message` for a `DiagrammarError`, so `unknown theme "neon"` and `asset "./nope.yaml" not found` are printed as-is.

Run the render tests → PASS.

- [ ] **Step 4: Write the failing validate-command test**

Append to `packages/cli/src/commands/validate.test.ts`:

```ts
it('reports a broken theme file as an issue at path "theme" (exit 1)', async () => {
  await writeFile(join(dir, 'house.yaml'), 'diagrammar-theme: 1\nbase: neon\n', 'utf8');
  const file = join(dir, 't.yaml');
  await writeFile(
    file,
    'diagrammar: 1\ntype: flowchart\ntheme: ./house.yaml\nnodes:\n  - { id: a }\n',
    'utf8',
  );
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const code = await run([file, '--json']);
  expect(code).toBe(1);
  const printed = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? '[]') as {
    ok: boolean;
    issues: { path: string; message: string }[];
  }[];
  expect(printed[0]?.ok).toBe(false);
  expect(printed[0]?.issues[0]?.path).toBe('theme');
  expect(printed[0]?.issues[0]?.message).toContain('house.yaml');
});

it('passes a valid theme file', async () => {
  await writeFile(join(dir, 'ok.theme.yaml'), 'diagrammar-theme: 1\nbase: mono\n', 'utf8');
  const file = join(dir, 'ok.yaml');
  await writeFile(
    file,
    'diagrammar: 1\ntype: flowchart\ntheme: ./ok.theme.yaml\nnodes:\n  - { id: a }\n',
    'utf8',
  );
  vi.spyOn(console, 'log').mockImplementation(() => {});
  expect(await run([file])).toBe(0);
});
```

- [ ] **Step 5: Run to verify failure, then update `validate.ts`**

Run: `bun run --cwd packages/cli test -- src/commands/validate.test.ts` → FAIL (the broken theme passes).

In `validate.ts`, import `checkThemeRef, fileResolver, parse` and `dirname` from `node:path`; replace `const result = validate(text); results.push({ file, ok: result.ok, issues: result.issues });` with:

```ts
const parsed = parse(text);
if (!parsed.ok) {
  results.push({ file, ok: false, issues: parsed.issues });
  continue;
}
const themeIssues = await checkThemeRef(parsed.diagram.theme, fileResolver(dirname(file)));
results.push({ file, ok: themeIssues.length === 0, issues: themeIssues });
```

(`validate` is no longer imported; `parse()` applies exactly the same schema and semantic rules.) Update the help text's second paragraph: "Validates one or more Diagrammar YAML files, including the theme file each one references." Run the validate tests → PASS.

- [ ] **Step 6: Write the failing `themes` command test**

`packages/cli/src/commands/themes.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from './themes.js';

describe('themes command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the four presets with their D2 base and mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run(['list'])).toBe(0);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('light');
    expect(out).toContain('colorblind');
    expect(out).toContain('D2 "Colorblind clear"');
    expect(out).toContain('dark');
  });

  it('prints presets as JSON with --json', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await run(['list', '--json'])).toBe(0);
    const printed = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as { name: string }[];
    expect(printed.map((p) => p.name)).toEqual(['light', 'dark', 'colorblind', 'mono']);
  });

  it('rejects a missing or unknown subcommand with exit 1', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run([])).toBe(1);
    expect(await run(['frobnicate'])).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run to verify failure, then implement `themes.ts`**

Run: `bun run --cwd packages/cli test -- src/commands/themes.test.ts` → FAIL (module not found).

`packages/cli/src/commands/themes.ts`:

```ts
import { parseArgs } from 'node:util';
import { PRESETS, PRESET_NAMES } from '@noblecloak/diagrammar-core';

export const help = `diagrammar themes list [--json]

Lists the built-in theme presets a file can name in its "theme:" key.
A file can also point at a theme file by relative path (e.g.
"theme: ./themes/house.yaml"); see docs/format-guide.md §6.1.

Options:
  --json   Print machine-readable JSON.
`;

export async function run(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub !== 'list') {
    console.error(
      sub === undefined
        ? 'themes: a subcommand is required'
        : `themes: unknown subcommand "${sub}"`,
    );
    console.error(help);
    return 1;
  }
  const { values } = parseArgs({
    args: rest,
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: false,
  });
  const rows = PRESET_NAMES.map((name) => ({
    name,
    d2ThemeId: PRESETS[name].d2ThemeId,
    mode: PRESETS[name].mode,
    description: PRESETS[name].description,
  }));
  if (values.json === true) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  for (const row of rows) {
    console.log(
      `${row.name.padEnd(12)} ${row.mode.padEnd(6)} ${row.description} (D2 theme ${row.d2ThemeId})`,
    );
  }
  return await Promise.resolve(0);
}
```

(The trailing `await Promise.resolve(0)` keeps `@typescript-eslint/require-await` quiet on an otherwise synchronous `async` command; match whatever the other commands do if the lint rule is not enabled — check `bun run lint` in Task 12.)

- [ ] **Step 8: Register the command and update the top-level help**

In `packages/cli/src/main.ts`: `import { run as runThemes, help as themesHelp } from './commands/themes.js';`, add `themes: { run: runThemes, help: themesHelp },` to `COMMANDS`, and add `  themes list         List built-in theme presets` to `TOP_HELP` after the `mcp` line. In `packages/cli/src/main.test.ts`, alongside the existing `expect(printed).toContain('new <file>')` assertions, add `expect(printed).toContain('themes list');`.

- [ ] **Step 9: Run the CLI suite and typecheck**

Run: `bun run build && bun run --cwd packages/cli test && bun run typecheck`
Expected: PASS (`cli.spawn.test.ts` runs the built `dist/bin.mjs`, hence the build first).

- [ ] **Step 10: Commit**

```bash
git add packages/cli/src
git commit -s -m "feat(cli): theme files resolve beside the diagram; themes list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 11: MCP — jailed resolver, theme-aware tools, theme schema

**Files:**

- Modify: `packages/mcp/src/fs.ts`, `packages/mcp/src/fs.test.ts`, `packages/mcp/src/tools/render.ts`, `packages/mcp/src/tools/render.test.ts`, `packages/mcp/src/tools/validate.ts`, `packages/mcp/src/tools/validate.test.ts`, `packages/mcp/src/tools/schema.ts`, `packages/mcp/src/tools/schema.test.ts`, `packages/mcp/src/resources.ts`, `packages/mcp/src/resources.test.ts`, `packages/mcp/src/guide.ts`

**Interfaces:**

- Consumes: `normalizeRelativePath`, `checkThemeRef`, `parse`, `generateThemeJsonSchema`, `PRESET_NAMES`, `type AssetResolver` from core; `resolveInRoot`, `ToolContext`, `resolveSource` from `fs.ts`.
- Produces: `assetResolverFor(ctx: ToolContext, resolvedPath?: string): AssetResolver` (spec §6.2: base = the diagram's directory when `path` was used, else the root; `--no-fs` → every read throws `asset_fs_disabled`; escapes and symlink escapes → `asset_outside_base`); `diagrammar_render.theme: string`; `diagrammar_validate` runs the theme check; `diagrammar_schema` gains `kind: 'diagram' | 'theme'`; new resource `diagrammar://schema/theme-v1`.

- [ ] **Step 1: Write the failing resolver tests**

Append to `packages/mcp/src/fs.test.ts` (it already has a temp-dir pattern; reuse `mkdtemp`/`rm`):

```ts
import { mkdir, symlink } from 'node:fs/promises';
import { assetResolverFor } from './fs.js';

describe('assetResolverFor', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-assets-'));
    await mkdir(join(root, 'diagrams'), { recursive: true });
    await mkdir(join(root, 'themes'), { recursive: true });
    await writeFile(join(root, 'themes', 'house.yaml'), 'base: light\n', 'utf8');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('under --no-fs every read fails with asset_fs_disabled', async () => {
    const r = assetResolverFor({ root: undefined, noFs: true });
    await expect(r.read('themes/house.yaml')).rejects.toMatchObject({ code: 'asset_fs_disabled' });
  });

  it('resolves relative to the diagram directory and allows .. inside the root', async () => {
    const r = assetResolverFor({ root, noFs: false }, join(root, 'diagrams', 'd.yaml'));
    const bytes = await r.read('../themes/house.yaml');
    expect(new TextDecoder().decode(bytes)).toBe('base: light\n');
  });

  it('resolves relative to the root for inline source', async () => {
    const r = assetResolverFor({ root, noFs: false });
    await expect(r.read('themes/house.yaml')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('rejects a path that escapes the root with asset_outside_base', async () => {
    const r = assetResolverFor({ root, noFs: false }, join(root, 'diagrams', 'd.yaml'));
    await expect(r.read('../../outside.yaml')).rejects.toMatchObject({
      code: 'asset_outside_base',
    });
  });

  it('rejects a symlink whose target escapes the root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'diagrammar-outside-'));
    try {
      await writeFile(join(outside, 'evil.yaml'), 'base: dark\n', 'utf8');
      await symlink(join(outside, 'evil.yaml'), join(root, 'themes', 'link.yaml'));
      const r = assetResolverFor({ root, noFs: false });
      await expect(r.read('themes/link.yaml')).rejects.toMatchObject({
        code: 'asset_outside_base',
      });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('reports a missing file as asset_not_found', async () => {
    const r = assetResolverFor({ root, noFs: false });
    await expect(r.read('themes/missing.yaml')).rejects.toMatchObject({ code: 'asset_not_found' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run --cwd packages/mcp test -- src/fs.test.ts`
Expected: FAIL — `assetResolverFor` not exported.

- [ ] **Step 3: Implement `assetResolverFor` in `fs.ts`**

Add imports: `import { normalizeRelativePath, type AssetResolver } from '@noblecloak/diagrammar-core';` (merge into the existing core import) and `sep` from `node:path`. Append:

```ts
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

/**
 * The MCP server's asset resolver (spec §6.2): paths are relative to the
 * diagram's directory (`resolvedPath` from `resolveSource`) or to the root
 * for inline `source`, and every read goes through `resolveInRoot`, so the
 * same lexical + symlink jail that guards `path` arguments guards theme
 * files. Under `--no-fs` every read fails with `asset_fs_disabled`.
 */
export function assetResolverFor(ctx: ToolContext, resolvedPath?: string): AssetResolver {
  if (ctx.noFs || ctx.root === undefined) {
    return {
      read: (relPath: string) =>
        Promise.reject(
          new DiagrammarError(
            `asset "${relPath}" cannot be read: filesystem access is disabled on this server (--no-fs)`,
            'asset_fs_disabled',
          ),
        ),
    };
  }
  const root = ctx.root;
  const baseAbs = resolvedPath !== undefined ? dirname(resolvedPath) : root;
  return {
    async read(relPath: string): Promise<Uint8Array> {
      const target = resolve(baseAbs, normalizeRelativePath(relPath));
      const rootRel = relative(root, target).split(sep).join('/');
      let abs: string;
      try {
        abs = resolveInRoot(root, rootRel);
      } catch (error) {
        if (error instanceof DiagrammarError && error.code === 'path_outside_root') {
          throw new DiagrammarError(
            `asset "${relPath}" escapes the server root`,
            'asset_outside_base',
          );
        }
        throw error;
      }
      try {
        return await readFile(abs);
      } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
          throw new DiagrammarError(`asset "${relPath}" not found`, 'asset_not_found');
        }
        throw error;
      }
    },
  };
}
```

Run the fs tests → PASS.

- [ ] **Step 4: Write the failing tool tests**

Append to `packages/mcp/src/tools/render.test.ts`'s `describe('diagrammar_render', ...)`:

```ts
it('renders a theme file referenced relative to the diagram path', async () => {
  await mkdir(join(root, 'themes'), { recursive: true });
  await writeFile(
    join(root, 'themes', 'house.yaml'),
    'diagrammar-theme: 1\nbase: light\npalette:\n  background: "#123456"\n',
    'utf8',
  );
  await writeFile(
    join(root, 't.yaml'),
    'diagrammar: 1\ntype: flowchart\ntheme: ./themes/house.yaml\nnodes:\n  - { id: a }\n',
    'utf8',
  );
  const client = await connectedClient({ root, noFs: false });
  const result = await client.callTool({
    name: 'diagrammar_render',
    arguments: { path: 't.yaml', format: 'svg' },
  });
  expect(result.isError).toBeFalsy();
  const content = result.content as { type: string; text: string }[];
  expect(content[0]!.text).toContain('#123456');
  await client.close();
}, 30000);

it('under --no-fs a theme path fails with asset_fs_disabled, not a crash', async () => {
  const client = await connectedClient({ root: undefined, noFs: true });
  const result = await client.callTool({
    name: 'diagrammar_render',
    arguments: {
      source: 'diagrammar: 1\ntype: flowchart\ntheme: ./themes/house.yaml\nnodes:\n  - { id: a }\n',
      format: 'svg',
    },
  });
  expect(result.isError).toBe(true);
  const content = result.content as { type: string; text: string }[];
  expect(JSON.parse(content[0]!.text)).toMatchObject({ code: 'asset_fs_disabled' });
  await client.close();
}, 30000);

it('accepts any preset for theme and never leaks the root on a bad theme path', async () => {
  const client = await connectedClient({ root, noFs: false });
  const ok = await client.callTool({
    name: 'diagrammar_render',
    arguments: { source: FLOWCHART, theme: 'colorblind', format: 'svg' },
  });
  expect(ok.isError).toBeFalsy();
  const bad = await client.callTool({
    name: 'diagrammar_render',
    arguments: { source: FLOWCHART, theme: '../../etc/passwd.yaml', format: 'svg' },
  });
  expect(bad.isError).toBe(true);
  const text = (bad.content as { text: string }[])[0]!.text;
  expect(JSON.parse(text)).toMatchObject({ code: 'asset_outside_base' });
  expect(text).not.toContain(root);
  await client.close();
}, 30000);
```

(add `mkdir` to the fs import). Append to `packages/mcp/src/tools/validate.test.ts` (same `connectedClient` pattern, with a `root` temp dir):

```ts
it('reports a broken theme file as an issue at "theme" while still returning ok:false, not a tool error', async () => {
  await writeFile(join(root, 'house.yaml'), 'diagrammar-theme: 1\nbase: neon\n', 'utf8');
  await writeFile(
    join(root, 't.yaml'),
    'diagrammar: 1\ntype: flowchart\ntheme: ./house.yaml\nnodes:\n  - { id: a }\n',
    'utf8',
  );
  const client = await connectedClient({ root, noFs: false });
  const result = await client.callTool({
    name: 'diagrammar_validate',
    arguments: { path: 't.yaml' },
  });
  expect(result.isError).toBeFalsy();
  const payload = JSON.parse((result.content as { text: string }[])[0]!.text) as {
    ok: boolean;
    issues: { path: string; message: string }[];
  };
  expect(payload.ok).toBe(false);
  expect(payload.issues[0]).toMatchObject({ path: 'theme' });
  expect(payload.issues[0]!.message).toContain('house.yaml');
  await client.close();
});
```

Append to `packages/mcp/src/tools/schema.test.ts`:

```ts
it('returns the theme-file schema for kind: "theme"', async () => {
  const client = await connectedClient({ root: undefined, noFs: true });
  const result = await client.callTool({ name: 'diagrammar_schema', arguments: { kind: 'theme' } });
  const content = result.content as { type: string; text: string }[];
  const schema = JSON.parse(content[0]!.text) as { required?: string[] };
  expect(schema.required).toEqual(['diagrammar-theme', 'base']);
  await client.close();
});
```

In `packages/mcp/src/resources.test.ts`, extend the `lists both resources` expectation to `['diagrammar://guide', 'diagrammar://schema/theme-v1', 'diagrammar://schema/v1']` (rename the test to "lists all resources") and add:

```ts
it('reads diagrammar://schema/theme-v1 as JSON', async () => {
  const client = await connectedClient();
  const result = await client.readResource({ uri: 'diagrammar://schema/theme-v1' });
  const text = (result.contents[0] as { text: string }).text;
  expect((JSON.parse(text) as { required?: string[] }).required).toEqual([
    'diagrammar-theme',
    'base',
  ]);
  await client.close();
});
```

- [ ] **Step 5: Run to verify failure**

Run: `bun run --cwd packages/mcp test -- src/tools src/resources.test.ts`
Expected: FAIL across the four files.

- [ ] **Step 6: Update the tools and resources**

`tools/render.ts`:

- `theme: z.string().optional().describe('Overrides the document\'s theme: a preset name (light, dark, colorblind, mono) or a relative path to a theme file, resolved like the file\'s own "theme:" key.')`.
- `const { text, resolvedPath } = await resolveSource(ctx, args);` and, when building `options`: `options.resolver = assetResolverFor(ctx, resolvedPath);` (import `assetResolverFor` from `../fs.js`). `resolvedPath` is optional on `ResolvedSource`, so pass it through as-is.

`tools/validate.ts`: import `checkThemeRef, parse` from core and `assetResolverFor` from `../fs.js`; replace the handler body's `const result = validate(text);` with:

```ts
const parsed = parse(text);
const result = parsed.ok
  ? await (async () => {
      const issues = await checkThemeRef(parsed.diagram.theme, assetResolverFor(ctx, resolvedPath));
      return { ok: issues.length === 0, issues };
    })()
  : { ok: false, issues: parsed.issues };
```

(destructure `resolvedPath` from `resolveSource` as in render). Update the description: "…reports schema/semantic errors, and theme-file errors, with path and line number…".

`tools/schema.ts`: import `generateThemeJsonSchema`; `const THEME_SCHEMA = generateThemeJsonSchema();`; `inputSchema: { kind: z.enum(['diagram', 'theme']).optional().describe('Which schema to return: the diagram file schema (default) or the theme file schema.') }`; the handler becomes `(args) => Promise.resolve({ content: [{ type: 'text', text: JSON.stringify(args.kind === 'theme' ? THEME_SCHEMA : SCHEMA, null, 2) }, { type: 'text', text: GUIDE }] })`. Update the description to mention `kind`.

`resources.ts`: register `'diagrammar-theme-schema'`, uri `'diagrammar://schema/theme-v1'`, title `'Diagrammar theme file v1 JSON Schema'`, serving `generateThemeJsonSchema()`.

`guide.ts`: append before the closing backtick:

```
## Themes

Add "theme: dark" (presets: light, dark, colorblind, mono) or point at a
theme file: "theme: ./themes/house.yaml" — a YAML file starting
"diagrammar-theme: 1" with "base: <preset>", an optional "palette"
(background, fill, stroke, text, groupFill, edge) and optional "defaults"
(nodes/groups/edges/participants, plus per-shape "shapes", per-kind
"kinds", and per-style "messages"). An element's own "style" always wins.
Fetch the theme schema with diagrammar_schema { kind: "theme" }.
```

- [ ] **Step 7: Run the MCP suite and typecheck**

Run: `bun run build && bun run --cwd packages/mcp test && bun run typecheck`
Expected: PASS, including `mcp.integration.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add packages/mcp/src
git commit -s -m "feat(mcp): jailed asset resolver, theme-aware render/validate, theme schema

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

---

### Task 12: Docs, changeset, and the full gate

**Files:**

- Modify: `docs/format-guide.md`, `docs/docs.test.ts`, `docs/SKILL.md`, `README.md`
- Create: `.changeset/themes.md`

- [ ] **Step 1: Let the docs test recognise theme-file blocks**

In `docs/docs.test.ts`, import `parseThemeFile` from core and change the yaml-block test body to:

```ts
      ({ block }) => {
        if (/^diagrammar-theme:/m.test(block)) {
          const result = parseThemeFile(block, 'doc-block.yaml');
          expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true);
          return;
        }
        const result = parse(block);
        expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true);
      },
```

Update the suite comment: a ```yaml block whose text contains a `diagrammar-theme:` line is validated as a theme file instead.

- [ ] **Step 2: Update the format guide**

§1 envelope: change the `theme: light # light | dark — optional, default light` line to `theme: light # a preset (light | dark | colorblind | mono) or ./path/to/theme.yaml — optional, default light`.

Add a new subsection at the end of §6 (before `## 7. Validation`):

````markdown
### 6.1 Theme files

`theme:` names a built-in preset (`light`, `dark`, `colorblind`, `mono`; run
`diagrammar themes list`) or, when it contains a `/` or ends in `.yaml`/`.yml`,
a theme file resolved relative to the diagram's own directory (`..` is fine —
a shared theme usually lives above the diagrams that use it):

```yaml
diagrammar: 1
type: architecture
theme: ../themes/house.yaml
nodes:
  - id: db
    shape: cylinder
```

A theme file sets a base preset, an optional palette, and optional style
defaults. Every key is optional except `diagrammar-theme` and `base`:

```yaml
diagrammar-theme: 1
base: light # the preset to start from; never another file
palette:
  background: '#f6f3ee' # page background
  fill: '#fffdf8' # node and participant fill
  stroke: '#4a3f35' # node, group and participant border
  text: '#2b2520' # every label
  groupFill: '#efe8dc' # group background
  edge: '#8c5a2b' # edge and message lines
defaults: # values use the style subset above
  nodes: { strokeWidth: 2 }
  groups: { dashed: true }
  edges: {}
  participants: {}
  shapes: { cylinder: { fill: '#e6efe3' } } # per graph shape
  kinds: { database: { fill: '#e6efe3' } } # per participant kind
  messages: { return: { dashed: true } } # per message style
```

Precedence, strongest first: an element's own `style`, then its per-kind
default (`shapes`/`kinds`/`messages`), then its family default
(`nodes`/`groups`/`edges`/`participants`), then the palette, then the base
preset. View dimming still wins over any resulting `opacity`.

`diagrammar validate` and the MCP `diagrammar_validate` tool load the theme
file and report its problems as an issue at `theme`, prefixed with the theme
file's path and its own line number. The library's `validate()` only checks
the reference's syntax; pass `RenderOptions.resolver` (for example
`fileResolver(dirname(file))`) to `render()` so it can read the file, and see
`schema/diagrammar-theme-v1.json` for the generated JSON Schema.
````

§7 validation list: add `10. A path-form `theme` is a well-formed relative path (no absolute paths, drive letters or backslashes).`

§10: mention `examples/themed.yaml` + `examples/themes/house.yaml` as the themed worked example.

- [ ] **Step 3: Update SKILL.md and README**

`docs/SKILL.md`, in the `diagrammar_render` section, change "`scale` (`1` or `2`, PNG only), `theme`, and `legend`" to "`scale` (`1` or `2`, PNG only), `theme` (a preset — `light`, `dark`, `colorblind`, `mono` — or a relative theme-file path), and `legend`", and add one sentence after the skeletons section: "To restyle a whole diagram, set `theme:` to a preset or to a theme file (`diagrammar_schema` with `kind: "theme"` returns its schema); never reach for per-node `style` to do what a theme can."

`README.md`: in the CLI block change `[--theme light|dark]` to `[--theme <preset|path>]` and add `diagrammar themes list [--json]` after the `mcp` line; add a bullet: "- `themes list` prints the built-in presets. A file can also reference a theme file by relative path (`theme: ./themes/house.yaml`) — see the format guide §6.1." In `## Features`, add "Themes: four built-in presets plus reusable theme files (palette + per-kind style defaults)."

Run `bunx prettier --write docs/format-guide.md docs/SKILL.md README.md` and `bun run --cwd docs test` → PASS.

- [ ] **Step 4: Add the changeset**

`.changeset/themes.md`:

```markdown
---
'@noblecloak/diagrammar-core': minor
'@noblecloak/diagrammar-mcp': minor
'@noblecloak/diagrammar': minor
---

Themes: `theme:` now accepts the presets `light`, `dark`, `colorblind`, `mono`
or a relative path to a reusable theme file (`diagrammar-theme: 1`) carrying a
palette and per-kind style defaults. `render()` gains `resolver` (see
`fileResolver`) for path-form themes; the CLI resolves them beside the
diagram and the MCP server inside its root jail. New: `diagrammar themes
list`, `diagrammar_schema { kind: "theme" }`, `diagrammar://schema/theme-v1`,
`checkThemeRef`. The `Theme` type widens from `'light' | 'dark'` to `string`.
```

- [ ] **Step 5: Run the full gate chain**

Run from the repo root:

```bash
bun install --frozen-lockfile && bun run build && bun run lint && bun run format:check && bun run typecheck && bun run test && bun run test -- --coverage
```

Expected: every step green; coverage stays at or above the 80% floors. If `lint` flags `require-await` or an unused import introduced by these tasks, fix it in place. Run `bun run --cwd examples test` twice more to reconfirm the themed golden is stable.

- [ ] **Step 6: Commit**

```bash
git add docs README.md .changeset/themes.md
git commit -s -m "docs: theme files, themes list, and a minor changeset

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GCYjfx2VAP37oAMLZK2ni"
```

Then hand off per `superpowers:finishing-a-development-branch` (open a PR from `design/themes-and-icons` against `main`; the DCO and four CI cells must pass).
