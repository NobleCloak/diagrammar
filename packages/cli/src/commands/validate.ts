import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { validate, type ValidationIssue } from '@noblecloak/diagrammar-core';
import { describeIoError } from '../ioError.js';

export const help = `diagrammar validate <files...> [--json]

Validates one or more Diagrammar YAML files. Exits 1 if any file has
validation errors (or cannot be read), 0 otherwise.

Options:
  --json   Print machine-readable JSON instead of human-readable text.

Exit codes: 0 all files valid, 1 a validation or usage/IO error occurred.
`;

interface FileResult {
  file: string;
  ok: boolean;
  issues: ValidationIssue[];
}

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { json: { type: 'boolean', default: false } },
    allowPositionals: true,
  });
  if (positionals.length === 0) {
    console.error('validate: at least one file is required');
    return 1;
  }
  const results: FileResult[] = [];
  for (const file of positionals) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (err) {
      results.push({
        file,
        ok: false,
        issues: [{ path: file, message: describeIoError(err, file) }],
      });
      continue;
    }
    const result = validate(text);
    results.push({ file, ok: result.ok, issues: result.issues });
  }
  if (values.json === true) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      if (result.ok) {
        console.log(`${result.file}: OK`);
      } else {
        console.log(`${result.file}: ${result.issues.length} issue(s)`);
        for (const issue of result.issues) {
          const location =
            issue.line !== undefined ? `${issue.path} (line ${issue.line})` : issue.path;
          console.log(`  ${location}: ${issue.message}`);
        }
      }
    }
  }
  return results.every((r) => r.ok) ? 0 : 1;
}
