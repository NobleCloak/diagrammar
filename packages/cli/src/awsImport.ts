import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import {
  DiagrammarError,
  ICON_SET_DATA_FILE,
  ICON_SET_INDEX_FILE,
  sanitizeSvg,
  type IconSetIndex,
} from '@noblecloak/diagrammar-core';
import { writeAtomic } from '@noblecloak/diagrammar-mcp';

export const AWS_LICENSE = {
  spdx: 'LicenseRef-AWS-Architecture-Icons',
  url: 'https://aws.amazon.com/architecture/icons/',
  notice:
    'AWS Architecture Icons are provided by Amazon Web Services for use in architecture diagrams under their own terms. This set was built locally from the official download and is not redistributed by Diagrammar.',
};

const ARCH_ENTRY_RE = /(?:^|\/)Arch_([^/]+)\/64\/Arch_([^/]+)_64\.svg$/;

export interface AwsImportSource {
  zipName: string;
  sha256: string;
}

export interface AwsImportRejection {
  entry: string;
  reason: string;
}

export interface AwsImportResult {
  index: IconSetIndex;
  icons: Record<string, string>;
  sourceMd: string;
  skipped: number;
  rejected: AwsImportRejection[];
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `AWS-Lambda` -> `lambda`, `Amazon-Simple-Storage-Service` -> `simple-storage-service`. */
export function serviceName(stem: string): string {
  return slug(stem.replace(/^(AWS|Amazon)-/i, ''));
}

/** Pure: zip entries -> set data. Exported for tests; `importAwsZip` wraps it with I/O. */
export function buildAwsIconSet(
  entries: Record<string, Uint8Array>,
  source: AwsImportSource,
): AwsImportResult {
  const icons: Record<string, string> = {};
  const aliases: Record<string, string[]> = {};
  const rejected: AwsImportRejection[] = [];
  let skipped = 0;
  const paths = Object.keys(entries).sort();
  for (const entryPath of paths) {
    const match = ARCH_ENTRY_RE.exec(entryPath);
    if (match === null) {
      skipped += 1;
      continue;
    }
    const category = slug(match[1] ?? '');
    const stem = match[2] ?? '';
    const fullName = slug(stem);
    let name = serviceName(stem);
    if (Object.hasOwn(icons, name)) name = fullName;
    if (Object.hasOwn(icons, name)) {
      throw new DiagrammarError(
        `AWS import: icon name "${name}" collides twice (from ${entryPath})`,
        'icon_set_invalid',
      );
    }
    let svg: string;
    try {
      svg = sanitizeSvg(new TextDecoder().decode(entries[entryPath]));
    } catch (error) {
      rejected.push({
        entry: entryPath,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    icons[name] = svg;
    const aliasList = [...new Set([fullName, category])]
      .filter((a) => a !== name && a.length > 0)
      .sort();
    if (aliasList.length > 0) aliases[name] = aliasList;
  }
  const names = Object.keys(icons).sort();
  if (names.length === 0) {
    throw new DiagrammarError(
      'AWS import: no icons survived — no Arch_*/64/*.svg entries were found, or every ' +
        'one was rejected by the sanitizer; is this the official Asset Package zip?',
      'icon_set_invalid',
    );
  }
  const sorted: Record<string, string> = {};
  for (const n of names) sorted[n] = icons[n] ?? '';
  const index: IconSetIndex = {
    'diagrammar-icons': 1,
    id: 'aws',
    version: source.zipName,
    license: AWS_LICENSE,
    names,
    aliases,
  };
  const rejectedMd =
    rejected.length > 0
      ? `\n${rejected.length} icon(s) rejected by the sanitizer:\n${rejected
          .map((r) => `- ${r.entry}: ${r.reason}`)
          .join('\n')}\n`
      : '';
  const sourceMd = `# Source\n\nBuilt by \`diagrammar icons import aws\` from \`${source.zipName}\` (sha256 ${source.sha256}).\n${names.length} architecture service icons (64px SVG variants); ${skipped} other entries skipped.\nTerms: ${AWS_LICENSE.url}\n${rejectedMd}`;
  return { index, icons: sorted, sourceMd, skipped, rejected };
}

export async function importAwsZip(
  zipPath: string,
  outDir: string,
): Promise<{ count: number; rejected: AwsImportRejection[]; outDir: string }> {
  const bytes = await readFile(zipPath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const result = buildAwsIconSet(unzipSync(new Uint8Array(bytes)), {
    zipName: basename(zipPath),
    sha256,
  });
  await mkdir(outDir, { recursive: true });
  await writeAtomic(join(outDir, ICON_SET_INDEX_FILE), `${JSON.stringify(result.index)}\n`);
  await writeAtomic(
    join(outDir, ICON_SET_DATA_FILE),
    gzipSync(Buffer.from(JSON.stringify(result.icons), 'utf8'), { level: 9 }),
  );
  await writeAtomic(join(outDir, 'SOURCE.md'), result.sourceMd);
  return { count: result.index.names.length, rejected: result.rejected, outDir };
}
