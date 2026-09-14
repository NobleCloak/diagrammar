import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkThemeRef, parse } from '@noblecloak/diagrammar-core';
import { assetResolverFor, resolveSource, type ToolContext } from '../fs.js';
import { withToolErrors } from '../toolError.js';

const commonShape = {
  source: z
    .string()
    .optional()
    .describe(
      'Inline Diagrammar YAML source to validate. Exactly one of "source" or "path" must be given.',
    ),
};

/** `path` only makes sense when the server has a jailed filesystem root. */
const fsOnlyShape = {
  path: z
    .string()
    .optional()
    .describe(
      'Path (relative to the server root) of a Diagrammar YAML file to validate. Exactly one of "source" or "path" must be given.',
    ),
};

/**
 * Under `--no-fs`, `path` would always fail (there is no root to resolve it
 * against), so the registered schema omits it entirely — see the identical
 * rationale on `renderShapeFor` in `tools/render.ts`.
 */
function validateShapeFor(ctx: ToolContext): typeof commonShape & typeof fsOnlyShape {
  const shape = ctx.noFs ? commonShape : { ...commonShape, ...fsOnlyShape };
  return shape as typeof commonShape & typeof fsOnlyShape;
}

export function register(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'diagrammar_validate',
    {
      title: 'Validate a diagram',
      description:
        'Validates a Diagrammar YAML document and reports schema/semantic errors, and theme-file errors, with path and line number. An invalid diagram is still a successful call (ok: false with issues), not a tool error.',
      inputSchema: validateShapeFor(ctx),
      annotations: { readOnlyHint: true },
    },
    (args) =>
      withToolErrors(async () => {
        const { text, resolvedPath } = await resolveSource(ctx, args);
        const parsed = parse(text);
        const result = parsed.ok
          ? await (async () => {
              const issues = await checkThemeRef(
                parsed.diagram.theme,
                assetResolverFor(ctx, resolvedPath),
              );
              return { ok: issues.length === 0, issues };
            })()
          : { ok: false, issues: parsed.issues };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      }, ctx.root),
  );
}
