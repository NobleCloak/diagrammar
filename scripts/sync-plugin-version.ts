import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Keeps `plugin/.claude-plugin/plugin.json`'s `version` equal to the CLI
 * package's. The CLI version is bumped by the Changesets bot in the "Version
 * Packages" PR (never by a human commit), so this runs as part of the root
 * `version` script that release.yml invokes — the bot's PR then carries the
 * plugin bump too. `scripts/plugin.test.ts` fails CI if the two ever differ.
 */
export function syncPluginVersion(repoRoot: string): { previous: string; current: string } {
  const cliManifest = path.join(repoRoot, 'packages/cli/package.json');
  const pluginManifest = path.join(repoRoot, 'plugin/.claude-plugin/plugin.json');
  const current = (JSON.parse(readFileSync(cliManifest, 'utf8')) as { version: string }).version;
  const plugin = JSON.parse(readFileSync(pluginManifest, 'utf8')) as Record<string, unknown> & {
    version: string;
  };
  const previous = plugin.version;
  if (previous !== current) {
    plugin.version = current; // assignment keeps the key in its original position
    writeFileSync(pluginManifest, JSON.stringify(plugin, null, 2) + '\n');
  }
  return { previous, current };
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { previous, current } = syncPluginVersion(repoRoot);
  console.error(
    previous === current
      ? `plugin.json already at ${current}`
      : `plugin.json ${previous} -> ${current}`,
  );
}
