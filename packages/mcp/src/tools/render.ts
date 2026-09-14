import { z } from 'zod';
import { basename, extname } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { render, walkthrough, type RenderOptions } from '@noblecloak/diagrammar-core';
import {
  assertFsEnabled,
  assetResolverFor,
  resolveInRoot,
  resolveSource,
  writeAtomic,
  type ToolContext,
  type SourceInput,
} from '../fs.js';
import { withToolErrors } from '../toolError.js';

const commonShape = {
  source: z
    .string()
    .optional()
    .describe(
      'Inline Diagrammar YAML source to render. Exactly one of "source" or "path" must be given.',
    ),
  format: z
    .enum(['png', 'svg', 'md'])
    .optional()
    .describe(
      'Output format, default "png". "md" renders a Markdown walkthrough (referencing a sibling PNG) instead of an image.',
    ),
  view: z.string().optional().describe('ID of a view to focus; other elements are dimmed.'),
  scale: z
    .union([z.literal(1), z.literal(2)])
    .optional()
    .describe('Raster scale factor for PNG output, 1 or 2, default 1.'),
  theme: z
    .string()
    .optional()
    .describe(
      'Overrides the document\'s theme: a preset name (light, dark, colorblind, mono) or a relative path to a theme file, resolved like the file\'s own "theme:" key.',
    ),
  legend: z.boolean().optional().describe('Draw the callout legend, default true.'),
  returnImage: z
    .boolean()
    .optional()
    .describe(
      'When format is "png", whether to return an MCP image content block (default true). Ignored for "svg" and "md". When false and no "outputPath" is given, the rendered SVG is still returned as the "svg" field of the JSON payload, so the render is never discarded.',
    ),
};

/** Fields that only make sense when the server has a jailed filesystem root. */
const fsOnlyShape = {
  path: z
    .string()
    .optional()
    .describe(
      'Path (relative to the server root) of a Diagrammar YAML file to render. Exactly one of "source" or "path" must be given.',
    ),
  outputPath: z
    .string()
    .optional()
    .describe('Path (relative to the server root) to also write the rendered output to.'),
};

/**
 * Under `--no-fs`, `path`/`outputPath` would always fail (there is no root
 * to resolve them against), so the registered schema omits them entirely
 * rather than advertising arguments an agent could pick and always have
 * rejected. The return type keeps both fields visible to the callback below
 * (they're `.optional()`, and always genuinely absent at runtime when
 * `noFs` is true, since the registered schema strips them) so the shared
 * handler doesn't need a second, narrower code path.
 */
function renderShapeFor(ctx: ToolContext): typeof commonShape & typeof fsOnlyShape {
  const shape = ctx.noFs ? commonShape : { ...commonShape, ...fsOnlyShape };
  return shape as typeof commonShape & typeof fsOnlyShape;
}

/**
 * Derives the sibling PNG basename a Markdown walkthrough should reference,
 * per the controller ruling shared with the (not-yet-built) CLI: the same
 * basename as a `path`-based source with its extension swapped to `.png`,
 * or `diagram.png` for inline `source`.
 */
function deriveImagePath(input: SourceInput): string {
  if (input.path !== undefined) {
    return `${basename(input.path, extname(input.path))}.png`;
  }
  return 'diagram.png';
}

/**
 * Writes `data` to `outputPath` (resolved against the server root).
 * Callers report the caller-supplied `outputPath` string itself back to the
 * client — never the resolved absolute path this function computes
 * internally — so a successful payload never leaks the host filesystem
 * layout (controller ruling C1).
 */
async function writeOutput(
  ctx: ToolContext,
  outputPath: string,
  data: string | Buffer,
): Promise<void> {
  assertFsEnabled(ctx);
  const resolved = resolveInRoot(ctx.root, outputPath);
  await writeAtomic(resolved, data);
}

export function register(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'diagrammar_render',
    {
      title: 'Render a diagram',
      description:
        'Renders a Diagrammar diagram to PNG (default, returned as an image block), SVG, or a Markdown walkthrough (both returned as text).',
      inputSchema: renderShapeFor(ctx),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      withToolErrors(async () => {
        const { text, resolvedPath } = await resolveSource(ctx, args);
        const format = args.format ?? 'png';
        const returnImage = args.returnImage ?? true;

        if (format === 'md') {
          const md = walkthrough(text, { imagePath: deriveImagePath(args) });
          if (args.outputPath !== undefined) {
            await writeOutput(ctx, args.outputPath, md);
          }
          return {
            content: [
              { type: 'text' as const, text: md },
              {
                type: 'text' as const,
                text: JSON.stringify({ outputPath: args.outputPath, warnings: [] }),
              },
            ],
          };
        }

        const options: RenderOptions = { format: format === 'svg' ? 'svg' : 'png' };
        if (args.view !== undefined) options.view = args.view;
        if (args.scale !== undefined) options.scale = args.scale;
        if (args.theme !== undefined) options.theme = args.theme;
        if (args.legend !== undefined) options.legend = args.legend;
        options.resolver = assetResolverFor(ctx, resolvedPath);

        const result = await render(text, options);

        if (args.outputPath !== undefined) {
          await writeOutput(
            ctx,
            args.outputPath,
            format === 'svg' ? result.svg : Buffer.from(result.bytes),
          );
        }

        if (format === 'png' && returnImage) {
          return {
            content: [
              {
                type: 'image' as const,
                data: Buffer.from(result.bytes).toString('base64'),
                mimeType: 'image/png',
              },
              {
                type: 'text' as const,
                text: JSON.stringify({
                  outputPath: args.outputPath,
                  warnings: result.warnings,
                  layout: result.layout,
                }),
              },
            ],
          };
        }

        // Agent-ergonomics ruling: png + returnImage:false + no outputPath
        // must not discard the render outright — the annotated SVG (always
        // produced internally, regardless of output format) rides along in
        // the JSON payload's "svg" field instead.
        const payload: Record<string, unknown> = {
          outputPath: args.outputPath,
          warnings: result.warnings,
          layout: result.layout,
        };
        if (format === 'png' && args.outputPath === undefined) {
          payload.svg = result.svg;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text:
                format === 'svg'
                  ? result.svg
                  : `Rendered ${format} (${result.bytes.length} bytes).`,
            },
            { type: 'text' as const, text: JSON.stringify(payload) },
          ],
        };
      }, ctx.root),
  );
}
