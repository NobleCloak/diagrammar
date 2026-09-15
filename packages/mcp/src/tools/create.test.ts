import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe as describeDiagram } from '@noblecloak/diagrammar-core';
import { register } from './create.js';
import { register as registerSchema } from './schema.js';
import { defaultIconRegistry } from '../icons.js';
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

describe('diagrammar_create', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-create-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes a minimal valid file with no seed elements, stripping the placeholder node', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_create',
      arguments: { path: 'new.yaml', type: 'flowchart', title: 'Hello' },
    });
    expect(result.isError).toBeFalsy();
    const text = await readFile(join(root, 'new.yaml'), 'utf8');
    expect(text).toContain('diagrammar: 1');
    expect(text).toContain('type: flowchart');
    expect(text).not.toContain('start');
    const described = describeDiagram(text);
    expect(described.valid).toBe(true);
    expect(described.elements).toEqual([]);
    await client.close();
  });

  it("applies seed nodes and edges, leaving exactly the caller's elements", async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_create',
      arguments: {
        path: 'seeded.yaml',
        type: 'flowchart',
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        edges: [{ from: 'a', to: 'b' }],
      },
    });
    expect(result.isError).toBeFalsy();
    const text = await readFile(join(root, 'seeded.yaml'), 'utf8');
    expect(text).toContain('id: a');
    expect(text).toContain('id: b');
    expect(text).not.toContain('start');
    const described = describeDiagram(text);
    expect(described.valid).toBe(true);
    const nodeIds = described.elements.filter((e) => e.kind === 'node').map((e) => e.id);
    expect(nodeIds).toEqual(['a', 'b']);
    await client.close();
  });

  it('applies seed participants and messages on a sequence diagram, stripping the placeholders', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_create',
      arguments: {
        path: 'seq.yaml',
        type: 'sequence',
        participants: [
          { id: 'user', label: 'User' },
          { id: 'api', label: 'API' },
        ],
        messages: [{ from: 'user', to: 'api', label: 'POST /orders' }],
      },
    });
    expect(result.isError).toBeFalsy();
    const text = await readFile(join(root, 'seq.yaml'), 'utf8');
    expect(text).not.toMatch(/id:\s*a\b/);
    expect(text).not.toMatch(/id:\s*b\b/);
    const described = describeDiagram(text);
    expect(described.valid).toBe(true);
    const participantIds = described.elements
      .filter((e) => e.kind === 'participant')
      .map((e) => e.id);
    expect(participantIds).toEqual(['user', 'api']);
    await client.close();
  });

  it('writes a minimal valid sequence file with no seed elements, stripping the placeholders', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_create',
      arguments: { path: 'empty-seq.yaml', type: 'sequence' },
    });
    expect(result.isError).toBeFalsy();
    const text = await readFile(join(root, 'empty-seq.yaml'), 'utf8');
    const described = describeDiagram(text);
    expect(described.valid).toBe(true);
    expect(described.elements).toEqual([]);
    await client.close();
  });

  it('is a tool error when a seed op is invalid (e.g. duplicate id)', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    const result = await client.callTool({
      name: 'diagrammar_create',
      arguments: {
        path: 'bad.yaml',
        type: 'flowchart',
        nodes: [{ id: 'a' }, { id: 'a' }],
      },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('is a tool error (exists) when the target file already exists', async () => {
    const client = await connectedClient({ root, noFs: false, icons: defaultIconRegistry() });
    await writeFile(join(root, 'already.yaml'), 'diagrammar: 1\ntype: flowchart\n', 'utf8');
    const result = await client.callTool({
      name: 'diagrammar_create',
      arguments: { path: 'already.yaml', type: 'flowchart' },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      code: string;
    };
    expect(parsed.code).toBe('exists');
    await client.close();
  });

  it('is not registered at all when noFs is true', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    const ctx: ToolContext = { root: undefined, noFs: true, icons: defaultIconRegistry() };
    // Register a tool that does survive --no-fs first (the real production
    // shape), so tools/list has something to succeed against instead of a
    // server with zero tools ever registered at all.
    registerSchema(server, ctx);
    register(server, ctx);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(clientTransport);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).not.toContain('diagrammar_create');
    await client.close();
  });
});
