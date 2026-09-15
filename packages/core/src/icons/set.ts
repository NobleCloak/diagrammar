import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { DiagrammarError } from '../errors.js';
import { zodErrorToIssues } from '../schema/issues.js';
import { sanitizeSvg } from './sanitize.js';
import type { IconLicense, IconSet } from './types.js';

export const ICON_SET_INDEX_FILE = 'index.json';
export const ICON_SET_DATA_FILE = 'icons.json.gz';

const IconSetIndexSchema = z
  .object({
    'diagrammar-icons': z.literal(1),
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    version: z.string().min(1),
    license: z
      .object({ spdx: z.string(), url: z.string(), notice: z.string().optional() })
      .strict(),
    names: z.array(z.string()),
    aliases: z.record(z.string(), z.array(z.string())),
  })
  .strict();
export type IconSetIndex = z.infer<typeof IconSetIndexSchema>;

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function buildLicense(input: IconSetIndex['license']): IconLicense {
  return {
    spdx: input.spdx,
    url: input.url,
    ...(input.notice !== undefined ? { notice: input.notice } : {}),
  };
}

class JsonIconSet implements IconSet {
  readonly id: string;
  readonly version: string;
  readonly license: IconLicense;
  private readonly sortedNames: readonly string[];
  private readonly aliasMap: Record<string, string[]>;
  private icons: Record<string, string> | undefined;
  private loading: Promise<void> | undefined;
  private readonly sanitized = new Map<string, string>();

  constructor(
    index: IconSetIndex,
    private readonly readData: () => Promise<Record<string, string>>,
  ) {
    this.id = index.id;
    this.version = index.version;
    this.license = buildLicense(index.license);
    this.sortedNames = [...index.names].sort();
    this.aliasMap = index.aliases;
  }

  load(): Promise<void> {
    this.loading ??= this.readData()
      .then((icons) => {
        this.icons = icons;
      })
      .catch((error: unknown) => {
        this.loading = undefined;
        throw error;
      });
    return this.loading;
  }

  /**
   * Returns the sanitized SVG for `name`, or `undefined` before `load()` or
   * for a name the set does not own. Sanitizes lazily on first access per
   * name (spec §5.3 applies to every set, bundled or directory-backed) and
   * memoizes the result, so a set built from untrusted `icons.json.gz`
   * content is only ever handed out clean.
   *
   * @throws {DiagrammarError} with code `icon_invalid` if the icon fails
   * sanitization; the error is not memoized, so a fixed set directory can be
   * reloaded without restarting the process.
   */
  get(name: string): string | undefined {
    const cached = this.sanitized.get(name);
    if (cached !== undefined) return cached;
    if (this.icons === undefined || !Object.hasOwn(this.icons, name)) return undefined;
    const clean = sanitizeSvg(this.icons[name] ?? '');
    this.sanitized.set(name, clean);
    return clean;
  }

  names(): readonly string[] {
    return this.sortedNames;
  }

  aliases(name: string): readonly string[] {
    return Object.hasOwn(this.aliasMap, name) ? (this.aliasMap[name] ?? []) : [];
  }
}

/**
 * Opens a set directory in the layout every set package and the AWS
 * importer produce (spec §5.4/§5.5): `index.json` (read now, small) and
 * `icons.json.gz` (gunzipped on first `load()`).
 */
export function openIconSetDir(dir: string): IconSet {
  let raw: string;
  try {
    raw = readFileSync(join(dir, ICON_SET_INDEX_FILE), 'utf8');
  } catch {
    throw new DiagrammarError(
      `icon set directory "${dir}" has no ${ICON_SET_INDEX_FILE}`,
      'icon_set_invalid',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DiagrammarError(
      `icon set "${dir}": ${ICON_SET_INDEX_FILE} is not valid JSON`,
      'icon_set_invalid',
    );
  }
  const index = IconSetIndexSchema.safeParse(parsed);
  if (!index.success) {
    const detail = zodErrorToIssues(index.error, parsed)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ');
    throw new DiagrammarError(
      `icon set "${dir}": ${ICON_SET_INDEX_FILE} is malformed: ${detail}`,
      'icon_set_invalid',
    );
  }
  return new JsonIconSet(index.data, async () => {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(dir, ICON_SET_DATA_FILE));
    } catch {
      throw new DiagrammarError(
        `icon set "${index.data.id}" has no ${ICON_SET_DATA_FILE}`,
        'icon_set_invalid',
      );
    }
    return JSON.parse(gunzipSync(bytes).toString('utf8')) as Record<string, string>;
  });
}

/** In-memory set for tests. */
export function memoryIconSet(
  id: string,
  icons: Record<string, string>,
  aliases: Record<string, string[]> = {},
): IconSet {
  return new JsonIconSet(
    {
      'diagrammar-icons': 1,
      id,
      version: '0.0.0-test',
      license: { spdx: 'CC0-1.0', url: 'https://example.test' },
      names: Object.keys(icons),
      aliases,
    },
    () => Promise.resolve(icons),
  );
}
