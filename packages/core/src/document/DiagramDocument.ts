import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Document } from 'yaml';
import { loadYaml, parse } from '../parse.js';
import type { Diagram } from '../model/types.js';
import { ValidationError, type ValidationIssue } from '../errors.js';
import {
  applyOp,
  parseOp,
  zodIssuesToValidationIssues,
  type Op,
  type OpApplyResult,
} from './ops.js';
import { applyJsonPatchOp, JsonPatchOpSchema, type JsonPatchOp } from './patch.js';
import { describe, type Description } from './describe.js';

const JsonPatchOpsSchema = z.array(JsonPatchOpSchema);

export type OpResult =
  { ok: true; changed: string[]; removed?: string[] } | { ok: false; issues: ValidationIssue[] };

export class DiagramDocument {
  private docInternal: Document;
  private modelInternal: Diagram;

  private constructor(doc: Document, model: Diagram) {
    this.docInternal = doc;
    this.modelInternal = model;
  }

  static from(text: string): DiagramDocument {
    const result = parse(text);
    if (!result.ok) {
      throw new ValidationError(result.issues);
    }
    const { doc } = loadYaml(text);
    return new DiagramDocument(doc, result.diagram);
  }

  get model(): Diagram {
    return this.modelInternal;
  }

  /**
   * Clones the current document, applies `items` one at a time via
   * `applyOne`. Commits the clone (and rebuilt model) only if every item
   * applied and a final re-parse succeeded; otherwise returns the failure
   * and leaves `this` untouched.
   *
   * `validateEach` (I7) controls *when* that re-parse happens:
   * - `true` (used by `apply`): after every single op, because an `Op`'s
   *   `Selector` resolves against the live model, so the next op in the
   *   batch needs an up-to-date `Diagram` to resolve against.
   * - `false` (used by `applyPatch`): once, after the whole batch. A JSON
   *   Patch op addresses the document directly by RFC 6901 pointer — it
   *   never needs a `Diagram` to resolve anything — so there's no reason to
   *   pay for (or be blocked by) a reparse of a possibly-transient
   *   intermediate state between two ops in the same batch. Atomicity is
   *   unchanged either way: the clone is only committed if the relevant
   *   reparse(s) all succeeded.
   */
  private runBatch<T>(
    items: T[],
    applyOne: (clone: Document, model: Diagram, item: T) => OpApplyResult,
    validateEach: boolean,
  ): OpResult {
    const clone = this.docInternal.clone();
    let currentModel = this.modelInternal;
    const changed: string[] = [];
    const removed: string[] = [];
    for (const item of items) {
      const result = applyOne(clone, currentModel, item);
      if ('issues' in result) {
        return { ok: false, issues: result.issues };
      }
      changed.push(...result.changed);
      if (result.removed) removed.push(...result.removed);
      if (validateEach) {
        const reparsed = parse(clone.toString());
        if (!reparsed.ok) {
          return { ok: false, issues: reparsed.issues };
        }
        currentModel = reparsed.diagram;
      }
    }
    if (!validateEach) {
      const reparsed = parse(clone.toString());
      if (!reparsed.ok) {
        return { ok: false, issues: reparsed.issues };
      }
      currentModel = reparsed.diagram;
    }
    this.docInternal = clone;
    this.modelInternal = currentModel;
    return removed.length > 0 ? { ok: true, changed, removed } : { ok: true, changed };
  }

  apply(ops: Op[]): OpResult {
    for (const op of ops) {
      const parsed = parseOp(op);
      if (!parsed.ok) {
        return { ok: false, issues: parsed.issues };
      }
    }
    return this.runBatch(ops, applyOp, true);
  }

  /**
   * Applies a batch of RFC 6902 JSON Patch operations. Every op is
   * validated upfront against `JsonPatchOpSchema` (mirroring `apply()`'s
   * `OpSchema` pre-validation) before any mutation runs, so a malformed op
   * anywhere in the batch — including one the `JsonPatchOp` TS type alone
   * wouldn't catch, e.g. an `add` missing its required `value` — aborts
   * before touching the document.
   *
   * Two path conventions show up in the returned issues, matching what
   * each failure is actually about:
   * - A pre-validation failure reports the *zod* path into the `ops`
   *   array, in this project's usual bracket notation (`formatZodPath`):
   *   `"[2].op"` for a bad `op` literal on `ops[2]`.
   * - Every other issue — a bad JSON pointer, a target/source that
   *   doesn't exist, a failing `test`, an atomicity rollback from a bad
   *   reparse — reports the *JSON Pointer string* the caller wrote (e.g.
   *   `"/nodes/9"`), since that's the address space JSON Patch itself
   *   operates in.
   */
  applyPatch(ops: JsonPatchOp[]): OpResult {
    const parsed = JsonPatchOpsSchema.safeParse(ops);
    if (!parsed.success) {
      return { ok: false, issues: zodIssuesToValidationIssues(parsed.error) };
    }
    return this.runBatch(ops, (clone, _model, op) => applyJsonPatchOp(clone, op), false);
  }

  toString(): string {
    return this.docInternal.toString();
  }

  hash(): string {
    return createHash('sha256').update(this.toString()).digest('hex');
  }

  /** Convenience (M12): `describe(this.toString())`, so a caller already holding a `DiagramDocument` doesn't have to re-stringify it themselves. */
  describe(): Description {
    return describe(this.toString());
  }
}
