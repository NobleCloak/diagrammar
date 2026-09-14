import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createDocument,
  DiagramDocument,
  describe as describeDiagram,
  ValidationError,
  parseOp,
  type DiagramType,
  type Op,
} from '@noblecloak/diagrammar-core';
import { assertFsEnabled, resolveInRoot, writeAtomic, type ToolContext } from '../fs.js';
import { withToolErrors } from '../toolError.js';

const elementRecordShape = z.array(z.record(z.string(), z.unknown())).optional();

const createShape = {
  path: z.string().describe('Path (relative to the server root) to write the new diagram file to.'),
  type: z
    .enum(['flowchart', 'architecture', 'sequence'])
    .describe('The diagram family to create: flowchart, architecture, or sequence.'),
  title: z.string().optional().describe('An optional title for the new diagram.'),
  nodes: elementRecordShape.describe('Seed nodes to add (flowchart/architecture only).'),
  edges: elementRecordShape.describe('Seed edges to add (flowchart/architecture only).'),
  participants: elementRecordShape.describe('Seed participants to add (sequence only).'),
  messages: elementRecordShape.describe('Seed messages or fragments to add (sequence only).'),
};

/**
 * `createDocument()` always seeds a placeholder element (a lone "start" node
 * for flowchart/architecture, or participants "a"/"b" with a message
 * between them for sequence) because the contract's `createDocument()`
 * doesn't accept seed elements itself. These ops strip that placeholder
 * back out via the ops API (never a string edit) so the file this tool
 * writes always contains exactly the caller's own elements — run before any
 * caller-supplied ops so a caller who happens to choose "start"/"a"/"b" as
 * one of their own ids never collides with the placeholder.
 *
 * Exported (and re-exported from `@noblecloak/diagrammar-mcp`'s barrel) so the CLI's
 * `new` command shares this exact logic instead of keeping its own copy.
 */
export function seedRemovalOps(type: DiagramType): Op[] {
  if (type === 'sequence') {
    return [
      { op: 'removeMessage', target: { from: 'a', to: 'b' } },
      { op: 'removeParticipant', target: { id: 'a' } },
      { op: 'removeParticipant', target: { id: 'b' } },
    ];
  }
  return [{ op: 'removeNode', target: { id: 'start' } }];
}

/**
 * Parses each caller-supplied element record into a real `Op` via
 * `parseOp` — the same narrowing `DiagramDocument.apply` itself uses —
 * rather than asserting the wire-shaped `Record<string, unknown>` records
 * straight into `NodeInput`/`EdgeInput`/etc, which would need an unsound
 * cast. Throws `ValidationError` on the first record that doesn't parse.
 */
function buildCallerOps(args: {
  nodes?: Record<string, unknown>[] | undefined;
  edges?: Record<string, unknown>[] | undefined;
  participants?: Record<string, unknown>[] | undefined;
  messages?: Record<string, unknown>[] | undefined;
}): Op[] {
  const candidates: unknown[] = [
    ...(args.nodes ?? []).map((node) => ({ op: 'addNode', node })),
    ...(args.edges ?? []).map((edge) => ({ op: 'addEdge', edge })),
    ...(args.participants ?? []).map((participant) => ({ op: 'addParticipant', participant })),
    ...(args.messages ?? []).map((item) => ({ op: 'insertMessage', item, at: 'end' })),
  ];
  const ops: Op[] = [];
  for (const candidate of candidates) {
    const parsed = parseOp(candidate);
    if (!parsed.ok) {
      throw new ValidationError(parsed.issues);
    }
    ops.push(parsed.op);
  }
  return ops;
}

export function register(server: McpServer, ctx: ToolContext): void {
  if (ctx.noFs) return;
  server.registerTool(
    'diagrammar_create',
    {
      title: 'Create a diagram file',
      description:
        'Writes a new Diagrammar YAML file under the server root, optionally seeded with nodes/edges/participants/messages. Refuses to overwrite an existing file.',
      inputSchema: createShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      withToolErrors(async () => {
        assertFsEnabled(ctx);
        const init: { type: DiagramType; title?: string } = { type: args.type };
        if (args.title !== undefined) init.title = args.title;
        const doc = DiagramDocument.from(createDocument(init));

        const ops: Op[] = [...seedRemovalOps(args.type), ...buildCallerOps(args)];
        const result = doc.apply(ops);
        if (!result.ok) {
          throw new ValidationError(result.issues);
        }
        const text = doc.toString();

        const resolvedPath = resolveInRoot(ctx.root, args.path);
        await writeAtomic(resolvedPath, text, { exclusive: true });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ path: args.path, describe: describeDiagram(text) }, null, 2),
            },
          ],
        };
      }, ctx.root),
  );
}
