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
