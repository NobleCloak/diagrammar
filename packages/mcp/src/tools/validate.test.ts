import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from './validate.js';
import { defaultIconRegistry } from '../icons.js';
import type { ToolContext } from '../fs.js';

const VALID =
  'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\n';
const INVALID = 'diagrammar: 1\ntype: flowchart\nnodes: []\nedges:\n  - { from: a, to: b }\n';

async function connectedClient(ctx: ToolContext): Promise<Client> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, ctx);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

describe('diagrammar_validate', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-validate-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reports ok: true for a valid diagram, as a successful (non-error) call', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const result = await client.callTool({
      name: 'diagrammar_validate',
      arguments: { source: VALID },
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      ok: boolean;
      issues: unknown[];
    };
    expect(parsed).toEqual({ ok: true, issues: [] });
    await client.close();
  });

  it('reports ok: false with issues for an invalid diagram, still as a successful call', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const result = await client.callTool({
      name: 'diagrammar_validate',
      arguments: { source: INVALID },
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      ok: boolean;
      issues: unknown[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.issues.length).toBeGreaterThan(0);
    await client.close();
  });

  it('is a tool error (isError: true) when neither source nor path is given', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const result = await client.callTool({ name: 'diagrammar_validate', arguments: {} });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('excludes path from the registered schema under --no-fs', async () => {
    const client = await connectedClient({
      root: undefined,
      noFs: true,
      icons: defaultIconRegistry(),
    });
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'diagrammar_validate');
    if (tool === undefined) throw new Error('diagrammar_validate not found');
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
    const tool = tools.tools.find((t) => t.name === 'diagrammar_validate');
    if (tool === undefined) throw new Error('diagrammar_validate not found');
    const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties).toBeDefined();
    expect(Object.keys(properties!)).toContain('path');
    await client.close();
  });

  it('reports a broken theme file as an issue at "theme" while still returning ok:false, not a tool error', async () => {
    await writeFile(join(root, 'house.yaml'), 'diagrammar-theme: 1\nbase: neon\n', 'utf8');
    await writeFile(
      join(root, 't.yaml'),
      'diagrammar: 1\ntype: flowchart\ntheme: ./house.yaml\nnodes:\n  - { id: a }\n',
      'utf8',
    );
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_validate',
      arguments: { path: 't.yaml' },
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      ok: boolean;
      issues: { path: string; message: string }[];
    };
    expect(payload.ok).toBe(false);
    expect(payload.issues[0]).toMatchObject({ path: 'theme' });
    expect(payload.issues[0]!.message).toContain('house.yaml');
    await client.close();
  });

  it('reports an unknown icon as an issue at nodes[i].icon (ok:false, not a tool error)', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_validate',
      arguments: {
        source: 'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a, icon: lucide/nope-nope }\n',
      },
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      ok: boolean;
      issues: { path: string }[];
    };
    expect(payload.ok).toBe(false);
    expect(payload.issues[0]?.path).toBe('nodes[0].icon');
    await client.close();
  });
});
