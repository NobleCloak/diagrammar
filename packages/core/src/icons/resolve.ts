import type { AssetResolver } from '../assets/resolver.js';
import { DiagrammarError, type ValidationIssue } from '../errors.js';
import type { Diagram } from '../model/types.js';
import { parseIconRef } from './ref.js';
import type { IconRegistry } from './registry.js';
import { sanitizeSvg } from './sanitize.js';
import { svgDataUri } from './set.js';
import type { ResolvedIcons } from './types.js';

interface IconSite {
  key: string;
  path: string;
  ref: string;
}

/** Every element carrying an icon, in file order, with its JSON path. */
export function iconSites(model: Diagram): IconSite[] {
  const sites: IconSite[] = [];
  if (model.type === 'sequence') {
    model.participants.forEach((p, i) => {
      if (p.icon !== undefined)
        sites.push({ key: p.id, path: `participants[${i}].icon`, ref: p.icon });
    });
    return sites;
  }
  model.groups.forEach((g, i) => {
    if (g.icon !== undefined) sites.push({ key: g.id, path: `groups[${i}].icon`, ref: g.icon });
  });
  model.nodes.forEach((n, i) => {
    if (n.icon !== undefined) sites.push({ key: n.id, path: `nodes[${i}].icon`, ref: n.icon });
  });
  return sites;
}

async function resolveOne(
  site: IconSite,
  registry: IconRegistry | undefined,
  resolver: AssetResolver | undefined,
): Promise<string> {
  const parsed = parseIconRef(site.ref);
  if (parsed.kind === 'set') {
    if (registry === undefined) {
      throw new DiagrammarError(
        `${site.path}: icon "${site.ref}" needs an icon set but no icon registry was supplied; pass RenderOptions.icons`,
        'icon_unknown',
      );
    }
    const icon = await registry.resolve(site.ref);
    return svgDataUri(icon.svg);
  }
  if (resolver === undefined) {
    throw new DiagrammarError(
      `${site.path}: icon "${site.ref}" is a file reference but no asset resolver was supplied; pass RenderOptions.resolver`,
      'asset_resolver_missing',
    );
  }
  const bytes = await resolver.read(parsed.path);
  try {
    return svgDataUri(sanitizeSvg(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error instanceof DiagrammarError && error.code === 'icon_invalid') {
      throw new DiagrammarError(`${site.path}: ${error.message}`, 'icon_invalid');
    }
    throw error;
  }
}

/**
 * The resolve step (spec §3.4): turns every `icon:` into a data URI before
 * compile. Sites are resolved sequentially so error order is file order.
 */
export async function resolveIcons(
  model: Diagram,
  registry: IconRegistry | undefined,
  resolver: AssetResolver | undefined,
): Promise<ResolvedIcons> {
  const out = new Map<string, string>();
  for (const site of iconSites(model)) {
    out.set(site.key, await resolveOne(site, registry, resolver));
  }
  return out;
}

/**
 * Async existence/content check the CLI and MCP run after `validate()`
 * (spec §6.3). Without a registry, set-form refs are not checked.
 */
export async function checkIconRefs(
  model: Diagram,
  registry: IconRegistry | undefined,
  resolver: AssetResolver | undefined,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  for (const site of iconSites(model)) {
    if (registry === undefined && parseIconRef(site.ref).kind === 'set') continue;
    try {
      await resolveOne(site, registry, resolver);
    } catch (error) {
      if (error instanceof DiagrammarError) {
        issues.push({ path: site.path, message: error.message });
        continue;
      }
      throw error;
    }
  }
  return issues;
}
