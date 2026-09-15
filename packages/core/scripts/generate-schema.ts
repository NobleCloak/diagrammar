import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateJsonSchema, generateThemeJsonSchema } from '../src/schema/json-schema.js';

const here = dirname(fileURLToPath(import.meta.url));

const schemaDir = join(here, '..', 'schema');
mkdirSync(schemaDir, { recursive: true });
const outputs: Array<[string, Record<string, unknown>]> = [
  ['diagrammar-v1.json', generateJsonSchema()],
  ['diagrammar-theme-v1.json', generateThemeJsonSchema()],
];
for (const [file, schema] of outputs) {
  const outPath = join(schemaDir, file);
  writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}
