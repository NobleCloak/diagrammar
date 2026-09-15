import { describe, expect, it } from 'vitest';
import { IconRegistry, render, sanitizeSvg } from '@noblecloak/diagrammar-core';
import { simpleIcons } from './index.js';

describe('@noblecloak/diagrammar-icons-simple-icons', () => {
  it('has the expected metadata and a plausible icon count', async () => {
    expect(simpleIcons.id).toBe('simple-icons');
    expect(simpleIcons.version).toBe('16.31.0');
    expect(simpleIcons.license.spdx).toBe('CC0-1.0');
    await simpleIcons.load();
    const names = simpleIcons.names();
    expect(names.length).toBeGreaterThan(3000);
    expect(names.length).toBeLessThan(6000);
    expect([...names].sort()).toEqual([...names]);
    expect(new Set(names).size).toBe(names.length);
    expect(simpleIcons.get('postgresql')).toContain('<svg');
    expect(simpleIcons.aliases('postgresql')).toContain('PostgreSQL');
    expect(simpleIcons.names().some((n) => /^(aws|amazon)/.test(n))).toBe(false);
  });

  it('every icon is already sanitized (idempotent under the sanitizer)', async () => {
    await simpleIcons.load();
    for (const name of simpleIcons.names()) {
      const svg = simpleIcons.get(name) ?? '';
      expect(sanitizeSvg(svg)).toBe(svg);
    }
  });

  it('a deterministic sample of 25 icons renders through the real engine', async () => {
    await simpleIcons.load();
    const names = simpleIcons.names();
    const step = Math.max(1, Math.floor(names.length / 25));
    const sample = names.filter((_, i) => i % step === 0).slice(0, 25);
    const yaml =
      'diagrammar: 1\ntype: flowchart\nnodes:\n' +
      sample.map((n, i) => `  - { id: n${i}, shape: image, icon: simple-icons/${n} }\n`).join('');
    const icons = new IconRegistry();
    icons.register(simpleIcons);
    const result = await render(yaml, { format: 'png', icons });
    expect(result.bytes.length).toBeGreaterThan(1000);
  }, 60000);
});
