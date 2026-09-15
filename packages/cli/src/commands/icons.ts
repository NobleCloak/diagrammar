import { parseArgs } from 'node:util';
import { DiagrammarError } from '@noblecloak/diagrammar-core';
import { registryWithDirs } from '@noblecloak/diagrammar-mcp';
import { importAwsZip } from '../awsImport.js';
import { describeIoError } from '../ioError.js';

export const help = `diagrammar icons <subcommand>

  icons search <query> [--set <id>] [--limit n] [--icons <dir>]... [--json]
      Search registered icon sets by name and alias; prints "<set>/<name>" per line, best first.
  icons sets [--icons <dir>]... [--json]
      List registered icon sets with version, license and icon count.
  icons import aws <zip> --out <dir>
      Build a local "aws/" icon set from the official AWS Architecture Icons zip.

Options:
  --icons <dir>   Register an extra icon-set directory (repeatable).
  --json          Print machine-readable JSON.
`;

/** Shared by render/validate/mcp: `--icons` is repeatable and may be absent. */
export function iconDirsFrom(values: { icons?: string[] | undefined }): string[] {
  return values.icons ?? [];
}

function runSets(rest: string[]): number {
  const { values } = parseArgs({
    args: rest,
    options: {
      json: { type: 'boolean', default: false },
      icons: { type: 'string', multiple: true },
    },
    allowPositionals: false,
  });
  const registry = registryWithDirs(iconDirsFrom(values));
  // Names come from the index (already loaded synchronously when the set was
  // opened), so listing sets never needs to gunzip icons.json.gz.
  const rows = registry.sets().map((set) => ({
    id: set.id,
    version: set.version,
    license: set.license,
    count: set.names().length,
  }));
  if (values.json === true) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  for (const row of rows) {
    console.log(
      `${row.id.padEnd(14)} ${row.version.padEnd(10)} ${row.license.spdx.padEnd(10)} ${row.count} icons`,
    );
  }
  return 0;
}

async function runSearch(rest: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      set: { type: 'string' },
      limit: { type: 'string' },
      json: { type: 'boolean', default: false },
      icons: { type: 'string', multiple: true },
    },
    allowPositionals: true,
  });
  const query = positionals[0];
  if (query === undefined) {
    console.error('icons search: a query is required');
    return 1;
  }
  const limit = values.limit !== undefined ? Number(values.limit) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    console.error('icons search: --limit must be a positive integer');
    return 1;
  }
  const registry = registryWithDirs(iconDirsFrom(values));
  const matches = await registry.search(query, {
    ...(values.set !== undefined ? { set: values.set } : {}),
    ...(limit !== undefined ? { limit } : {}),
  });
  if (values.json === true) {
    console.log(JSON.stringify(matches, null, 2));
    return 0;
  }
  for (const m of matches) console.log(`${m.set}/${m.name}`);
  return 0;
}

async function runImport(rest: string[]): Promise<number> {
  const [vendor, zipPath, ...more] = rest;
  if (vendor !== 'aws') {
    console.error(`icons import: unknown vendor "${vendor ?? ''}" (supported: aws)`);
    return 1;
  }
  const { values } = parseArgs({
    args: more,
    options: { out: { type: 'string' } },
    allowPositionals: false,
  });
  if (zipPath === undefined || values.out === undefined) {
    console.error('icons import aws: usage: icons import aws <zip> --out <dir>');
    return 1;
  }
  try {
    const result = await importAwsZip(zipPath, values.out);
    console.log(
      `wrote ${result.count} icons to ${result.outDir} (register with --icons ${result.outDir}, reference as aws/<name>)`,
    );
    if (result.rejected.length > 0) {
      console.error(`skipped ${result.rejected.length} icons rejected by the sanitizer:`);
      for (const r of result.rejected) console.error(`  ${r.entry}: ${r.reason}`);
    }
    return 0;
  } catch (err) {
    console.error(`icons import aws: ${describeIoError(err, zipPath)}`);
    return 1;
  }
}

export async function run(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  try {
    if (sub === 'sets') return runSets(rest);
    if (sub === 'search') return await runSearch(rest);
    if (sub === 'import') return await runImport(rest);
  } catch (err) {
    if (err instanceof DiagrammarError) {
      console.error(`icons ${sub}: ${err.message}`);
      return 1;
    }
    throw err;
  }
  console.error(
    sub === undefined ? 'icons: a subcommand is required' : `icons: unknown subcommand "${sub}"`,
  );
  console.error(help);
  return 1;
}
