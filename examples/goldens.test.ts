import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, parse, walkthrough, fileResolver } from '@noblecloak/diagrammar-core';

const examplesDir = path.dirname(fileURLToPath(import.meta.url));
const goldensDir = path.join(examplesDir, 'goldens');
const resolver = fileResolver(examplesDir);

async function loadExample(name: string): Promise<string> {
  return readFile(path.join(examplesDir, name), 'utf-8');
}

async function loadGolden(name: string): Promise<Buffer> {
  return readFile(path.join(goldensDir, name));
}

const STEMS = ['flowchart', 'architecture', 'sequence', 'annotated', 'themed'];

describe('render goldens', () => {
  for (const stem of STEMS) {
    it(`${stem}.yaml renders byte-identical to its committed SVG and PNG goldens`, async () => {
      const yaml = await loadExample(`${stem}.yaml`);

      const svgResult = await render(yaml, { format: 'svg', resolver });
      const expectedSvg = await loadGolden(`${stem}.svg`);
      expect(Buffer.from(svgResult.svg, 'utf-8').equals(expectedSvg)).toBe(true);

      const pngResult = await render(yaml, { format: 'png', resolver });
      const expectedPng = await loadGolden(`${stem}.png`);
      expect(Buffer.from(pngResult.bytes).equals(expectedPng)).toBe(true);
    });

    it(`${stem}.yaml's walkthrough is byte-identical to its committed Markdown golden`, async () => {
      const yaml = await loadExample(`${stem}.yaml`);

      const md = walkthrough(yaml, { imagePath: `${stem}.png` });
      const expectedMd = await loadGolden(`${stem}.md`);
      expect(Buffer.from(md, 'utf-8').equals(expectedMd)).toBe(true);
    });
  }

  it('annotated.yaml renders byte-identical per-view goldens', async () => {
    const yaml = await loadExample('annotated.yaml');
    const parsed = parse(yaml);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    for (const view of parsed.diagram.views) {
      const svgResult = await render(yaml, { format: 'svg', view: view.id, resolver });
      const expectedSvg = await loadGolden(`annotated.${view.id}.svg`);
      expect(Buffer.from(svgResult.svg, 'utf-8').equals(expectedSvg)).toBe(true);

      const pngResult = await render(yaml, { format: 'png', view: view.id, resolver });
      const expectedPng = await loadGolden(`annotated.${view.id}.png`);
      expect(Buffer.from(pngResult.bytes).equals(expectedPng)).toBe(true);
    }
  });
});
