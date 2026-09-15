import { describe, expect, it } from 'vitest';
import { IconRegistry, render, sanitizeSvg } from '@noblecloak/diagrammar-core';
import { lucide } from './index.js';

describe('@noblecloak/diagrammar-icons-lucide', () => {
  it('has the expected metadata and a plausible icon count', async () => {
    expect(lucide.id).toBe('lucide');
    expect(lucide.version).toBe('1.46.0');
    expect(lucide.license.spdx).toBe('ISC');
    await lucide.load();
    const names = lucide.names();
    expect(names.length).toBeGreaterThan(1500);
    expect(names.length).toBeLessThan(4000);
    expect([...names].sort()).toEqual([...names]);
    expect(new Set(names).size).toBe(names.length);
    expect(lucide.get('database')).toContain('<svg');
    expect(lucide.aliases('database')).toContain('storage');
  });

  it('every icon is already sanitized (idempotent under the sanitizer)', async () => {
    await lucide.load();
    for (const name of lucide.names()) {
      const svg = lucide.get(name) ?? '';
      expect(sanitizeSvg(svg)).toBe(svg);
    }
  });

  it('a deterministic sample of 25 icons renders through the real engine', async () => {
    await lucide.load();
    const names = lucide.names();
    const step = Math.max(1, Math.floor(names.length / 25));
    const sample = names.filter((_, i) => i % step === 0).slice(0, 25);
    const yaml =
      'diagrammar: 1\ntype: flowchart\nnodes:\n' +
      sample.map((n, i) => `  - { id: n${i}, shape: image, icon: lucide/${n} }\n`).join('');
    const icons = new IconRegistry();
    icons.register(lucide);
    const result = await render(yaml, { format: 'png', icons });
    expect(result.bytes.length).toBeGreaterThan(1000);
  }, 60000);
});
