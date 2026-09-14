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
