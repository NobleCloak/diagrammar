import { z } from 'zod';
import type { Document, Node } from 'yaml';
import { YAMLSeq } from 'yaml';
import type { ValidationIssue } from '../errors.js';
import { insertAt, removeAt } from './yamlStyle.js';

export interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * Structural validation for a single RFC 6902 op, applied upfront by
 * `DiagramDocument.applyPatch` (mirroring how `apply()` pre-validates every
 * `Op` against `OpSchema`) before any mutation runs. `.strict()` rejects
 * unknown keys; `value`/`from` are required exactly where RFC 6902 requires
 * them (`add`/`replace`/`test` need `value`, `move`/`copy` need `from`) —
 * note that a *missing* key still fails even though the field's type
 * includes `unknown`/`undefined`, since zod treats an absent required key
 * differently from a present-but-`undefined` one.
 */
export const JsonPatchOpSchema: z.ZodType<JsonPatchOp> = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), path: z.string(), value: z.unknown() }).strict(),
  z.object({ op: z.literal('remove'), path: z.string() }).strict(),
  z.object({ op: z.literal('replace'), path: z.string(), value: z.unknown() }).strict(),
  z.object({ op: z.literal('move'), path: z.string(), from: z.string() }).strict(),
  z.object({ op: z.literal('copy'), path: z.string(), from: z.string() }).strict(),
  z.object({ op: z.literal('test'), path: z.string(), value: z.unknown() }).strict(),
]);

export type PatchApplyResult = { changed: string[] } | { issues: ValidationIssue[] };

/**
 * Parses an RFC 6901 JSON pointer into `yaml`-Document path segments. Array
 * indices become numbers; the literal segment `-` (RFC 6902 "end of array")
 * is returned as the string `"-"` so callers can special-case it.
 */
export function parsePointer(pointer: string): (string | number)[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new Error(`invalid JSON pointer: "${pointer}"`);
  }
  return pointer
    .split('/')
    .slice(1)
    .map((segment) => {
      const unescaped = segment.replace(/~1/g, '/').replace(/~0/g, '~');
      if (unescaped === '-') return '-';
      return /^\d+$/.test(unescaped) ? Number(unescaped) : unescaped;
    });
}

function pointerToString(path: (string | number)[]): string {
  return '/' + path.join('/');
}

interface HasToJS {
  toJS: (doc: Document) => unknown;
}

function hasToJS(value: unknown): value is HasToJS {
  if (typeof value !== 'object' || value === null || !('toJS' in value)) return false;
  const candidate: { toJS?: unknown } = value;
  return typeof candidate.toJS === 'function';
}

/**
 * Returns the live `YAMLSeq` at `parentPath`, or `undefined` if there is
 * none there (missing, or not a sequence). The root (`parentPath.length ===
 * 0`) is never treated as a sequence — every diagrammar file is a mapping
 * at the top level.
 */
function containerSeqAt(clone: Document, parentPath: (string | number)[]): YAMLSeq | undefined {
  if (parentPath.length === 0) return undefined;
  const container: unknown = clone.getIn(parentPath);
  return container instanceof YAMLSeq ? container : undefined;
}

/**
 * Places `node` at `path` inside `clone`, returning the changed pointer or
 * an issue. A path whose last segment is a numeric index or `-` (RFC 6902
 * "end of array") is an array insertion, done via `insertAt` — **not**
 * `Document#setIn`, which on a numeric segment *overwrites* the existing
 * item in place (`YAMLSeq#set`) rather than inserting, and throws outright
 * for `-` (`Expected a valid index, not -.`). Every other path is a map
 * field, placed via `setIn`. Shared by `add`, `move`, and `copy` — the
 * three ops that ever place a value at a destination pointer.
 */
function placeAt(
  clone: Document,
  path: (string | number)[],
  pointer: string,
  node: Node,
  label: string,
): PatchApplyResult {
  const key = path[path.length - 1];
  if (key === '-' || typeof key === 'number') {
    const parent = path.slice(0, -1);
    const seq = containerSeqAt(clone, parent);
    if (seq === undefined) {
      return {
        issues: [
          {
            path: pointer,
            message: `"${label}" requires an existing array at ${pointerToString(parent)}`,
          },
        ],
      };
    }
    const index = key === '-' ? seq.items.length : key;
    if (typeof key === 'number' && (key < 0 || key > seq.items.length)) {
      return {
        issues: [{ path: pointer, message: `"${label}" array index out of range: ${pointer}` }],
      };
    }
    insertAt(seq, index, node);
    return { changed: [pointer] };
  }
  clone.setIn(path, node);
  return { changed: [pointer] };
}

/**
 * Removes and returns the live node at `pointer`, using `removeAt` (splice,
 * shifting later items down) for an array index and `deleteIn` for a map
 * field. Shared by the standalone `remove` op and by `move`'s first step
 * (RFC 6902 defines `move` as "remove from `from`, then add at `path`").
 */
function removeFrom(
  clone: Document,
  pointer: string,
  label: string,
): { value: Node } | { issues: ValidationIssue[] } {
  const path = parsePointer(pointer);
  const key = path[path.length - 1];
  if (typeof key === 'number') {
    const parent = path.slice(0, -1);
    const seq = containerSeqAt(clone, parent);
    if (seq === undefined || key < 0 || key >= seq.items.length) {
      return {
        issues: [{ path: pointer, message: `"${label}" source does not exist: ${pointer}` }],
      };
    }
    // removeAt splices the live item out of seq.items — always a real Node
    // (Scalar/YAMLMap/YAMLSeq) for anything reachable inside a parsed
    // Document, even though its own return type is `unknown`.
    const removed = removeAt(seq, key) as Node;
    return { value: removed };
  }
  if (!clone.hasIn(path)) {
    return { issues: [{ path: pointer, message: `"${label}" source does not exist: ${pointer}` }] };
  }
  // keepScalar=true keeps a Scalar wrapper (and its own comments) live;
  // collections are already returned live. Either way this is a real Node.
  const value = clone.getIn(path, true) as Node;
  clone.deleteIn(path);
  return { value };
}

/** Whether `fromPath` is a proper (strictly shorter) prefix of `path`. */
function isProperPrefix(fromPath: (string | number)[], path: (string | number)[]): boolean {
  return fromPath.length < path.length && fromPath.every((segment, i) => segment === path[i]);
}

export function applyJsonPatchOp(clone: Document, op: JsonPatchOp): PatchApplyResult {
  const path = parsePointer(op.path);
  switch (op.op) {
    case 'add': {
      return placeAt(clone, path, op.path, clone.createNode(op.value), 'add');
    }
    case 'remove': {
      const removed = removeFrom(clone, op.path, 'remove');
      if ('issues' in removed) return removed;
      return { changed: [op.path] };
    }
    case 'replace': {
      if (!clone.hasIn(path)) {
        return {
          issues: [{ path: op.path, message: `"replace" target does not exist: ${op.path}` }],
        };
      }
      clone.setIn(path, clone.createNode(op.value));
      return { changed: [op.path] };
    }
    case 'move': {
      if (op.from === undefined)
        return { issues: [{ path: op.path, message: '"move" requires "from"' }] };
      const fromPath = parsePointer(op.from);
      if (isProperPrefix(fromPath, path)) {
        return {
          issues: [
            {
              path: op.path,
              message: `"move" cannot move ${op.from} into its own child ${op.path}`,
            },
          ],
        };
      }
      const removed = removeFrom(clone, op.from, 'move');
      if ('issues' in removed) return removed;
      const placed = placeAt(clone, path, op.path, removed.value, 'move');
      if ('issues' in placed) return placed;
      return { changed: [op.from, op.path] };
    }
    case 'copy': {
      if (op.from === undefined)
        return { issues: [{ path: op.path, message: '"copy" requires "from"' }] };
      const fromPath = parsePointer(op.from);
      if (!clone.hasIn(fromPath)) {
        return { issues: [{ path: op.from, message: `"copy" source does not exist: ${op.from}` }] };
      }
      const raw: unknown = clone.getIn(fromPath);
      const value: unknown = hasToJS(raw) ? raw.toJS(clone) : raw;
      return placeAt(clone, path, op.path, clone.createNode(value), 'copy');
    }
    case 'test': {
      const actual: unknown = clone.getIn(path);
      if (JSON.stringify(actual) !== JSON.stringify(op.value)) {
        return {
          issues: [
            {
              path: op.path,
              message: `"test" failed at ${op.path}: expected ${JSON.stringify(op.value)}, got ${JSON.stringify(actual)}`,
            },
          ],
        };
      }
      return { changed: [] };
    }
    default: {
      // Unreachable once `applyPatch` has validated every op against
      // `JsonPatchOpSchema` — this guards `applyJsonPatchOp` itself, which
      // is exported and callable directly with unvalidated data (e.g. JSON
      // parsed off the wire) that TypeScript's literal union can't stop at
      // runtime.
      return {
        issues: [{ path: op.path, message: `unrecognized JSON Patch op: "${String(op.op)}"` }],
      };
    }
  }
}
