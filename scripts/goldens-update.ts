import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, parse, walkthrough, shutdown } from '@noblecloak/diagrammar-core';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(rootDir, '..', 'examples');
const goldensDir = path.join(examplesDir, 'goldens');

async function main(): Promise<void> {
  await mkdir(goldensDir, { recursive: true });
  const files = (await readdir(examplesDir)).filter((f) => f.endsWith('.yaml')).sort();

  for (const file of files) {
    const stem = file.replace(/\.yaml$/, '');
    const yaml = await readFile(path.join(examplesDir, file), 'utf-8');
    const parsed = parse(yaml);
    if (!parsed.ok) {
      throw new Error(`${file} failed to parse: ${JSON.stringify(parsed.issues)}`);
    }

    const svgResult = await render(yaml, { format: 'svg' });
    await writeFile(path.join(goldensDir, `${stem}.svg`), svgResult.svg, 'utf-8');

    const pngResult = await render(yaml, { format: 'png' });
    await writeFile(path.join(goldensDir, `${stem}.png`), pngResult.bytes);

    const md = walkthrough(yaml, { imagePath: `${stem}.png` });
    await writeFile(path.join(goldensDir, `${stem}.md`), md, 'utf-8');

    for (const view of parsed.diagram.views) {
      const viewSvg = await render(yaml, { format: 'svg', view: view.id });
      await writeFile(path.join(goldensDir, `${stem}.${view.id}.svg`), viewSvg.svg, 'utf-8');

      const viewPng = await render(yaml, { format: 'png', view: view.id });
      await writeFile(path.join(goldensDir, `${stem}.${view.id}.png`), viewPng.bytes);
    }

    console.log(`updated goldens for ${file}`);
  }

  await shutdown();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
