import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from './render.js';
import { defaultIconRegistry } from '../icons.js';
import type { ToolContext } from '../fs.js';

const FLOWCHART =
  'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\n';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function connectedClient(ctx: ToolContext) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, ctx);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

describe('diagrammar_render', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-render-'));
    await writeFile(join(root, 'f.yaml'), FLOWCHART, 'utf8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns a PNG image block by default', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; data?: string; mimeType?: string }[];
    expect(content[0]!.type).toBe('image');
    expect(content[0]!.mimeType).toBe('image/png');
    const bytes = Buffer.from(content[0]!.data!, 'base64');
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    await client.close();
  });

  it('returns text-only when returnImage is false', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, returnImage: false },
    });
    const content = result.content as { type: string }[];
    expect(content.every((block) => block.type === 'text')).toBe(true);
    await client.close();
  });

  it('returns SVG text for format svg', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, format: 'svg' },
    });
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.type).toBe('text');
    expect(content[0]!.text).toContain('<svg');
    await client.close();
  });

  it('returns Markdown text for format md', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, format: 'md' },
    });
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.type).toBe('text');
    expect(content[0]!.text.length).toBeGreaterThan(0);
    await client.close();
  });

  it('derives the sibling PNG basename from "path" for the md walkthrough image', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { path: 'f.yaml', format: 'md' },
    });
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toContain('(f.png)');
    await client.close();
  });

  it('uses "diagram.png" as the md walkthrough image for inline "source"', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, format: 'md' },
    });
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toContain('(diagram.png)');
    await client.close();
  });

  it('writes to outputPath when given, resolved in root', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, format: 'svg', outputPath: 'out.svg' },
    });
    expect(result.isError).toBeFalsy();
    const onDisk = await readFile(join(root, 'out.svg'), 'utf8');
    expect(onDisk).toContain('<svg');
    await client.close();
  });

  it('ignores outputPath when given under noFs (dropped by the narrower schema) instead of failing', async () => {
    // Agent-ergonomics ruling: under --no-fs, "outputPath" is no longer part
    // of the registered schema at all (see the schema tests below), so a
    // client that sends it anyway just has it silently stripped — the call
    // still succeeds (there's nothing left to fail on), it just never
    // attempts a write.
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, format: 'svg', outputPath: 'out.svg' },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[1]!.text) as { outputPath?: string };
    expect(payload.outputPath).toBeUndefined();
    await client.close();
  });

  it('the payload reports the caller-supplied relative outputPath, never the resolved absolute path (C1)', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, format: 'svg', outputPath: 'out.svg' },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[1]!.text) as { outputPath: string };
    expect(payload.outputPath).toBe('out.svg');
    const fullText = content.map((c) => c.text).join('\n');
    expect(fullText).not.toContain(root);
    await client.close();
  });

  it('returns the SVG text in the payload when format is png, returnImage is false, and no outputPath is given', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, returnImage: false },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[1]!.text) as { svg?: string };
    expect(payload.svg).toBeDefined();
    expect(payload.svg).toContain('<svg');
    await client.close();
  });

  it('omits the svg field when outputPath is given, since the render was not discarded', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, returnImage: false, outputPath: 'out.png' },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const payload = JSON.parse(content[1]!.text) as { svg?: string };
    expect(payload.svg).toBeUndefined();
    await client.close();
  });

  it('excludes path and outputPath from the registered schema under --no-fs', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'diagrammar_render');
    if (tool === undefined) throw new Error('diagrammar_render not found');
    const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties).toBeDefined();
    expect(Object.keys(properties!)).not.toContain('path');
    expect(Object.keys(properties!)).not.toContain('outputPath');
    await client.close();
  });

  it('includes path and outputPath in the registered schema when fs is enabled', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'diagrammar_render');
    if (tool === undefined) throw new Error('diagrammar_render not found');
    const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties).toBeDefined();
    expect(Object.keys(properties!)).toContain('path');
    expect(Object.keys(properties!)).toContain('outputPath');
    await client.close();
  });

  it('renders a theme file referenced relative to the diagram path', async () => {
    await mkdir(join(root, 'themes'), { recursive: true });
    await writeFile(
      join(root, 'themes', 'house.yaml'),
      'diagrammar-theme: 1\nbase: light\npalette:\n  background: "#123456"\n',
      'utf8',
    );
    await writeFile(
      join(root, 't.yaml'),
      'diagrammar: 1\ntype: flowchart\ntheme: ./themes/house.yaml\nnodes:\n  - { id: a }\n',
      'utf8',
    );
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { path: 't.yaml', format: 'svg' },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0]!.text).toContain('#123456');
    await client.close();
  }, 30000);

  it('under --no-fs a theme path fails with asset_fs_disabled, not a crash', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: {
        source:
          'diagrammar: 1\ntype: flowchart\ntheme: ./themes/house.yaml\nnodes:\n  - { id: a }\n',
        format: 'svg',
      },
    });
    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(JSON.parse(content[0]!.text)).toMatchObject({ code: 'asset_fs_disabled' });
    await client.close();
  }, 30000);

  it('accepts any preset for theme and never leaks the root on a bad theme path', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const ok = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, theme: 'colorblind', format: 'svg' },
    });
    expect(ok.isError).toBeFalsy();
    const bad = await client.callTool({
      name: 'diagrammar_render',
      arguments: { source: FLOWCHART, theme: '../../etc/passwd.yaml', format: 'svg' },
    });
    expect(bad.isError).toBe(true);
    const text = (bad.content as { text: string }[])[0]!.text;
    expect(JSON.parse(text)).toMatchObject({ code: 'asset_outside_base' });
    expect(text).not.toContain(root);
    await client.close();
  }, 30000);

  it('renders a set-form icon from the bundled registry', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: {
        source:
          'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, shape: image, icon: lucide/database }\n',
        format: 'svg',
      },
    });
    expect(result.isError).toBeFalsy();
    expect((result.content as { text: string }[])[0]!.text).toContain('<image');
    await client.close();
  }, 30000);

  it('an unknown icon is a tool error with nearest suggestions', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: {
        source: 'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, icon: lucide/databse }\n',
        format: 'svg',
      },
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      code: string;
      message: string;
    };
    expect(payload.code).toBe('icon_unknown');
    expect(payload.message).toContain('database');
    await client.close();
  }, 30000);
});
