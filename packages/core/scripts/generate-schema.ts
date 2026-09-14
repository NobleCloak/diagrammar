import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateJsonSchema } from '../src/schema/json-schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, '..', 'schema', 'diagrammar-v1.json');

mkdirSync(dirname(outPath), { recursive: true });
const schema = generateJsonSchema();
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath}`);
