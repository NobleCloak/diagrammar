import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerResources } from './resources.js';
import { defaultIconRegistry } from './icons.js';

async function connectedClient() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerResources(server, { root: undefined, noFs: true, icons: defaultIconRegistry() });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

describe('resources', () => {
  it('lists all resources', async () => {
    const client = await connectedClient();
    const result = await client.listResources();
    expect(result.resources.map((r) => r.uri).sort()).toEqual([
      'diagrammar://guide',
      'diagrammar://schema/theme-v1',
      'diagrammar://schema/v1',
    ]);
    await client.close();
  });

  it('reads diagrammar://schema/v1 as JSON', async () => {
    const client = await connectedClient();
    const result = await client.readResource({ uri: 'diagrammar://schema/v1' });
    const content = result.contents[0] as { text: string; mimeType?: string };
    expect(content.mimeType).toBe('application/json');
    const schema = JSON.parse(content.text) as { $schema?: string };
    expect(schema.$schema).toContain('json-schema.org');
    await client.close();
  });

  it('reads diagrammar://guide as Markdown containing the guide text', async () => {
    const client = await connectedClient();
    const result = await client.readResource({ uri: 'diagrammar://guide' });
    const content = result.contents[0] as { text: string };
    expect(content.text).toContain('Diagrammar authoring guide');
    await client.close();
  });

  it('reads diagrammar://schema/theme-v1 as JSON', async () => {
    const client = await connectedClient();
    const result = await client.readResource({ uri: 'diagrammar://schema/theme-v1' });
    const text = (result.contents[0] as { text: string }).text;
    expect((JSON.parse(text) as { required?: string[] }).required).toEqual([
      'diagrammar-theme',
      'base',
    ]);
    await client.close();
  });
});
