import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { register } from './icons.js';
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
const ctx: ToolContext = { root: undefined, noFs: true, icons: defaultIconRegistry() };

describe('diagrammar_icons', () => {
  it('lists sets with license and count when no query is given', async () => {
    const client = await connectedClient(ctx);
    const result = await client.callTool({ name: 'diagrammar_icons', arguments: {} });
    const payload = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      sets: { id: string; license: { spdx: string }; count: number }[];
    };
    expect(payload.sets.map((s) => s.id)).toEqual(['lucide', 'simple-icons']);
    expect(payload.sets[0]!.license.spdx).toBe('ISC');
    expect(payload.sets[0]!.count).toBeGreaterThan(1500);
    await client.close();
  });
  it('searches with ranking and honours set and limit', async () => {
    const client = await connectedClient(ctx);
    const result = await client.callTool({
      name: 'diagrammar_icons',
      arguments: { query: 'database', set: 'lucide', limit: 3 },
    });
    const payload = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      matches: { set: string; name: string; rank: number }[];
    };
    expect(payload.matches[0]).toEqual({ set: 'lucide', name: 'database', rank: 1 });
    expect(payload.matches).toHaveLength(3);
    await client.close();
  });
  it('an unknown set is a tool error with code icon_unknown', async () => {
    const client = await connectedClient(ctx);
    const result = await client.callTool({
      name: 'diagrammar_icons',
      arguments: { query: 'x', set: 'nope' },
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toMatchObject({
      code: 'icon_unknown',
    });
    await client.close();
  });
});
