import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from './schema.js';
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

describe('diagrammar_schema', () => {
  it('returns the JSON Schema and the authoring guide', async () => {
    const client = await connectedClient({ root: undefined, noFs: true });
    const result = await client.callTool({ name: 'diagrammar_schema', arguments: {} });
    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(2);
    const schema = JSON.parse(content[0]!.text) as { $schema?: string };
    expect(schema.$schema).toContain('json-schema.org');
    expect(content[1]!.text).toContain('Diagrammar authoring guide');
    await client.close();
  });
});
