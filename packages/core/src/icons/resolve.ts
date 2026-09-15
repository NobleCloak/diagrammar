import type { AssetResolver } from '../assets/resolver.js';
import { DiagrammarError, type ValidationIssue } from '../errors.js';
import type { Diagram } from '../model/types.js';
import { parseIconRef, type IconRef } from './ref.js';
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

/**
 * Reads and sanitizes a path-form icon exactly once per distinct `path`
 * within one `resolveIcons`/`checkIconRefs` call, memoized in `cache`: N
 * sites sharing e.g. `./icons/x.svg` share one `resolver.read` + sanitize.
 * `cache` is created fresh per top-level call, so nothing leaks between
 * diagrams. The stored promise's rejection (if any) is the unwrapped
 * sanitizer/resolver error — each caller still wraps it with its own
 * site's path below, so two sites sharing a bad file each get their own
 * `nodes[i].icon`-prefixed message.
 */
function resolvePathForm(
  path: string,
  resolver: AssetResolver,
  cache: Map<string, Promise<string>>,
): Promise<string> {
  let cached = cache.get(path);
  if (cached === undefined) {
    cached = (async () => {
      const bytes = await resolver.read(path);
      return svgDataUri(sanitizeSvg(new TextDecoder().decode(bytes)));
    })();
    cache.set(path, cached);
  }
  return cached;
}

/** Resolves one site's already-parsed ref to a data URI. */
async function resolveParsed(
  site: IconSite,
  parsed: IconRef,
  registry: IconRegistry | undefined,
  resolver: AssetResolver | undefined,
  cache: Map<string, Promise<string>>,
): Promise<string> {
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
  try {
    return await resolvePathForm(parsed.path, resolver, cache);
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
  const cache = new Map<string, Promise<string>>();
  for (const site of iconSites(model)) {
    const parsed = parseIconRef(site.ref);
    out.set(site.key, await resolveParsed(site, parsed, registry, resolver, cache));
  }
  return out;
}

/**
 * Async existence/content check the CLI and MCP run after `validate()`
 * (spec §6.3). Without a registry, set-form refs are not checked. Each
 * site's ref is parsed once, inside the `try`: a malformed ref on a
 * hand-built model (bypassing `parse()`'s schema check) becomes an issue
 * at that site's path instead of throwing out of the whole check.
 */
export async function checkIconRefs(
  model: Diagram,
  registry: IconRegistry | undefined,
  resolver: AssetResolver | undefined,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const cache = new Map<string, Promise<string>>();
  for (const site of iconSites(model)) {
    try {
      const parsed = parseIconRef(site.ref);
      if (registry === undefined && parsed.kind === 'set') continue;
      await resolveParsed(site, parsed, registry, resolver, cache);
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
