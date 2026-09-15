import { DiagrammarError, formatValidationIssues, type ValidationIssue } from '../errors.js';
import { loadYaml, withLine, yamlErrorsToIssues } from '../parse.js';
import { zodErrorToIssues } from '../schema/issues.js';
import { buildTheme } from './build.js';
import { ThemeFileSchema } from './schema.js';
import type { ResolvedTheme } from './types.js';
import { isPathRef } from '../assets/paths.js';
import type { AssetResolver } from '../assets/resolver.js';
import { PRESET_NAMES, isPresetName, presetTheme } from './presets.js';

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

/**
 * Resolves a `theme:` reference (spec §3.1): a preset name from the table,
 * or a relative path read through `resolver`, parsed and validated. Every
 * failure is a `DiagrammarError`; see spec §6.3 for the codes.
 */
export async function resolveTheme(
  ref: string,
  resolver: AssetResolver | undefined,
): Promise<ResolvedTheme> {
  if (isPresetName(ref)) return presetTheme(ref);
  if (!isPathRef(ref)) {
    throw new DiagrammarError(
      `unknown theme "${ref}": expected one of ${PRESET_NAMES.join(', ')} or a relative path to a .yaml theme file`,
      'theme_invalid',
    );
  }
  if (resolver === undefined) {
    throw new DiagrammarError(
      `theme "${ref}" is a file reference but no asset resolver was supplied; pass RenderOptions.resolver (e.g. fileResolver(dirname(file)))`,
      'asset_resolver_missing',
    );
  }
  const bytes = await resolver.read(ref);
  const result = parseThemeFile(new TextDecoder().decode(bytes), ref);
  if (!result.ok) {
    throw new DiagrammarError(
      `theme file "${ref}" is invalid: ${formatValidationIssues(result.issues)}`,
      'theme_invalid',
    );
  }
  return result.theme;
}

/**
 * `validate()` is synchronous and only checks a theme reference's syntax;
 * this is the async existence/content check the CLI and MCP run after it
 * (spec §6.3). Non-Diagrammar errors (I/O faults) propagate.
 */
export async function checkThemeRef(
  ref: string,
  resolver: AssetResolver | undefined,
): Promise<ValidationIssue[]> {
  try {
    await resolveTheme(ref, resolver);
    return [];
  } catch (error) {
    if (error instanceof DiagrammarError) {
      return [{ path: 'theme', message: error.message }];
    }
    throw error;
  }
}
