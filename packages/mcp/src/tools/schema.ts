import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generateJsonSchema, generateThemeJsonSchema } from '@noblecloak/diagrammar-core';
import { GUIDE } from '../guide.js';
import type { ToolContext } from '../fs.js';

const SCHEMA = generateJsonSchema();
const THEME_SCHEMA = generateThemeJsonSchema();

export function register(server: McpServer, _ctx: ToolContext): void {
  server.registerTool(
    'diagrammar_schema',
    {
      title: 'Diagrammar schema and guide',
      description:
        'Returns the Diagrammar v1 JSON Schema (kind: "diagram", default) or the theme file JSON Schema (kind: "theme"), plus a short authoring guide with one example per diagram family.',
      inputSchema: {
        kind: z
          .enum(['diagram', 'theme'])
          .optional()
          .describe(
            'Which schema to return: the diagram file schema (default) or the theme file schema.',
          ),
      },
      annotations: { readOnlyHint: true },
    },
    (args) =>
      Promise.resolve({
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(args.kind === 'theme' ? THEME_SCHEMA : SCHEMA, null, 2),
          },
          { type: 'text' as const, text: GUIDE },
        ],
      }),
  );
}
