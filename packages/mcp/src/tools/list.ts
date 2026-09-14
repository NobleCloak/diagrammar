import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { assertFsEnabled, listDiagrams, type ToolContext } from '../fs.js';
import { withToolErrors } from '../toolError.js';

const listShape = {
  glob: z
    .string()
    .optional()
    .describe(
      'An optional glob pattern (relative to the server root) restricting which files are listed.',
    ),
};

export function register(server: McpServer, ctx: ToolContext): void {
  if (ctx.noFs) return;
  server.registerTool(
    'diagrammar_list',
    {
      title: 'List diagrams',
      description:
        'Lists Diagrammar YAML files under the server root (files whose first lines contain "diagrammar: 1").',
      inputSchema: listShape,
      annotations: { readOnlyHint: true },
    },
    (args) =>
      withToolErrors(async () => {
        assertFsEnabled(ctx);
        const files = await listDiagrams(ctx.root, args.glob);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ files }, null, 2) }] };
      }, ctx.root),
  );
}
