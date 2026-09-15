import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Under `diagrammar mcp --stdio`, stdout IS the MCP wire: any write to it
// that isn't the framed JSON-RPC message itself corrupts the stream and the
// client disconnects with an opaque parse error. That rules out
// `process.stdout.write(` and every `console.*` method except
// `console.error`/`console.warn`, both of which Node sends to stderr — so
// those two are allow-listed and everything else (`log`, `info`, `debug`,
// `dir`, `table`, `group`, `count`, ...) is flagged. This suite scans every
// source file in this package plus the CLI's `mcp` command and entry point,
// since those are the other places on the stdio path that could write a
// stray diagnostic.
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

const CLI_FILES = [
  path.join(srcDir, '../../cli/src/commands/mcp.ts'),
  path.join(srcDir, '../../cli/src/bin.ts'),
];

const DISALLOWED_CONSOLE_METHOD = /console\.(?!error\b|warn\b)\w+\(/;
const STDOUT_WRITE = /process\.stdout\.write\(/;

describe('packages/mcp (and the CLI stdio path) never write to stdout', () => {
  const files = [...sourceFiles(srcDir), ...CLI_FILES];

  it('scans at least the app, serve, stdio, mcp command and bin modules', () => {
    const names = files.map((f) => path.basename(f));
    expect(names).toEqual(
      expect.arrayContaining(['app.ts', 'serve.ts', 'stdio.ts', 'mcp.ts', 'bin.ts']),
    );
  });

  it.each(files.map((file) => ({ name: path.relative(srcDir, file), file })))(
    '$name has no disallowed console method or process.stdout.write',
    ({ file }) => {
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(DISALLOWED_CONSOLE_METHOD);
      expect(text).not.toMatch(STDOUT_WRITE);
    },
  );
});
