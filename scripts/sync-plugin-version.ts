import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * The npx caret range for a given CLI version: `^0.N` while major is 0 (npm
 * caret semantics pin the minor there), `^M.0` from 1.0 on (pins the major,
 * accepts any minor/patch at or above 0). Mirrors the check in
 * `scripts/plugin.test.ts`.
 */
function caretRange(version: string): string {
  const [major, minor] = version.split('.').map(Number);
  return (major ?? 0) === 0 ? `^0.${minor ?? 0}` : `^${major}.0`;
}

const RANGE_TOKEN = /@noblecloak\/diagrammar@\^\d+\.\d+/g;
/** The manifest's top-level `"version": "..."` line; the two groups keep everything but the value. */
const VERSION_TOKEN = /^(\s*"version":\s*")[^"]*(")/m;

/**
 * Rewrites every `@noblecloak/diagrammar@^M.N` occurrence in `filePath` to
 * `range`, leaving every other byte untouched (no reformatting — this is a
 * plain string substitution, not a JSON re-serialization, so `.mcp.json`'s
 * single-line `args` array survives intact). No-op, and no write, if the
 * file already matches.
 */
function rewriteRange(filePath: string, range: string): void {
  const text = readFileSync(filePath, 'utf8');
  const updated = text.replace(RANGE_TOKEN, `@noblecloak/diagrammar@${range}`);
  if (updated !== text) writeFileSync(filePath, updated);
}

/**
 * Keeps `plugin/.claude-plugin/plugin.json`'s `version`, the npx caret range
 * in `plugin/.mcp.json`'s `args`, and every `@noblecloak/diagrammar@^M.N`
 * mention in `README.md`, `plugin/README.md` and
 * `plugin/skills/diagrammar/SKILL.md` equal to (a version of / in range of)
 * the CLI package's version. The CLI version is bumped by the Changesets bot
 * in the "Version Packages" PR (never by a human commit), so this runs as
 * part of the root `version` script that release.yml invokes — the bot's PR
 * then carries the plugin and docs bump too. `scripts/plugin.test.ts` fails
 * CI if any of these ever drift from the CLI version.
 */
export function syncPluginVersion(repoRoot: string): {
  previous: string;
  current: string;
  range: string;
} {
  const cliManifest = path.join(repoRoot, 'packages/cli/package.json');
  const pluginManifest = path.join(repoRoot, 'plugin/.claude-plugin/plugin.json');
  const current = (JSON.parse(readFileSync(cliManifest, 'utf8')) as { version: string }).version;
  const pluginText = readFileSync(pluginManifest, 'utf8');
  const previous = (JSON.parse(pluginText) as { version: string }).version;
  if (previous !== current) {
    // Textual substitution of the one `"version": "..."` token, never a
    // JSON re-serialization: JSON.stringify(…, null, 2) explodes the
    // single-line `author`/`keywords` that Prettier wants, and the bot's
    // Version Packages PR then fails `format:check`.
    const updated = pluginText.replace(VERSION_TOKEN, `$1${current}$2`);
    if (updated === pluginText) {
      throw new Error(`could not find the "version" field in ${pluginManifest}`);
    }
    writeFileSync(pluginManifest, updated);
  }

  const range = caretRange(current);
  rewriteRange(path.join(repoRoot, 'plugin/.mcp.json'), range);
  rewriteRange(path.join(repoRoot, 'README.md'), range);
  rewriteRange(path.join(repoRoot, 'plugin/README.md'), range);
  rewriteRange(path.join(repoRoot, 'plugin/skills/diagrammar/SKILL.md'), range);

  return { previous, current, range };
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { previous, current, range } = syncPluginVersion(repoRoot);
  console.error(
    previous === current
      ? `plugin.json already at ${current} (npx range ${range})`
      : `plugin.json ${previous} -> ${current} (npx range ${range})`,
  );
}
