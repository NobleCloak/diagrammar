import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { sanitizeSvg, ICON_SET_DATA_FILE, ICON_SET_INDEX_FILE } from '@noblecloak/diagrammar-core';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_GZ_BYTES = 5 * 1024 * 1024;

interface SetSource {
  id: string;
  packageName: string;
  outDir: string;
  license: { spdx: string; url: string; notice?: string };
  entries(pkgDir: string): Array<{ name: string; file: string; aliases: string[] }>;
}

function pkgDirOf(packageName: string): string {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}

function versionOf(pkgDir: string): string {
  const manifest = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
    version: string;
  };
  return manifest.version;
}

const SOURCES: Record<string, SetSource> = {
  lucide: {
    id: 'lucide',
    packageName: 'lucide-static',
    outDir: path.join(repoRoot, 'packages', 'icons-lucide'),
    license: { spdx: 'ISC', url: 'https://github.com/lucide-icons/lucide/blob/main/LICENSE' },
    entries(pkgDir) {
      const tags = JSON.parse(readFileSync(path.join(pkgDir, 'tags.json'), 'utf8')) as Record<
        string,
        string[]
      >;
      return readdirSync(path.join(pkgDir, 'icons'))
        .filter((f) => f.endsWith('.svg'))
        .map((f) => {
          const name = f.slice(0, -4);
          return { name, file: path.join(pkgDir, 'icons', f), aliases: tags[name] ?? [] };
        });
    },
  },
  'simple-icons': {
    id: 'simple-icons',
    packageName: 'simple-icons',
    outDir: path.join(repoRoot, 'packages', 'icons-simple-icons'),
    license: {
      spdx: 'CC0-1.0',
      url: 'https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md',
      notice:
        'Brand marks remain the property of their owners; see NOTICE.md (the upstream DISCLAIMER).',
    },
    entries(pkgDir) {
      const data = JSON.parse(
        readFileSync(path.join(pkgDir, 'data', 'simple-icons.json'), 'utf8'),
      ) as Array<{
        title: string;
        slug: string;
        aliases?: { aka?: string[] };
      }>;
      return data.map((icon) => ({
        name: icon.slug,
        file: path.join(pkgDir, 'icons', `${icon.slug}.svg`),
        aliases: [...new Set([icon.title, ...(icon.aliases?.aka ?? [])])].filter(
          (a) => a !== icon.slug,
        ),
      }));
    },
  },
};

function main(): void {
  const which = process.argv[2];
  const source = which !== undefined ? SOURCES[which] : undefined;
  if (source === undefined) {
    console.error(`usage: build-icon-set <${Object.keys(SOURCES).join('|')}>`);
    process.exitCode = 2;
    return;
  }
  const pkgDir = pkgDirOf(source.packageName);
  const version = versionOf(pkgDir);
  const icons: Record<string, string> = {};
  const aliases: Record<string, string[]> = {};
  const failures: string[] = [];
  const entries = source.entries(pkgDir).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    try {
      icons[entry.name] = sanitizeSvg(readFileSync(entry.file, 'utf8'));
    } catch (error) {
      failures.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (entry.aliases.length > 0) aliases[entry.name] = [...entry.aliases].sort();
  }
  if (failures.length > 0) {
    console.error(`${failures.length} icon(s) rejected by the sanitizer:\n${failures.join('\n')}`);
    process.exitCode = 1;
    return;
  }
  const names = Object.keys(icons).sort();
  const sorted: Record<string, string> = {};
  for (const name of names) sorted[name] = icons[name] ?? '';
  mkdirSync(source.outDir, { recursive: true });
  const gz = gzipSync(Buffer.from(JSON.stringify(sorted), 'utf8'), { level: 9 });
  if (gz.byteLength > MAX_GZ_BYTES) {
    console.error(
      `${source.id}: ${ICON_SET_DATA_FILE} is ${gz.byteLength} bytes, over the ${MAX_GZ_BYTES}-byte gate`,
    );
    process.exitCode = 1;
    return;
  }
  writeFileSync(path.join(source.outDir, ICON_SET_DATA_FILE), gz);
  const index = {
    'diagrammar-icons': 1,
    id: source.id,
    version,
    license: source.license,
    names,
    aliases,
  };
  writeFileSync(path.join(source.outDir, ICON_SET_INDEX_FILE), `${JSON.stringify(index)}\n`);
  console.log(`${source.id}@${version}: ${names.length} icons, ${gz.byteLength} bytes gzipped`);
}

main();
