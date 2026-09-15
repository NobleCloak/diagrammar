import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The Claude Code plugin under plugin/ is not an npm package: nothing
// builds or validates it except this suite. It pins the shape Claude Code
// reads (manifest, .mcp.json, skill frontmatter) and the pointer that keeps
// docs/SKILL.md from silently diverging from the canonical skill.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(repoRoot, 'plugin');

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

const cliVersion = readJson(path.join(repoRoot, 'packages/cli/package.json')).version as string;

describe('plugin manifest', () => {
  const manifest = readJson(path.join(pluginDir, '.claude-plugin/plugin.json'));

  it('is named diagrammar', () => {
    expect(manifest.name).toBe('diagrammar');
  });

  it('carries the CLI version', () => {
    expect(manifest.version).toBe(cliVersion);
  });

  it('has a description, license and homepage', () => {
    expect(typeof manifest.description).toBe('string');
    expect(manifest.license).toBe('Apache-2.0');
    expect(manifest.homepage).toBe('https://github.com/NobleCloak/diagrammar');
  });
});

describe('plugin .mcp.json', () => {
  const servers = readJson(path.join(pluginDir, '.mcp.json')) as Record<
    string,
    { command: string; args: string[] }
  >;

  it('declares exactly one server, diagrammar, spawned with npx over stdio', () => {
    expect(Object.keys(servers)).toEqual(['diagrammar']);
    const server = servers.diagrammar!;
    expect(server.command).toBe('npx');
    expect(server.args).toContain('mcp');
    expect(server.args).toContain('--stdio');
    expect(server.args).not.toContain('--root');
  });

  it('pins a caret range of @noblecloak/diagrammar that contains the CLI version', () => {
    const spec = servers.diagrammar!.args.find((a) => a.startsWith('@noblecloak/diagrammar@'));
    expect(spec).toBeDefined();
    const range = spec!.slice('@noblecloak/diagrammar@'.length);
    expect(range).toMatch(/^\^\d+\.\d+$/);
    const [rangeMajor, rangeMinor] = range.slice(1).split('.').map(Number);
    const [major, minor] = cliVersion.split('.').map(Number);
    // Caret semantics: ^0.N pins the minor while major is 0; ^M.N pins the major from 1.0.
    if (major === 0) {
      expect([rangeMajor, rangeMinor]).toEqual([0, minor]);
    } else {
      expect(rangeMajor).toBe(major);
      expect(rangeMinor).toBeLessThanOrEqual(minor!);
    }
  });
});

describe('plugin skill', () => {
  const skillPath = path.join(pluginDir, 'skills/diagrammar/SKILL.md');

  it('exists with name: diagrammar and a non-empty description in its frontmatter', () => {
    expect(existsSync(skillPath)).toBe(true);
    const text = readFileSync(skillPath, 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter![1]).toMatch(/^name: diagrammar$/m);
    expect(frontmatter![1]).toMatch(/^description: \S.+$/m);
  });

  it('docs/SKILL.md is a pointer to the canonical skill', () => {
    const pointer = readFileSync(path.join(repoRoot, 'docs/SKILL.md'), 'utf8');
    expect(pointer).toContain('plugin/skills/diagrammar/SKILL.md');
    expect(pointer.split('\n').length).toBeLessThan(10);
  });
});
