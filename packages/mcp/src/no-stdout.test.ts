import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Under `diagrammar mcp --stdio`, stdout IS the MCP wire: one stray
// `console.log` corrupts the JSON-RPC stream and the client disconnects with
// an opaque parse error. Every diagnostic in this package goes to stderr.
const srcDir = path.dirname(fileURLToPath(import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('packages/mcp never writes to stdout', () => {
  const files = sourceFiles(srcDir);

  it('scans at least the app, serve and stdio modules', () => {
    const names = files.map((f) => path.basename(f));
    expect(names).toEqual(expect.arrayContaining(['app.ts', 'serve.ts', 'stdio.ts']));
  });

  it.each(files.map((file) => ({ name: path.relative(srcDir, file), file })))(
    '$name has no console.log or process.stdout.write',
    ({ file }) => {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/console\.log\(/);
      expect(text).not.toMatch(/process\.stdout\.write\(/);
    },
  );
});
