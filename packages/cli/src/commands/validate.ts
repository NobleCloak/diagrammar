import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  checkIconRefs,
  checkThemeRef,
  DiagrammarError,
  fileResolver,
  parse,
  type ValidationIssue,
} from '@noblecloak/diagrammar-core';
import { registryWithDirs } from '@noblecloak/diagrammar-mcp';
import { describeIoError } from '../ioError.js';

export const help = `diagrammar validate <files...> [--icons <dir>]... [--json]

Validates one or more Diagrammar YAML files, including the theme file and
every icon each one references. Exits 1 if any file has validation errors
(or cannot be read), 0 otherwise.

Options:
  --icons <dir>   Register an extra icon-set directory, relative to the current directory (repeatable).
  --json          Print machine-readable JSON instead of human-readable text.

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
    options: {
      json: { type: 'boolean', default: false },
      icons: { type: 'string', multiple: true },
    },
    allowPositionals: true,
  });
  if (positionals.length === 0) {
    console.error('validate: at least one file is required');
    return 1;
  }
  let iconRegistry;
  try {
    iconRegistry = registryWithDirs(values.icons ?? []);
  } catch (err) {
    if (err instanceof DiagrammarError) {
      console.error(`validate: ${err.message}`);
      return 1;
    }
    throw err;
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
    const parsed = parse(text);
    if (!parsed.ok) {
      results.push({ file, ok: false, issues: parsed.issues });
      continue;
    }
    let issues: ValidationIssue[];
    try {
      const resolver = fileResolver(dirname(file));
      const themeIssues = await checkThemeRef(parsed.diagram.theme, resolver);
      const iconIssues = await checkIconRefs(parsed.diagram, iconRegistry, resolver);
      issues = [...themeIssues, ...iconIssues];
    } catch (err) {
      results.push({
        file,
        ok: false,
        issues: [{ path: 'theme', message: describeIoError(err, file) }],
      });
      continue;
    }
    results.push({ file, ok: issues.length === 0, issues });
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
