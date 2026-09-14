import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe as describeDiagram } from '@noblecloak/diagrammar-core';
import { resolveSource, type ToolContext } from '../fs.js';
import { withToolErrors } from '../toolError.js';

const commonShape = {
  source: z
    .string()
    .optional()
    .describe(
      'Inline Diagrammar YAML source to describe. Exactly one of "source" or "path" must be given.',
    ),
  includeSource: z
    .boolean()
    .optional()
    .describe('When true, echoes the raw YAML source back in the response payload.'),
};

/** `path` only makes sense when the server has a jailed filesystem root. */
const fsOnlyShape = {
  path: z
    .string()
    .optional()
    .describe(
      'Path (relative to the server root) of a Diagrammar YAML file to describe. Exactly one of "source" or "path" must be given.',
    ),
};

/**
 * Under `--no-fs`, `path` would always fail (there is no root to resolve it
 * against), so the registered schema omits it entirely — see the identical
 * rationale on `renderShapeFor` in `tools/render.ts`.
 */
function describeShapeFor(ctx: ToolContext): typeof commonShape & typeof fsOnlyShape {
  const shape = ctx.noFs ? commonShape : { ...commonShape, ...fsOnlyShape };
  return shape as typeof commonShape & typeof fsOnlyShape;
}

export function register(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'diagrammar_describe',
    {
      title: 'Describe a diagram',
      description:
        'Returns a compact structural summary of a Diagrammar document: elements, references, views, validation state, and a content hash.',
      inputSchema: describeShapeFor(ctx),
      annotations: { readOnlyHint: true },
    },
    (args) =>
      withToolErrors(async () => {
        const { text } = await resolveSource(ctx, args);
        const result = describeDiagram(text);
        const payload: Record<string, unknown> = { ...result };
        if (args.includeSource === true) {
          payload.source = text;
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
      }, ctx.root),
  );
}
