import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import {
  ConflictError,
  DiagramDocument,
  JsonPatchOpSchema,
  ValidationError,
  describe,
  parseOp,
  type Op,
  type JsonPatchOp,
  type ValidationIssue,
} from '@noblecloak/diagrammar-core';
import { writeAtomic } from '@noblecloak/diagrammar-mcp';
import { describeIoError } from '../ioError.js';

export const help = `diagrammar edit <file> --ops <ops.json|-> [--expected-hash <sha256>]

Applies a batch of operations to a Diagrammar file in place. The --ops file
(or "-" to read from stdin) is a JSON array containing EITHER typed
operations (see the MCP "diagrammar_edit" tool schema) OR an RFC 6902 JSON
Patch — the two shapes are auto-detected from the array's contents.

Options:
  --ops <file|->          Required. Path to a JSON file containing an array of
                          operations, or "-" to read the array from stdin.
  --expected-hash <hash>  Optional. Aborts with a conflict if the file's current
                          content hash does not match.
`;

const JSON_PATCH_OPS = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test']);

/**
 * Per the controller ruling for Task 16: an `--ops` file may contain EITHER
 * an array of typed ops OR an RFC 6902 JSON Patch array. Detects the latter
 * by structural shape — every item looks like a JSON Patch op (an `op` in
 * the RFC 6902 set, plus a `path` that is a string starting with "/") —
 * since none of the typed `Op` variants use those `op` literals.
 */
function isJsonPatchShaped(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const record = item as Record<string, unknown>;
  return (
    typeof record.op === 'string' &&
    JSON_PATCH_OPS.has(record.op) &&
    typeof record.path === 'string' &&
    record.path.startsWith('/')
  );
}

function isPatchArray(ops: unknown[]): boolean {
  return ops.length > 0 && ops.every(isJsonPatchShaped);
}

type ParsedItems<T> = { ok: true; items: T[] } | { ok: false; issues: ValidationIssue[] };

/**
 * Validates every item against `OpSchema` via the same `parseOp` the MCP
 * `diagrammar_edit` tool and `diagrammar_create` use (M12) — never a raw
 * `as Op[]` cast of unvalidated JSON.
 */
function parseTypedOps(items: unknown[]): ParsedItems<Op> {
  const ops: Op[] = [];
  for (const item of items) {
    const parsed = parseOp(item);
    if (!parsed.ok) return { ok: false, issues: parsed.issues };
    ops.push(parsed.op);
  }
  return { ok: true, items: ops };
}

/** Validates every item against `JsonPatchOpSchema` (M12), indexed for a readable issue path. */
function parsePatchOps(items: unknown[]): ParsedItems<JsonPatchOp> {
  const ops: JsonPatchOp[] = [];
  for (const [i, item] of items.entries()) {
    const parsed = JsonPatchOpSchema.safeParse(item);
    if (!parsed.success) {
      return {
        ok: false,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.length > 0 ? `[${i}].${issue.path.join('.')}` : `[${i}]`,
          message: issue.message,
        })),
      };
    }
    ops.push(parsed.data);
  }
  return { ok: true, items: ops };
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function run(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      ops: { type: 'string' },
      'expected-hash': { type: 'string' },
    },
    allowPositionals: true,
  });
  const file = positionals[0];
  if (file === undefined) {
    console.error('edit: a file path is required');
    return 1;
  }
  if (values.ops === undefined) {
    console.error('edit: --ops <file|-> is required');
    return 1;
  }

  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    console.error(`edit: ${describeIoError(err, file)}`);
    return 1;
  }

  try {
    // I7: parsing the file into a document happens inside this try so an
    // invalid file's `ValidationError` is caught below and printed as the
    // per-issue loop, instead of escaping uncaught with a raw stack.
    const doc = DiagramDocument.from(text);

    if (values['expected-hash'] !== undefined && values['expected-hash'] !== doc.hash()) {
      throw new ConflictError(values['expected-hash'], doc.hash());
    }

    let opsText: string;
    try {
      opsText = values.ops === '-' ? await readStdin() : await readFile(values.ops, 'utf8');
    } catch (err) {
      console.error(`edit: ${describeIoError(err, values.ops)}`);
      return 1;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(opsText);
    } catch (err) {
      console.error(
        `edit: --ops is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 1;
    }
    if (!Array.isArray(parsedJson)) {
      console.error('edit: --ops must contain a JSON array of operations');
      return 1;
    }

    const result = isPatchArray(parsedJson)
      ? applyPatchItems(doc, parsedJson)
      : applyTypedItems(doc, parsedJson);
    if (!result.ok) {
      throw new ValidationError(result.issues);
    }

    const updated = doc.toString();
    await writeAtomic(file, updated);
    console.log(
      JSON.stringify(
        {
          hash: doc.hash(),
          changed: result.changed,
          removed: result.removed ?? [],
          describe: describe(updated),
        },
        null,
        2,
      ),
    );
    return 0;
  } catch (err) {
    if (err instanceof ConflictError) {
      console.error(
        `edit: conflict — expected hash ${err.expected}, file is currently at ${err.actual}`,
      );
      return 1;
    }
    if (err instanceof ValidationError) {
      console.error(`edit: ${err.issues.length} issue(s)`);
      for (const issue of err.issues) {
        const location =
          issue.line !== undefined ? `${issue.path} (line ${issue.line})` : issue.path;
        console.error(`  ${location}: ${issue.message}`);
      }
      return 1;
    }
    throw err;
  }
}

type OpOutcome =
  { ok: true; changed: string[]; removed?: string[] } | { ok: false; issues: ValidationIssue[] };

function applyTypedItems(doc: DiagramDocument, items: unknown[]): OpOutcome {
  const parsed = parseTypedOps(items);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  return doc.apply(parsed.items);
}

function applyPatchItems(doc: DiagramDocument, items: unknown[]): OpOutcome {
  const parsed = parsePatchOps(items);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  return doc.applyPatch(parsed.items);
}
