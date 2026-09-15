import { parseArgs } from 'node:util';
import { readFile, mkdir, glob } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import {
  DiagrammarError,
  fileResolver,
  render,
  walkthrough,
  type RenderOptions,
} from '@noblecloak/diagrammar-core';
import { registryWithDirs, writeAtomic } from '@noblecloak/diagrammar-mcp';
import { describeIoError } from '../ioError.js';

export const help = `diagrammar render <files...> [-o <dir>] [--format png|svg|md|d2] [--view <id>] [--scale 1|2] [--theme <preset|path>] [--icons <dir>]... [--no-legend]

Renders one or more Diagrammar files. <files...> may be globs. Output is
written beside each input file unless -o is given, in which case the
output directory is created (recursively) if it doesn't already exist.

Options:
  -o, --out <dir>   Output directory (default: beside each input file).
  --format          png (default) | svg | md | d2
  --view <id>       Render a single named view instead of the root.
  --scale 1|2       PNG scale factor (default 1).
  --theme           Preset (light, dark, colorblind, mono) or a relative theme file path (default: from the file).
  --icons <dir>     Register an extra icon-set directory (repeatable; Lucide and Simple Icons are always available).
  --no-legend       Suppress the callout legend.
`;

type OutputFormat = 'png' | 'svg' | 'md' | 'd2';

function isOutputFormat(value: string): value is OutputFormat {
  return value === 'png' || value === 'svg' || value === 'md' || value === 'd2';
}

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string', short: 'o' },
      format: { type: 'string', default: 'png' },
      view: { type: 'string' },
      scale: { type: 'string' },
      theme: { type: 'string' },
      icons: { type: 'string', multiple: true },
      'no-legend': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });
  if (positionals.length === 0) {
    console.error('render: at least one file or glob is required');
    return 1;
  }

  const files = new Set<string>();
  for (const pattern of positionals) {
    for await (const match of glob(pattern)) {
      files.add(match);
    }
  }
  if (files.size === 0) {
    console.error('render: no files matched');
    return 1;
  }

  if (!isOutputFormat(values.format)) {
    console.error(`render: unknown --format "${values.format}"`);
    return 1;
  }
  const format = values.format;

  const scale = values.scale !== undefined ? Number(values.scale) : undefined;
  if (scale !== undefined && scale !== 1 && scale !== 2) {
    console.error('render: --scale must be 1 or 2');
    return 1;
  }
  const theme = values.theme;
  const legend = !values['no-legend'];

  let iconRegistry;
  try {
    iconRegistry = registryWithDirs(values.icons ?? []);
  } catch (err) {
    if (err instanceof DiagrammarError) {
      console.error(`render: ${err.message}`);
      return 1;
    }
    throw err;
  }

  for (const file of Array.from(files).sort()) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      console.error(`render: ${describeIoError(err, file)}`);
      return 1;
    }
    const stem = basename(file, extname(file));
    const outDir = values.out ?? dirname(file);
    const suffix = values.view !== undefined ? `.${values.view}` : '';
    const resolver = fileResolver(dirname(file));

    try {
      // I3: -o's directory is created (recursively) rather than requiring
      // the caller to have made it already.
      await mkdir(outDir, { recursive: true });

      if (format === 'md') {
        // I4: the image path and the output filename must carry the same
        // view suffix — otherwise rendering two views' walkthroughs would
        // both write `<stem>.md`, each overwriting the last.
        const md = walkthrough(text, { imagePath: `${stem}${suffix}.png` });
        await writeAtomic(join(outDir, `${stem}${suffix}.md`), md);
        continue;
      }

      const options: RenderOptions = {
        format: format === 'd2' ? 'svg' : format,
        emitD2: format === 'd2',
      };
      if (values.view !== undefined) options.view = values.view;
      if (scale !== undefined) options.scale = scale;
      if (theme !== undefined) options.theme = theme;
      options.legend = legend;
      options.resolver = resolver;
      options.icons = iconRegistry;

      const result = await render(text, options);

      if (format === 'd2') {
        if (result.d2 === undefined) {
          throw new Error('engine did not return D2 source (emitD2 was set)');
        }
        await writeAtomic(join(outDir, `${stem}${suffix}.d2`), result.d2);
        continue;
      }

      const ext = format === 'svg' ? 'svg' : 'png';
      const data = format === 'svg' ? result.svg : Buffer.from(result.bytes);
      await writeAtomic(join(outDir, `${stem}${suffix}.${ext}`), data);
    } catch (err) {
      // M10: routed through the shared errno mapper — never a raw Node
      // message, and never a `writeAtomic` temp-file name, since
      // `describeIoError` builds its message from `outDir`/`file`, not
      // `err.message`, for every mapped code.
      console.error(`render: ${describeIoError(err, outDir)}`);
      return 1;
    }
  }

  return 0;
}
