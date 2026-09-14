import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generateJsonSchema } from '@noblecloak/diagrammar-core';
import { GUIDE } from '../guide.js';
import type { ToolContext } from '../fs.js';

const SCHEMA = generateJsonSchema();

export function register(server: McpServer, _ctx: ToolContext): void {
  server.registerTool(
    'diagrammar_schema',
    {
      title: 'Diagrammar schema and guide',
      description:
        'Returns the Diagrammar v1 JSON Schema plus a short authoring guide with one example per diagram family.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      Promise.resolve({
        content: [
          { type: 'text' as const, text: JSON.stringify(SCHEMA, null, 2) },
          { type: 'text' as const, text: GUIDE },
        ],
      }),
  );
}
