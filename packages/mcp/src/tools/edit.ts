import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ConflictError,
  DiagramDocument,
  JsonPatchOpSchema,
  OpSchema,
  ValidationError,
  type Op,
} from '@noblecloak/diagrammar-core';
import { resolveSource, writeAtomic, type ToolContext } from '../fs.js';
import { withToolErrors } from '../toolError.js';

const commonShape = {
  source: z
    .string()
    .optional()
    .describe(
      'Inline Diagrammar YAML source to edit. Exactly one of "source" or "path" must be given.',
    ),
  ops: z
    .array(OpSchema)
    .min(1)
    .optional()
    .describe(
      'Typed operations to apply, in order. Exactly one of "ops" or "patch" must be given.',
    ),
  patch: z
    .array(JsonPatchOpSchema)
    .min(1)
    .optional()
    .describe(
      'RFC 6902 JSON Patch operations to apply, in order. Exactly one of "ops" or "patch" must be given.',
    ),
  expectedHash: z
    .string()
    .optional()
    .describe(
      "Optimistic-concurrency guard: the content hash the caller last observed. If given and it no longer matches the document's current hash, the edit is rejected with a conflict error and no mutation is made.",
    ),
};

/** `path` only makes sense when the server has a jailed filesystem root. */
const fsOnlyShape = {
  path: z
    .string()
    .optional()
    .describe(
      'Path (relative to the server root) of a Diagrammar YAML file to edit. Exactly one of "source" or "path" must be given.',
    ),
};

/**
 * Under `--no-fs`, `path` would always fail (there is no root to resolve it
 * against), so the registered schema omits it entirely — see the identical
 * rationale on `renderShapeFor` in `tools/render.ts`.
 */
function editShapeFor(ctx: ToolContext): typeof commonShape & typeof fsOnlyShape {
  const shape = ctx.noFs ? commonShape : { ...commonShape, ...fsOnlyShape };
  return shape as typeof commonShape & typeof fsOnlyShape;
}

export function register(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'diagrammar_edit',
    {
      title: 'Edit a diagram',
      description:
        'Applies a batch of typed operations ("ops") or an RFC 6902 JSON Patch ("patch") to a Diagrammar document. Exactly one of "ops" or "patch" must be given. Atomic across the batch; rejects on hash conflict. A "source" edit returns the updated YAML inline and writes nothing; a "path" edit reads, mutates, and writes the file in place.',
      inputSchema: editShapeFor(ctx),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      withToolErrors(async () => {
        if ((args.ops !== undefined) === (args.patch !== undefined)) {
          throw new ValidationError([
            { path: 'ops', message: 'Provide exactly one of "ops" or "patch".' },
          ]);
        }

        const { text, resolvedPath } = await resolveSource(ctx, args);
        const doc = DiagramDocument.from(text);

        if (args.expectedHash !== undefined && args.expectedHash !== doc.hash()) {
          throw new ConflictError(args.expectedHash, doc.hash());
        }

        let result;
        if (args.ops !== undefined) {
          // Same unavoidable cast `parseOp` documents (packages/core/src/document/ops.ts):
          // editShape has already validated every item against OpSchema;
          // zod's `.optional()` fields are typed `T | undefined` even when the
          // key is absent, while `Op`'s optional fields must be entirely
          // absent under `exactOptionalPropertyTypes`. Zod never writes an
          // explicit `undefined` for an omitted key, so every value here
          // already satisfies `Op`'s stricter shape.
          result = doc.apply(args.ops as Op[]);
        } else if (args.patch !== undefined) {
          // No cast needed here: unlike `OpSchema`, `JsonPatchOpSchema` is
          // itself annotated `z.ZodType<JsonPatchOp>` (patch.ts), so zod
          // infers `JsonPatchOp` directly rather than its own looser
          // `T | undefined`-optional shape.
          result = doc.applyPatch(args.patch);
        } else {
          // Unreachable: the XOR check above already rejects any call
          // where neither (or both) of "ops"/"patch" is given.
          throw new ValidationError([
            { path: 'ops', message: 'Provide exactly one of "ops" or "patch".' },
          ]);
        }

        if (!result.ok) {
          throw new ValidationError(result.issues);
        }

        const updated = doc.toString();
        if (resolvedPath !== undefined) {
          await writeAtomic(resolvedPath, updated);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  yaml: updated,
                  hash: doc.hash(),
                  ok: true,
                  issues: [],
                  describe: doc.describe(),
                  changed: result.changed,
                  removed: result.removed ?? [],
                  warnings: [],
                },
                null,
                2,
              ),
            },
          ],
        };
      }, ctx.root),
  );
}
