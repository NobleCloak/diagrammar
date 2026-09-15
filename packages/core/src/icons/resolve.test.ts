import { describe, expect, it } from 'vitest';
import { memoryResolver } from '../assets/resolver.js';
import { parse } from '../parse.js';
import { IconRegistry } from './registry.js';
import { checkIconRefs, resolveIcons } from './resolve.js';
import { memoryIconSet, svgDataUri } from './set.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect/></svg>';
const RAW = '<!-- c --><svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect/></svg>';
const CLEAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect/></svg>';

function model(yaml: string) {
  const p = parse(yaml);
  if (!p.ok) throw new Error(JSON.stringify(p.issues));
  return p.diagram;
}
const registry = new IconRegistry();
registry.register(memoryIconSet('lucide', { database: SVG, cloud: SVG }));

describe('resolveIcons', () => {
  it('returns an empty map for a diagram without icons', async () => {
    expect(
      (
        await resolveIcons(
          model('diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n'),
          registry,
          undefined,
        )
      ).size,
    ).toBe(0);
  });
  it('maps every node, group and participant icon to a data URI', async () => {
    const g = await resolveIcons(
      model(
        'diagrammar: 1\ntype: architecture\ngroups:\n  - { id: g, icon: lucide/cloud }\nnodes:\n  - { id: a, in: g, icon: lucide/database }\n  - { id: b }\n',
      ),
      registry,
      undefined,
    );
    expect([...g.keys()]).toEqual(['g', 'a']);
    expect(g.get('a')).toBe(svgDataUri(SVG));
    const s = await resolveIcons(
      model('diagrammar: 1\ntype: sequence\nparticipants:\n  - { id: u, icon: lucide/database }\n'),
      registry,
      undefined,
    );
    expect(s.get('u')).toBe(svgDataUri(SVG));
  });
  it('reads and sanitizes a path icon through the resolver', async () => {
    const r = memoryResolver({ 'icons/x.svg': RAW });
    const m = await resolveIcons(
      model('diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, icon: ./icons/x.svg }\n'),
      registry,
      r,
    );
    expect(m.get('a')).toBe(svgDataUri(CLEAN));
  });
  it('fails with icon_unknown when a set ref is used and no registry is supplied', async () => {
    await expect(
      resolveIcons(
        model('diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, icon: lucide/database }\n'),
        undefined,
        undefined,
      ),
    ).rejects.toMatchObject({
      code: 'icon_unknown',
      message: expect.stringContaining('no icon registry') as string,
    });
  });
  it('fails with asset_resolver_missing for a path ref without a resolver', async () => {
    await expect(
      resolveIcons(
        model('diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, icon: ./x.svg }\n'),
        registry,
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'asset_resolver_missing' });
  });
  it('propagates sanitizer rejections as icon_invalid naming the element', async () => {
    const r = memoryResolver({
      'x.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script/></svg>',
    });
    await expect(
      resolveIcons(
        model('diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, icon: ./x.svg }\n'),
        registry,
        r,
      ),
    ).rejects.toMatchObject({
      code: 'icon_invalid',
      message: expect.stringContaining('nodes[0].icon') as string,
    });
  });
});

describe('checkIconRefs', () => {
  it('returns no issues for resolvable refs and skips set refs when no registry is given', async () => {
    const m = model(
      'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, icon: lucide/database }\n',
    );
    expect(await checkIconRefs(m, registry, undefined)).toEqual([]);
    expect(await checkIconRefs(m, undefined, undefined)).toEqual([]);
  });
  it('reports each failing element at its own path and keeps going', async () => {
    const m = model(
      'diagrammar: 1\ntype: architecture\ngroups:\n  - { id: g, icon: lucide/nope }\nnodes:\n  - { id: a, icon: lucide/database }\n  - { id: b, icon: ./missing.svg }\n',
    );
    const issues = await checkIconRefs(m, registry, memoryResolver({}));
    expect(issues.map((i) => i.path)).toEqual(['groups[0].icon', 'nodes[1].icon']);
    expect(issues[0]?.message).toContain('unknown icon "lucide/nope"');
    expect(issues[1]?.message).toContain('not found');
  });
});
