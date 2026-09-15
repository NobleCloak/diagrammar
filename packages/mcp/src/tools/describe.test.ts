import { describe as vDescribe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from './describe.js';
import { defaultIconRegistry } from '../icons.js';
import type { ToolContext } from '../fs.js';

const FLOWCHART =
  'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\n';

async function connectedClient(ctx: ToolContext): Promise<Client> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, ctx);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

vDescribe('diagrammar_describe', () => {
  it('describes inline source, omitting raw source by default', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { source: FLOWCHART },
    });
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      type: string;
      valid: boolean;
      source?: string;
    };
    expect(parsed.type).toBe('flowchart');
    expect(parsed.valid).toBe(true);
    expect(parsed.source).toBeUndefined();
    await client.close();
  });

  it('includes raw source when includeSource is true', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { source: FLOWCHART, includeSource: true },
    });
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      source?: string;
    };
    expect(parsed.source).toBe(FLOWCHART);
    await client.close();
  });

  it('rejects when both source and path are given', async () => {
    // Needs an fs-enabled client: under --no-fs, "path" is no longer part of
    // the registered schema at all (see the no-fs schema tests below), so
    // sending it alongside "source" would just have it silently dropped
    // rather than exercise this XOR check.
    const client = await connectedClient({
      root: process.cwd(),
      noFs: false,
      icons: defaultIconRegistry(),
    });
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { source: FLOWCHART, path: 'x.yaml' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('reports valid: false with issues for a schema-invalid diagram, as a successful call', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const INVALID = 'diagrammar: 1\ntype: flowchart\nnodes: []\nedges:\n  - { from: a, to: b }\n';
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { source: INVALID },
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      valid: boolean;
      issues: unknown[];
    };
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.length).toBeGreaterThan(0);
    await client.close();
  });

  it('excludes path from the registered schema under --no-fs', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'diagrammar_describe');
    if (tool === undefined) throw new Error('diagrammar_describe not found');
    const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties).toBeDefined();
    expect(Object.keys(properties!)).not.toContain('path');
    await client.close();
  });

  it('includes path in the registered schema when fs is enabled', async () => {
    const client = await connectedClient({
      root: process.cwd(),
      noFs: false,
      icons: defaultIconRegistry(),
    });
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'diagrammar_describe');
    if (tool === undefined) throw new Error('diagrammar_describe not found');
    const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties).toBeDefined();
    expect(Object.keys(properties!)).toContain('path');
    await client.close();
  });
});

vDescribe('diagrammar_describe unmapped errno handling (C2)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-describe-errno-'));
    await writeFile(join(root, 'ok.yaml'), FLOWCHART, 'utf8');
    await mkdir(join(root, 'sub'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('ENOTDIR (a path segment is a file, not a directory) is a sanitised io_error envelope with no host path', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { path: 'ok.yaml/nested.yaml' },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]!.text;
    const parsed = JSON.parse(text) as { code: string; message: string };
    expect(parsed.code).toBe('io_error');
    expect(text).not.toContain('/Users/');
    expect(text).not.toContain('/private/');
    expect(text).not.toContain(root);
    await client.close();
  });

  it('EISDIR (the path is a directory, not a file) is a sanitised io_error envelope with no host path', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { path: 'sub' },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]!.text;
    const parsed = JSON.parse(text) as { code: string; message: string };
    expect(parsed.code).toBe('io_error');
    expect(text).not.toContain('/Users/');
    expect(text).not.toContain('/private/');
    expect(text).not.toContain(root);
    await client.close();
  });
});
