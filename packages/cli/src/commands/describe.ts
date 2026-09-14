import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { describe } from '@noblecloak/diagrammar-core';
import { describeIoError } from '../ioError.js';

export const help = `diagrammar describe <file> [--json]

Prints a structural summary of a Diagrammar document.

Options:
  --json   Print the full machine-readable description as JSON.

Exit codes: 0 success, 1 usage error or the file could not be read.
`;

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: true,
  });
  const file = positionals[0];
  if (file === undefined) {
    console.error('describe: a file path is required');
    return 1;
  }
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    console.error(`describe: ${describeIoError(err, file)}`);
    return 1;
  }
  const result = describe(text);
  if (values.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${file} (${result.type ?? 'unknown'}) — hash ${result.hash}`);
    console.log(`valid: ${result.valid}`);
    console.log(`elements: ${result.elements.length}`);
  }
  return 0;
}
