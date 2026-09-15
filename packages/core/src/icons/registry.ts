import { DiagrammarError } from '../errors.js';
import { parseIconRef } from './ref.js';
import type { IconMatch, IconSet, ResolvedIcon } from './types.js';

type Rank = IconMatch['rank'];

/**
 * Spec §5.2 ranking. Case-insensitive; a name gets its best rank only.
 * Ties are broken by name so the order is deterministic.
 */
export function rankMatches(
  names: readonly string[],
  aliasesOf: (name: string) => readonly string[],
  query: string,
): Array<{ name: string; rank: Rank }> {
  const q = query.toLowerCase();
  const out: Array<{ name: string; rank: Rank }> = [];
  for (const name of names) {
    const n = name.toLowerCase();
    let rank: Rank | undefined;
    if (n === q) rank = 1;
    else if (n.startsWith(q)) rank = 2;
    else if (n.includes(q)) rank = 3;
    else {
      const aliases = aliasesOf(name).map((a) => a.toLowerCase());
      if (aliases.includes(q)) rank = 4;
      else if (aliases.some((a) => a.startsWith(q) || a.includes(q))) rank = 5;
    }
    if (rank !== undefined) out.push({ name, rank });
  }
  return out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

/** Damerau-free Levenshtein, small inputs only (icon names). */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min((prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[b.length] ?? 0;
}

export class IconRegistry {
  private readonly byId = new Map<string, IconSet>();

  register(set: IconSet): void {
    if (this.byId.has(set.id)) {
      throw new DiagrammarError(`icon set "${set.id}" is already registered`, 'icon_set_invalid');
    }
    this.byId.set(set.id, set);
  }

  sets(): readonly IconSet[] {
    return [...this.byId.values()];
  }

  get(id: string): IconSet | undefined {
    return this.byId.get(id);
  }

  private requireSet(id: string, ref: string): IconSet {
    const set = this.byId.get(id);
    if (set === undefined) {
      const ids = [...this.byId.keys()].join(', ');
      throw new DiagrammarError(
        `unknown icon set "${id}" in "${ref}"; registered sets: ${ids.length > 0 ? ids : '(none)'}`,
        'icon_unknown',
      );
    }
    return set;
  }

  /** Resolves a set-form reference; the path form is the resolver's job (see resolve.ts). */
  async resolve(ref: string): Promise<ResolvedIcon> {
    const parsed = parseIconRef(ref);
    if (parsed.kind === 'path') {
      throw new DiagrammarError(`"${ref}" is a file path, not a set reference`, 'icon_invalid');
    }
    const set = this.requireSet(parsed.set, ref);
    await set.load();
    const svg = set.get(parsed.name);
    if (svg === undefined) {
      const nearest = await this.nearest(parsed.set, parsed.name);
      const hint = nearest.length > 0 ? `; nearest in ${parsed.set}: ${nearest.join(', ')}` : '';
      throw new DiagrammarError(`unknown icon "${ref}"${hint}`, 'icon_unknown');
    }
    return { set, name: parsed.name, svg };
  }

  async search(query: string, opts: { set?: string; limit?: number } = {}): Promise<IconMatch[]> {
    const limit = opts.limit ?? 20;
    const sets = opts.set !== undefined ? [this.requireSet(opts.set, opts.set)] : this.sets();
    const matches: IconMatch[] = [];
    for (const set of sets) {
      await set.load();
      for (const m of rankMatches(set.names(), (n) => set.aliases(n), query)) {
        matches.push({ set: set.id, name: m.name, rank: m.rank });
      }
    }
    matches.sort(
      (a, b) => a.rank - b.rank || a.set.localeCompare(b.set) || a.name.localeCompare(b.name),
    );
    return matches.slice(0, limit);
  }

  /**
   * Suggestions for an unknown name: ranked substring/alias matches first,
   * then names within edit distance 2, up to `limit` (spec §5.2, default 5).
   */
  async nearest(setId: string, name: string, limit = 5): Promise<string[]> {
    const set = this.requireSet(setId, `${setId}/${name}`);
    await set.load();
    const out: string[] = [];
    for (const m of rankMatches(set.names(), (n) => set.aliases(n), name)) {
      if (!out.includes(m.name)) out.push(m.name);
    }
    if (out.length < limit) {
      const q = name.toLowerCase();
      const close = set
        .names()
        .filter(
          (n) =>
            !out.includes(n) &&
            Math.abs(n.length - q.length) <= 2 &&
            editDistance(n.toLowerCase(), q) <= 2,
        )
        .sort((a, b) => a.localeCompare(b));
      out.push(...close);
    }
    return out.slice(0, limit);
  }
}
