import { z } from 'zod';
import type { Document } from 'yaml';
import { YAMLMap, YAMLSeq, Scalar } from 'yaml';
import type {
  Diagram,
  Direction,
  LayoutEngine,
  Theme,
  ElementModel,
  GraphDiagram,
  SequenceDiagram,
  ViewModel,
} from '../model/types.js';
import type { Selector } from '../model/selectors.js';
import { resolveSelector } from '../model/selectors.js';
import type { ValidationIssue } from '../errors.js';
import type {
  NodeInput,
  NoteInput,
  CalloutInput,
  ViewInput,
  GroupInput,
  EdgeInput,
  ParticipantInput,
  MessageInput,
  FragmentInput,
} from '../schema/index.js';
import { formatZodPath } from '../schema/issues.js';
import { removeAt } from './yamlStyle.js';
import {
  applySetMeta,
  applyAddNote,
  applyUpdateNote,
  applyRemoveNote,
  applyAddCallout,
  applyUpdateCallout,
  applyRemoveCallout,
  applySetView,
  applyRemoveView,
} from './ops.annotations.js';
import {
  applyAddNode,
  applyUpdateNode,
  applyRemoveNode,
  applyRenameId,
  applyAddGroup,
  applyUpdateGroup,
  applyRemoveGroup,
  applyAddEdge,
  applyUpdateEdge,
  applyRemoveEdge,
} from './ops.graph.js';
import {
  applyAddParticipant,
  applyUpdateParticipant,
  applyRemoveParticipant,
  applyInsertMessage,
  applyUpdateMessage,
  applyRemoveMessage,
} from './ops.sequence.js';

/** The result of applying a single op to a cloned yaml `Document`. */
export type OpApplyResult =
  { changed: string[]; removed?: string[] } | { issues: ValidationIssue[] };

/**
 * An update patch shaped like the file input type `T`, where an explicit
 * `null` on any field means "delete this key" (see `applyShallowMergePatch`).
 */
export type Patch<T> = { [K in keyof T]?: T[K] | null };

export interface AddNodeOp {
  op: 'addNode';
  node: NodeInput;
  before?: Selector;
  after?: Selector;
}
export interface UpdateNodeOp {
  op: 'updateNode';
  target: Selector;
  patch: Patch<NodeInput>;
}
export interface RemoveNodeOp {
  op: 'removeNode';
  target: Selector;
  cascade?: boolean;
}
export interface RenameIdOp {
  op: 'renameId';
  from: string;
  to: string;
}
export interface AddGroupOp {
  op: 'addGroup';
  group: GroupInput;
  before?: Selector;
  after?: Selector;
}
export interface UpdateGroupOp {
  op: 'updateGroup';
  target: Selector;
  patch: Patch<GroupInput>;
}
export interface RemoveGroupOp {
  op: 'removeGroup';
  target: Selector;
  cascade?: boolean;
}
export interface AddEdgeOp {
  op: 'addEdge';
  edge: EdgeInput;
  before?: Selector;
  after?: Selector;
}
export interface UpdateEdgeOp {
  op: 'updateEdge';
  target: Selector;
  patch: Patch<EdgeInput>;
}
export interface RemoveEdgeOp {
  op: 'removeEdge';
  target: Selector;
}
export interface AddParticipantOp {
  op: 'addParticipant';
  participant: ParticipantInput;
  before?: Selector;
  after?: Selector;
}
export interface UpdateParticipantOp {
  op: 'updateParticipant';
  target: Selector;
  patch: Patch<ParticipantInput>;
}
export interface RemoveParticipantOp {
  op: 'removeParticipant';
  target: Selector;
  cascade?: boolean;
}
export interface InsertMessageOp {
  op: 'insertMessage';
  item: MessageInput | FragmentInput;
  before?: Selector;
  after?: Selector;
  /**
   * Explicit append to the file's top-level `messages` list — *not*
   * relative to whatever fragment an `after`/`before` selector might have
   * landed in. This plan only implements the top-level form; a
   * fragment-relative "end of this fragment" anchor is not supported (use
   * `after` with a selector to the fragment's last child instead). Mutually
   * exclusive with `before`/`after` (`OpSchema`'s `insertMessage` member
   * refuses any two of the three).
   */
  at?: 'end';
}
export interface UpdateMessageOp {
  op: 'updateMessage';
  target: Selector;
  patch: Patch<MessageInput>;
}
export interface RemoveMessageOp {
  op: 'removeMessage';
  target: Selector;
}
export interface AddNoteOp {
  op: 'addNote';
  note: NoteInput;
}
export interface UpdateNoteOp {
  op: 'updateNote';
  target: Selector;
  patch: Patch<NoteInput>;
}
export interface RemoveNoteOp {
  op: 'removeNote';
  target: Selector;
}
export interface AddCalloutOp {
  op: 'addCallout';
  callout: CalloutInput;
}
export interface UpdateCalloutOp {
  op: 'updateCallout';
  target: Selector;
  patch: Patch<CalloutInput>;
}
export interface RemoveCalloutOp {
  op: 'removeCallout';
  target: Selector;
}
/**
 * Upserts a view by id. **Full replacement, not a merge**: when a view with
 * `view.id` already exists, its entire mapping is replaced by `view` — a
 * field that existed on the old view but is omitted here (e.g. dropping
 * `title`) is cleared, not left in place.
 */
export interface SetViewOp {
  op: 'setView';
  view: ViewInput;
}
export interface RemoveViewOp {
  op: 'removeView';
  id: string;
}
export interface SetMetaOp {
  op: 'setMeta';
  patch: { title?: string | null; direction?: Direction; layout?: LayoutEngine; theme?: Theme };
}

export type Op =
  | AddNodeOp
  | UpdateNodeOp
  | RemoveNodeOp
  | RenameIdOp
  | AddGroupOp
  | UpdateGroupOp
  | RemoveGroupOp
  | AddEdgeOp
  | UpdateEdgeOp
  | RemoveEdgeOp
  | AddParticipantOp
  | UpdateParticipantOp
  | RemoveParticipantOp
  | InsertMessageOp
  | UpdateMessageOp
  | RemoveMessageOp
  | AddNoteOp
  | UpdateNoteOp
  | RemoveNoteOp
  | AddCalloutOp
  | UpdateCalloutOp
  | RemoveCalloutOp
  | SetViewOp /* full replacement by id, not a merge — see SetViewOp's doc comment */
  | RemoveViewOp
  | SetMetaOp;

const selectorSchema: z.ZodType<Selector> = z.union([
  z.object({ id: z.string() }),
  z.object({ from: z.string(), to: z.string() }),
  z.object({ path: z.string() }),
]);

// Lightweight, structural-only payload schemas. Full shape/semantic
// validation of the resulting file happens on every op via `parse()` (see
// DiagramDocument.apply / Task 10's runBatch); OpSchema only needs to
// validate enough for safe dispatch and for MCP's generated tool-argument
// JSON Schema.
const nodeInputSchema = z.object({ id: z.string() }).passthrough();
const groupInputSchema = z.object({ id: z.string() }).passthrough();
const edgeInputSchema = z.object({ from: z.string(), to: z.string() }).passthrough();
const participantInputSchema = z.object({ id: z.string() }).passthrough();
// A message or a fragment — fragments carry `fragment`/`messages`, messages
// carry `from`/`to`.
const messageOrFragmentInputSchema: z.ZodType<Record<string, unknown>> = z.union([
  z.object({ from: z.string(), to: z.string() }).passthrough(),
  z
    .object({ fragment: z.enum(['alt', 'loop', 'opt', 'par']), messages: z.array(z.unknown()) })
    .passthrough(),
]);
const patchSchema = z.record(z.string(), z.unknown());
const noteInputSchema = z.object({ text: z.string() }).passthrough();
const calloutInputSchema = z
  .object({ at: z.union([z.string(), z.object({ from: z.string(), to: z.string() })]) })
  .passthrough();
const viewInputSchema = z.object({ id: z.string(), focus: z.array(z.string()) }).passthrough();

/**
 * Shared refinement for every op accepting both a `before` and an `after`
 * selector (addNode, addGroup, addEdge, addParticipant): the two disagree
 * about where to anchor the insertion, so only one may be given. Zod v4's
 * `.refine` returns `this` (the same `ZodObject` type, not a wrapping
 * `ZodEffects`), so appending it here keeps every member of `OpSchema` a
 * plain object schema, which `z.discriminatedUnion` requires.
 */
function rejectBothAnchors(op: { before?: unknown; after?: unknown }): boolean {
  return op.before === undefined || op.after === undefined;
}
const BOTH_ANCHORS_REFINEMENT: { path: PropertyKey[]; message: string } = {
  path: ['before'],
  message: 'give either before or after, not both',
};

/**
 * `insertMessage`'s own three-way version of `rejectBothAnchors`: `before`,
 * `after`, and `at: 'end'` are three different, mutually exclusive ways of
 * saying where the new item goes, so at most one may be given.
 */
function rejectAnchorConflicts(op: { before?: unknown; after?: unknown; at?: unknown }): boolean {
  const given = [op.before, op.after, op.at].filter((value) => value !== undefined).length;
  return given <= 1;
}
const ANCHOR_CONFLICT_REFINEMENT: { path: PropertyKey[]; message: string } = {
  path: ['before'],
  message: 'give one of before, after or at',
};

export const OpSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('addNode'),
      node: nodeInputSchema,
      before: selectorSchema.optional(),
      after: selectorSchema.optional(),
    })
    .strict()
    .refine(rejectBothAnchors, BOTH_ANCHORS_REFINEMENT),
  z.object({ op: z.literal('updateNode'), target: selectorSchema, patch: patchSchema }).strict(),
  z
    .object({
      op: z.literal('removeNode'),
      target: selectorSchema,
      cascade: z.boolean().optional(),
    })
    .strict(),
  z.object({ op: z.literal('renameId'), from: z.string(), to: z.string() }).strict(),
  z
    .object({
      op: z.literal('addGroup'),
      group: groupInputSchema,
      before: selectorSchema.optional(),
      after: selectorSchema.optional(),
    })
    .strict()
    .refine(rejectBothAnchors, BOTH_ANCHORS_REFINEMENT),
  z.object({ op: z.literal('updateGroup'), target: selectorSchema, patch: patchSchema }).strict(),
  z
    .object({
      op: z.literal('removeGroup'),
      target: selectorSchema,
      cascade: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('addEdge'),
      edge: edgeInputSchema,
      before: selectorSchema.optional(),
      after: selectorSchema.optional(),
    })
    .strict()
    .refine(rejectBothAnchors, BOTH_ANCHORS_REFINEMENT),
  z.object({ op: z.literal('updateEdge'), target: selectorSchema, patch: patchSchema }).strict(),
  z.object({ op: z.literal('removeEdge'), target: selectorSchema }).strict(),
  z
    .object({
      op: z.literal('addParticipant'),
      participant: participantInputSchema,
      before: selectorSchema.optional(),
      after: selectorSchema.optional(),
    })
    .strict()
    .refine(rejectBothAnchors, BOTH_ANCHORS_REFINEMENT),
  z
    .object({ op: z.literal('updateParticipant'), target: selectorSchema, patch: patchSchema })
    .strict(),
  z
    .object({
      op: z.literal('removeParticipant'),
      target: selectorSchema,
      cascade: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('insertMessage'),
      item: messageOrFragmentInputSchema,
      before: selectorSchema.optional(),
      after: selectorSchema.optional(),
      at: z.literal('end').optional(),
    })
    .strict()
    .refine(rejectAnchorConflicts, ANCHOR_CONFLICT_REFINEMENT),
  z.object({ op: z.literal('updateMessage'), target: selectorSchema, patch: patchSchema }).strict(),
  z.object({ op: z.literal('removeMessage'), target: selectorSchema }).strict(),
  z.object({ op: z.literal('addNote'), note: noteInputSchema }).strict(),
  z.object({ op: z.literal('updateNote'), target: selectorSchema, patch: patchSchema }).strict(),
  z.object({ op: z.literal('removeNote'), target: selectorSchema }).strict(),
  z.object({ op: z.literal('addCallout'), callout: calloutInputSchema }).strict(),
  z.object({ op: z.literal('updateCallout'), target: selectorSchema, patch: patchSchema }).strict(),
  z.object({ op: z.literal('removeCallout'), target: selectorSchema }).strict(),
  z.object({ op: z.literal('setView'), view: viewInputSchema }).strict(),
  z.object({ op: z.literal('removeView'), id: z.string() }).strict(),
  z
    .object({
      op: z.literal('setMeta'),
      patch: z.object({
        title: z.string().nullable().optional(),
        direction: z.enum(['down', 'right', 'up', 'left']).optional(),
        layout: z.enum(['dagre', 'elk', 'tala']).optional(),
        theme: z.enum(['light', 'dark']).optional(),
      }),
    })
    .strict(),
]);

export function zodIssuesToValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: formatZodPath(issue.path), message: issue.message }));
}

/**
 * Parses an arbitrary (e.g. wire-received) value into an `Op` against
 * `OpSchema`, the single place this project narrows `OpSchema`'s zod-
 * inferred output to the hand-written `Op` union (I5). `DiagramDocument.
 * apply` uses this instead of calling `OpSchema.safeParse` directly.
 *
 * The `as Op` below is the one unavoidable cast this narrowing needs, not
 * an `as unknown as` escape hatch: `parsed.data`'s zod-inferred shape and
 * `Op` describe the exact same runtime values, but disagree at the type
 * level under `exactOptionalPropertyTypes` — zod types every `.optional()`
 * field as `T | undefined` whether or not the key is present, while `Op`'s
 * optional fields must be entirely absent when not given. Zod itself never
 * writes an explicit `undefined` for an absent optional key (it simply
 * omits it), so every value `parsed.data` can actually hold already
 * satisfies `Op`'s stricter shape — this cast just tells the type checker
 * that.
 */
export function parseOp(
  raw: unknown,
): { ok: true; op: Op } | { ok: false; issues: ValidationIssue[] } {
  const parsed = OpSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: zodIssuesToValidationIssues(parsed.error) };
  }
  return { ok: true, op: parsed.data as Op };
}

/** Stringifies a yaml-Document path array as `nodes[2].label`. */
export function pathToString(path: (string | number)[]): string {
  let out = '';
  for (const [i, seg] of path.entries()) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else out += i === 0 ? seg : `.${seg}`;
  }
  return out;
}

/**
 * Whether `value` can be written directly into a live `Scalar` node's
 * `.value` (see `applyShallowMergePatch`) instead of requiring a fresh node
 * from `clone.createNode`. Only the plain scalar JS types a YAML scalar can
 * actually hold — a collection value always needs a real `YAMLMap`/`YAMLSeq`
 * built via `createNode`.
 */
function isScalarPatchValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Applies a shallow merge patch at `itemPath`: each key in `patch` is set
 * via `setIn`, except a `null` value, which deletes that key via
 * `deleteIn`. Returns the dotted/bracketed path of every field touched.
 *
 * A non-null value that lands on an existing live `Scalar` node (fetched via
 * `clone.getIn(fieldPath, true)`, which keeps the real node — comments and
 * all — rather than unwrapping it to a plain JS value) is written in place
 * as `live.value = value`, *not* replaced via `setIn`/`createNode`. This is
 * what keeps a field's `.comment`/`.commentBefore` intact across an update
 * (C1): swapping in a brand-new node the way `createNode` does would leave
 * the old node, and its comment, behind. The live scalar's `.type` (its
 * quoting style) is deliberately left untouched too — if the old value was
 * quoted (e.g. `"yes"`, a YAML 1.1 boolean-like word) and the new value no
 * longer needs quoting, the field stays quoted rather than being reformatted;
 * that's an acceptable, documented trade-off for keeping the comment.
 *
 * Every other case still goes through `clone.createNode(value)` rather than
 * the raw `value`: a brand-new key (nothing live to mutate yet), or a value
 * that isn't a plain scalar — most patched fields are scalars (label, text,
 * ...), but a handful are arrays/objects: `style` on
 * `updateNode`/`updateEdge`/etc., and `updateCallout`'s object-form
 * `at: { from, to }`. Passing those raw to `setIn` stores a plain JS
 * array/object in the tree instead of a `YAMLSeq`/`YAMLMap`: `toString()`
 * still renders it correctly, but a *later* op that needs to splice into or
 * index into that same field (e.g. `removeNode`'s cascade stripping an id
 * out of a view's `focus`, Task 4) throws, because the raw array has no
 * `.items`. Wrapping through `createNode` here means every field this
 * function ever sets this way is a real node, regardless of shape.
 * (`setView`'s upsert does *not* go through this function at all — it's a
 * full replacement via `replaceAt`, not a merge; see Task 9.)
 */
export function applyShallowMergePatch(
  clone: Document,
  itemPath: (string | number)[],
  patch: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const fieldPath = [...itemPath, key];
    if (value === null) {
      clone.deleteIn(fieldPath);
    } else {
      const live = clone.getIn(fieldPath, true);
      if (live instanceof Scalar && isScalarPatchValue(value)) {
        live.value = value;
      } else {
        clone.setIn(fieldPath, clone.createNode(value));
      }
    }
    changed.push(pathToString(fieldPath));
  }
  return changed;
}

/**
 * Resolves an `add*` op's `before`/`after` selector to an insertion index
 * into `list` (the model's sibling array for the family being added to).
 * Defaults to `list.length` (append) when neither is given. Returns an
 * `{ issues }` object instead of a number when the selector can't be
 * resolved or resolves to the wrong element kind.
 */
export function resolveSiblingIndex<T extends ElementModel>(
  model: Diagram,
  list: T[],
  expectedKind: T['kind'],
  before: Selector | undefined,
  after: Selector | undefined,
): number | { issues: ValidationIssue[] } {
  if (before === undefined && after === undefined) return list.length;
  const isBefore = before !== undefined;
  const selector = (before ?? after) as Selector;
  const resolved = resolveSelector(model, selector);
  if ('code' in resolved) {
    return { issues: [{ path: isBefore ? 'before' : 'after', message: resolved.message }] };
  }
  if (resolved.element.kind !== expectedKind) {
    return {
      issues: [
        {
          path: isBefore ? 'before' : 'after',
          message: `selector "${resolved.key}" does not resolve to a ${expectedKind}`,
        },
      ],
    };
  }
  const idx = list.indexOf(resolved.element as T);
  return isBefore ? idx : idx + 1;
}

/**
 * Shared implementation for every `update*` op that targets a flat,
 * top-level list (nodes/groups/edges/participants/notes/callouts — not
 * messages, which are addressed by position path instead of list index;
 * see `ops.sequence.ts`).
 */
export function applyUpdateGeneric<T extends ElementModel>(
  clone: Document,
  model: Diagram,
  listRoot: string,
  list: T[],
  expectedKind: T['kind'],
  target: Selector,
  patch: Record<string, unknown>,
): OpApplyResult {
  const resolved = resolveSelector(model, target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== expectedKind) {
    return {
      issues: [
        {
          path: 'target',
          message: `selector "${resolved.key}" does not resolve to a ${expectedKind}`,
        },
      ],
    };
  }
  const idx = list.indexOf(resolved.element as T);
  const changed = applyShallowMergePatch(clone, [listRoot, idx], patch);
  return { changed };
}

/**
 * Shared "family" guard (M13) for every op that only makes sense for graph
 * (flowchart/architecture) diagrams — refuses with the same wording every
 * such op previously duplicated by hand: `` `${op} is only valid for
 * flowchart and architecture diagrams` `` at `path`. `op`/`path` are plain
 * strings, not literally tied to the caller's own op name — `applySetMeta`
 * (`ops.annotations.ts`) reuses this for its `direction`-only rule by
 * passing `'direction'` for both, reproducing that op's pre-existing,
 * differently-worded message exactly.
 *
 * Narrows `model: Diagram` to `GraphDiagram` via TypeScript's own control
 * flow analysis (the `model.type === 'sequence'` check below), the same way
 * every call site's old `const graph: GraphDiagram = model;` did — no cast.
 */
export function requireGraph(
  model: Diagram,
  op: string,
  path: string,
): { graph: GraphDiagram } | { issues: ValidationIssue[] } {
  if (model.type === 'sequence') {
    return {
      issues: [{ path, message: `${op} is only valid for flowchart and architecture diagrams` }],
    };
  }
  return { graph: model };
}

/**
 * `requireGraph`'s counterpart (M13) for every op that only makes sense for
 * sequence diagrams.
 */
export function requireSequence(
  model: Diagram,
  op: string,
  path: string,
): { seq: SequenceDiagram } | { issues: ValidationIssue[] } {
  if (model.type !== 'sequence') {
    return { issues: [{ path, message: `${op} is only valid for sequence diagrams` }] };
  }
  return { seq: model };
}

/**
 * Strips every key in `removedKeys` out of the `focus` list of every view in
 * `views` that focuses one of them, live on `clone` — the cascade step
 * shared (M13) by `removeNode`/`removeGroup` (`ops.graph.ts`) and
 * `removeParticipant` (`ops.sequence.ts`), the three ops whose removal
 * closure can reach a view's `focus`. Computes which views are affected
 * itself (rather than taking a pre-filtered list) so its signature stays
 * just `(clone, views, removedKeys)`; callers that also need the affected
 * view list for a refusal message (when `cascade` wasn't passed) still
 * compute that separately — this is cheap enough to not be worth caching.
 * Returns the `views[id].focus` paths touched, for the caller to fold into
 * its own `changed` array.
 */
export function stripFocus(
  clone: Document,
  views: readonly ViewModel[],
  removedKeys: readonly string[],
): string[] {
  const changed: string[] = [];
  const removedSet = new Set(removedKeys);
  views.forEach((view, viewIdx) => {
    if (!view.focus.some((focusKey) => removedSet.has(focusKey))) return;
    const focusSeq = clone.getIn(['views', viewIdx, 'focus']) as YAMLSeq;
    for (const removedKey of removedKeys) {
      const focusIdx = focusSeq.items.findIndex(
        (item) => item instanceof Scalar && item.value === removedKey,
      );
      if (focusIdx >= 0) removeAt(focusSeq, focusIdx);
    }
    changed.push(`views[${view.id}].focus`);
  });
  return changed;
}

/**
 * Merges `extra` into `base`, omitting any key in `extra` whose value is
 * `undefined`. Required because this project enables
 * `exactOptionalPropertyTypes`, under which an optional field must be
 * entirely absent rather than present with the value `undefined`.
 *
 * The return type strips `| undefined` from each `Extra` field (rather than
 * a plain `Partial<Extra>`, which would keep it) so that a caller passing a
 * `T | undefined`-typed value — the exact case this helper exists for —
 * gets back a type where that field is genuinely optional, never "optional
 * and possibly present as `undefined`", which `exactOptionalPropertyTypes`
 * treats as a distinct (and here, wrong) shape.
 */
export function withOptional<
  Base extends Record<string, unknown>,
  Extra extends Record<string, unknown>,
>(base: Base, extra: Extra): Base & { [K in keyof Extra]?: Exclude<Extra[K], undefined> } {
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(extra)) {
    const value = extra[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged as Base & { [K in keyof Extra]?: Exclude<Extra[K], undefined> };
}

/** If the value at `path` is the plain string `from`, rewrites it to `to`. */
export function rewriteIdField(
  clone: Document,
  path: (string | number)[],
  from: string,
  to: string,
  changed: string[],
): void {
  if (clone.getIn(path) === from) {
    clone.setIn(path, to);
    changed.push(pathToString(path));
  }
}

/**
 * Rewrites an annotation `at` field at `path`: if it's the plain string
 * `from`, replaces it with `to`; if it's a `{ from, to }` mapping (the
 * id-less-edge object form of `at`), rewrites whichever of its own
 * `from`/`to` fields equals `from`.
 */
export function rewriteAtField(
  clone: Document,
  path: (string | number)[],
  from: string,
  to: string,
  changed: string[],
): void {
  const value = clone.getIn(path);
  if (value === from) {
    clone.setIn(path, to);
    changed.push(pathToString(path));
    return;
  }
  if (value instanceof YAMLMap) {
    if (value.get('from') === from) {
      clone.setIn([...path, 'from'], to);
      changed.push(pathToString([...path, 'from']));
    }
    if (value.get('to') === from) {
      clone.setIn([...path, 'to'], to);
      changed.push(pathToString([...path, 'to']));
    }
  }
}

export function applyOp(clone: Document, model: Diagram, op: Op): OpApplyResult {
  switch (op.op) {
    case 'addNode':
      return applyAddNode(clone, model, op);
    case 'updateNode':
      return applyUpdateNode(clone, model, op);
    case 'removeNode':
      return applyRemoveNode(clone, model, op);
    case 'renameId':
      return applyRenameId(clone, model, op);
    case 'addGroup':
      return applyAddGroup(clone, model, op);
    case 'updateGroup':
      return applyUpdateGroup(clone, model, op);
    case 'removeGroup':
      return applyRemoveGroup(clone, model, op);
    case 'addEdge':
      return applyAddEdge(clone, model, op);
    case 'updateEdge':
      return applyUpdateEdge(clone, model, op);
    case 'removeEdge':
      return applyRemoveEdge(clone, model, op);
    case 'addParticipant':
      return applyAddParticipant(clone, model, op);
    case 'updateParticipant':
      return applyUpdateParticipant(clone, model, op);
    case 'removeParticipant':
      return applyRemoveParticipant(clone, model, op);
    case 'insertMessage':
      return applyInsertMessage(clone, model, op);
    case 'updateMessage':
      return applyUpdateMessage(clone, model, op);
    case 'removeMessage':
      return applyRemoveMessage(clone, model, op);
    case 'addNote':
      return applyAddNote(clone, model, op);
    case 'updateNote':
      return applyUpdateNote(clone, model, op);
    case 'removeNote':
      return applyRemoveNote(clone, model, op);
    case 'addCallout':
      return applyAddCallout(clone, model, op);
    case 'updateCallout':
      return applyUpdateCallout(clone, model, op);
    case 'removeCallout':
      return applyRemoveCallout(clone, model, op);
    case 'setView':
      return applySetView(clone, model, op);
    case 'removeView':
      return applyRemoveView(clone, model, op);
    case 'setMeta':
      return applySetMeta(clone, model, op);
  }
}
