import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../fs.js';
import { withToolErrors } from '../toolError.js';

const iconsShape = {
  query: z
    .string()
    .optional()
    .describe(
      'Search text matched against icon names, then aliases (case-insensitive, ranked). Omit to list the registered sets.',
    ),
  set: z.string().optional().describe('Restrict the search to one set id (e.g. "lucide").'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Maximum matches to return (default 20).'),
};

export function register(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'diagrammar_icons',
    {
      title: 'Search icon sets',
      description:
        'Lists the registered icon sets (no query) or searches them by name and alias. Use the returned "<set>/<name>" as the icon: value on a node, group or participant; the render/validate tools reject unknown icons with nearest-name suggestions.',
      inputSchema: iconsShape,
      annotations: { readOnlyHint: true },
    },
    (args) =>
      withToolErrors(async () => {
        if (args.query === undefined) {
          // Names come from the index (already loaded synchronously when the
          // set was opened), so listing sets never needs to gunzip icons.json.gz.
          const sets = ctx.icons.sets().map((set) => ({
            id: set.id,
            version: set.version,
            license: set.license,
            count: set.names().length,
          }));
          return { content: [{ type: 'text' as const, text: JSON.stringify({ sets }, null, 2) }] };
        }
        const matches = await ctx.icons.search(args.query, {
          ...(args.set !== undefined ? { set: args.set } : {}),
          ...(args.limit !== undefined ? { limit: args.limit } : {}),
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ matches }, null, 2) }] };
      }, ctx.root),
  );
}
