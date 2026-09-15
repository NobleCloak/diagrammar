import { IconRegistry, openIconSetDir } from '@noblecloak/diagrammar-core';
import { lucide } from '@noblecloak/diagrammar-icons-lucide';
import { simpleIcons } from '@noblecloak/diagrammar-icons-simple-icons';

/** The two open sets the CLI and MCP ship with (spec §5.4). */
export function defaultIconRegistry(): IconRegistry {
  const registry = new IconRegistry();
  registry.register(lucide);
  registry.register(simpleIcons);
  return registry;
}

/** Defaults plus one directory-backed set per `--icons <dir>` (spec §5.5). */
export function registryWithDirs(dirs: readonly string[]): IconRegistry {
  const registry = defaultIconRegistry();
  for (const dir of dirs) registry.register(openIconSetDir(dir));
  return registry;
}
