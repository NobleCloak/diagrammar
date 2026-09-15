import { describe, expect, it } from 'vitest';
import { IconRegistry, rankMatches } from './registry.js';
import { memoryIconSet } from './set.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>';
function registry(): IconRegistry {
  const r = new IconRegistry();
  r.register(
    memoryIconSet(
      'lucide',
      { database: SVG, 'database-zap': SVG, server: SVG, cloud: SVG },
      { server: ['host', 'cloud-server'] },
    ),
  );
  r.register(
    memoryIconSet('brands', { postgresql: SVG, kubernetes: SVG }, { postgresql: ['postgres'] }),
  );
  return r;
}

describe('rankMatches (spec §5.2)', () => {
  it('ranks exact, prefix, substring, alias exact, alias partial; ties by name', () => {
    const names = ['database', 'database-zap', 'server', 'cloud', 'mydatabase'];
    const aliases = (n: string): readonly string[] => (n === 'server' ? ['database-host'] : []);
    expect(rankMatches(names, aliases, 'DATABASE')).toEqual([
      { name: 'database', rank: 1 },
      { name: 'database-zap', rank: 2 },
      { name: 'mydatabase', rank: 3 },
      { name: 'server', rank: 5 },
    ]);
    expect(rankMatches(names, aliases, 'database-host')).toEqual([{ name: 'server', rank: 4 }]);
  });
});

describe('IconRegistry', () => {
  it('rejects a duplicate set id', () => {
    const r = registry();
    expect(() => r.register(memoryIconSet('lucide', {}))).toThrowError(
      expect.objectContaining({ code: 'icon_set_invalid' }),
    );
  });
  it('lists sets in registration order and finds by id', () => {
    const r = registry();
    expect(r.sets().map((s) => s.id)).toEqual(['lucide', 'brands']);
    expect(r.get('brands')?.id).toBe('brands');
    expect(r.get('nope')).toBeUndefined();
  });
  it('resolves a set ref to a loaded svg', async () => {
    const icon = await registry().resolve('lucide/database');
    expect(icon.name).toBe('database');
    expect(icon.set.id).toBe('lucide');
    expect(icon.svg).toBe(SVG);
  });
  it('rejects an unknown set with icon_unknown listing the registered sets', async () => {
    await expect(registry().resolve('aws/lambda')).rejects.toMatchObject({
      code: 'icon_unknown',
      message: 'unknown icon set "aws" in "aws/lambda"; registered sets: lucide, brands',
    });
  });
  it('rejects an unknown name with icon_unknown naming up to five nearest names', async () => {
    await expect(registry().resolve('lucide/databse')).rejects.toMatchObject({
      code: 'icon_unknown',
      message: 'unknown icon "lucide/databse"; nearest in lucide: database',
    });
  });
  it('rejects a path form passed to resolve', async () => {
    await expect(registry().resolve('./x.svg')).rejects.toMatchObject({ code: 'icon_invalid' });
  });
  it('searches across sets, ranked then by set id then name, with a limit', async () => {
    const r = registry();
    expect(await r.search('data')).toEqual([
      { set: 'lucide', name: 'database', rank: 2 },
      { set: 'lucide', name: 'database-zap', rank: 2 },
    ]);
    expect(await r.search('postgres')).toEqual([{ set: 'brands', name: 'postgresql', rank: 2 }]);
    expect(await r.search('e', { limit: 2 })).toHaveLength(2);
    expect(await r.search('cloud', { set: 'lucide' })).toEqual([
      { set: 'lucide', name: 'cloud', rank: 1 },
      { set: 'lucide', name: 'server', rank: 5 },
    ]);
  });
  it('search on an unknown set is icon_unknown', async () => {
    await expect(registry().search('x', { set: 'nope' })).rejects.toMatchObject({
      code: 'icon_unknown',
    });
  });
  it('nearest falls back to prefix-of-query and edit-distance candidates when nothing matches', async () => {
    const r = registry();
    expect(await r.nearest('lucide', 'databse')).toEqual(['database']);
    expect(await r.nearest('lucide', 'zzzz')).toEqual([]);
  });
});
