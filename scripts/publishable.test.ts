import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// C1: npm rejects a published manifest whose dependency ranges still carry
// Bun's `workspace:` protocol — `npm pack` (and a real `npm publish`) leaves
// the value as literal text, which no installer outside this workspace can
// resolve. Changesets' `fixed` group + `updateInternalDependencies: "patch"`
// (.changeset/config.json) keeps these ranges (currently `^0.1.0`) in
// lockstep with the packages' own versions on every release, so this guard
// never needs a matching manual bump.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PUBLISHED_MANIFESTS = [
  path.join(repoRoot, 'packages/core/package.json'),
  path.join(repoRoot, 'packages/mcp/package.json'),
  path.join(repoRoot, 'packages/cli/package.json'),
];

function readManifest(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
}

function dependencyValues(manifest: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies'] as const) {
    const section = manifest[field];
    if (typeof section !== 'object' || section === null) continue;
    for (const value of Object.values(section as Record<string, unknown>)) {
      if (typeof value === 'string') values.push(value);
    }
  }
  return values;
}

describe('published package manifests carry no workspace: protocol ranges', () => {
  for (const file of PUBLISHED_MANIFESTS) {
    const name = path.relative(repoRoot, file);

    it(`${name} has no "workspace:" dependency value`, () => {
      const manifest = readManifest(file);
      const offenders = dependencyValues(manifest).filter((value) =>
        value.startsWith('workspace:'),
      );
      expect(offenders, `found workspace: ranges in ${name}: ${JSON.stringify(offenders)}`).toEqual(
        [],
      );
    });
  }
});
