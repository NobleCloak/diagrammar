import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncPluginVersion } from './sync-plugin-version.js';

let root: string;

// Mirrors the real plugin/.mcp.json byte for byte: 2-space JSON with the
// `args` array kept on one line (JSON.stringify would break it across
// lines, so this is written out directly rather than serialized).
const MCP_JSON = (spec: string): string =>
  `{\n  "diagrammar": {\n    "command": "npx",\n    "args": ["-y", "${spec}", "mcp", "--stdio"]\n  }\n}\n`;

async function writeFixture(cliVersion: string): Promise<void> {
  await writeFile(
    path.join(root, 'packages/cli/package.json'),
    JSON.stringify({ name: '@noblecloak/diagrammar', version: cliVersion }, null, 2) + '\n',
  );
  await writeFile(
    path.join(root, 'plugin/.claude-plugin/plugin.json'),
    JSON.stringify({ name: 'diagrammar', version: '0.2.0', license: 'Apache-2.0' }, null, 2) + '\n',
  );
  await writeFile(path.join(root, 'plugin/.mcp.json'), MCP_JSON('@noblecloak/diagrammar@^0.2'));
  await writeFile(
    path.join(root, 'README.md'),
    'Spawn it yourself:\n\n```\nnpx -y @noblecloak/diagrammar@^0.2 mcp --stdio\n```\n',
  );
  await writeFile(
    path.join(root, 'plugin/README.md'),
    '# plugin\n\nNo npx line in this fixture.\n',
  );
  await writeFile(
    path.join(root, 'plugin/skills/diagrammar/SKILL.md'),
    '---\nname: diagrammar\n---\n\n`npx -y @noblecloak/diagrammar@^0.2 mcp --stdio`\n',
  );
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'diagrammar-sync-'));
  await mkdir(path.join(root, 'packages/cli'), { recursive: true });
  await mkdir(path.join(root, 'plugin/.claude-plugin'), { recursive: true });
  await mkdir(path.join(root, 'plugin/skills/diagrammar'), { recursive: true });
  await writeFixture('0.3.0');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('syncPluginVersion', () => {
  it('copies the CLI version into plugin.json, keeping key order and the trailing newline', async () => {
    const result = syncPluginVersion(root);
    expect(result).toEqual({ previous: '0.2.0', current: '0.3.0', range: '^0.3' });
    const text = await readFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), 'utf8');
    expect(text).toBe(
      JSON.stringify({ name: 'diagrammar', version: '0.3.0', license: 'Apache-2.0' }, null, 2) +
        '\n',
    );
  });

  it('changes only the version token in a Prettier-formatted plugin.json', async () => {
    // What Prettier actually emits for the real manifest: `author` and
    // `keywords` on one line each. JSON.stringify would explode both across
    // lines and fail `format:check` on the bot's Version Packages PR.
    const pretty = (version: string): string =>
      `{\n  "name": "diagrammar",\n  "version": "${version}",\n  "author": { "name": "NobleCloak", "url": "https://github.com/NobleCloak" },\n  "keywords": ["diagram", "mcp"]\n}\n`;
    await writeFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), pretty('0.2.0'));
    const result = syncPluginVersion(root);
    expect(result).toEqual({ previous: '0.2.0', current: '0.3.0', range: '^0.3' });
    const text = await readFile(path.join(root, 'plugin/.claude-plugin/plugin.json'), 'utf8');
    expect(text).toBe(pretty('0.3.0'));
  });

  it('rewrites the npx caret range in .mcp.json and every doc, and nothing else', async () => {
    syncPluginVersion(root);

    const mcpJson = await readFile(path.join(root, 'plugin/.mcp.json'), 'utf8');
    expect(mcpJson).toBe(MCP_JSON('@noblecloak/diagrammar@^0.3'));

    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    expect(readme).toBe(
      'Spawn it yourself:\n\n```\nnpx -y @noblecloak/diagrammar@^0.3 mcp --stdio\n```\n',
    );

    const skill = await readFile(path.join(root, 'plugin/skills/diagrammar/SKILL.md'), 'utf8');
    expect(skill).toBe(
      '---\nname: diagrammar\n---\n\n`npx -y @noblecloak/diagrammar@^0.3 mcp --stdio`\n',
    );
  });

  it('leaves a doc with no @noblecloak/diagrammar@ occurrence untouched', async () => {
    const before = await readFile(path.join(root, 'plugin/README.md'), 'utf8');
    syncPluginVersion(root);
    const after = await readFile(path.join(root, 'plugin/README.md'), 'utf8');
    expect(after).toBe(before);
    expect(after).toBe('# plugin\n\nNo npx line in this fixture.\n');
  });

  it('pins the caret range to the major once it reaches 1.0', async () => {
    await writeFixture('1.4.2');
    const result = syncPluginVersion(root);
    expect(result.range).toBe('^1.0');
    const mcpJson = await readFile(path.join(root, 'plugin/.mcp.json'), 'utf8');
    expect(mcpJson).toBe(MCP_JSON('@noblecloak/diagrammar@^1.0'));
  });

  it('is idempotent', async () => {
    syncPluginVersion(root);
    const files = [
      'plugin/.claude-plugin/plugin.json',
      'plugin/.mcp.json',
      'README.md',
      'plugin/README.md',
      'plugin/skills/diagrammar/SKILL.md',
    ];
    const before = await Promise.all(files.map((f) => readFile(path.join(root, f), 'utf8')));
    expect(syncPluginVersion(root)).toEqual({ previous: '0.3.0', current: '0.3.0', range: '^0.3' });
    const after = await Promise.all(files.map((f) => readFile(path.join(root, f), 'utf8')));
    expect(after).toEqual(before);
  });
});
