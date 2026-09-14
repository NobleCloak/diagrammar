import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from './list.js';
import { register as registerSchema } from './schema.js';
import type { ToolContext } from '../fs.js';

async function connectedClient(ctx: ToolContext): Promise<Client> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, ctx);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

describe('diagrammar_list', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-list-'));
    await writeFile(
      join(root, 'a.yaml'),
      'diagrammar: 1\ntype: flowchart\nnodes: []\nedges: []\n',
      'utf8',
    );
    await writeFile(join(root, 'not-a-diagram.yaml'), 'foo: bar\n', 'utf8');
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists diagram files under root', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({ name: 'diagrammar_list', arguments: {} });
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      files: string[];
    };
    expect(parsed.files).toEqual(['a.yaml']);
    await client.close();
  });

  it('is not registered at all when noFs is true', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    const ctx: ToolContext = { root: undefined, noFs: true };
    // Register a tool that *does* survive --no-fs first, so tools/list has
    // something to succeed against — this is the real production shape
    // (diagrammar_schema is always registered; diagrammar_list is the one
    // that opts out under noFs) rather than a server with zero tools ever
    // registered at all.
    registerSchema(server, ctx);
    register(server, ctx);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).not.toContain('diagrammar_list');
    await client.close();
  });
});
