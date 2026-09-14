import { YAMLMap, YAMLSeq } from 'yaml';
import type { Document } from 'yaml';
import type { Diagram } from '../model/types.js';
import { resolveSelector } from '../model/selectors.js';
import {
  getOrCreateSeq,
  styleOfFirstItem,
  createItem,
  insertAt,
  removeAt,
  replaceAt,
  carryNestedFlow,
} from './yamlStyle.js';
import {
  applyUpdateGeneric,
  requireGraph,
  type AddCalloutOp,
  type UpdateCalloutOp,
  type RemoveCalloutOp,
  type AddNoteOp,
  type UpdateNoteOp,
  type RemoveNoteOp,
  type OpApplyResult,
  type SetMetaOp,
  type SetViewOp,
  type RemoveViewOp,
} from './ops.js';

export function applySetMeta(clone: Document, model: Diagram, op: SetMetaOp): OpApplyResult {
  // M13: `direction` is the one field here that's graph-only, so — unlike
  // every other op in this file, which is valid for either diagram family —
  // this is a *conditional* use of the shared family guard: only check (and
  // possibly refuse) when the caller is actually touching `direction`.
  // Reusing `requireGraph` with `'direction'` for both the op-name and path
  // arguments reproduces this rule's original, `direction`-specific wording
  // exactly (`requireGraph`'s template doesn't assume its first argument is
  // literally an op name).
  if (op.patch.direction !== undefined) {
    const guard = requireGraph(model, 'direction', 'direction');
    if ('issues' in guard) return guard;
  }
  const changed: string[] = [];
  for (const [key, value] of Object.entries(op.patch)) {
    if (value === null) clone.deleteIn([key]);
    else clone.setIn([key], value);
    changed.push(key);
  }
  return { changed };
}

export function applyAddNote(clone: Document, model: Diagram, op: AddNoteOp): OpApplyResult {
  const seq = getOrCreateSeq(clone, 'notes');
  const style = styleOfFirstItem(seq);
  const note = createItem(clone, op.note, style);
  const index = seq.items.length;
  insertAt(seq, index, note);
  return { changed: [`notes[${index}]`] };
}

export function applyUpdateNote(clone: Document, model: Diagram, op: UpdateNoteOp): OpApplyResult {
  return applyUpdateGeneric(
    clone,
    model,
    'notes',
    model.notes,
    'note',
    op.target,
    op.patch as Record<string, unknown>,
  );
}

export function applyRemoveNote(clone: Document, model: Diagram, op: RemoveNoteOp): OpApplyResult {
  const resolved = resolveSelector(model, op.target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== 'note') {
    return {
      issues: [
        { path: 'target', message: `selector "${resolved.key}" does not resolve to a note` },
      ],
    };
  }
  const idx = model.notes.indexOf(resolved.element);
  const seq = clone.get('notes') as YAMLSeq;
  removeAt(seq, idx);
  return { changed: ['notes'] };
}

export function applyAddCallout(clone: Document, model: Diagram, op: AddCalloutOp): OpApplyResult {
  const seq = getOrCreateSeq(clone, 'callouts');
  const style = styleOfFirstItem(seq);
  const callout = createItem(clone, op.callout, style);
  const index = seq.items.length;
  insertAt(seq, index, callout);
  return { changed: [`callouts[${index}]`] };
}

export function applyUpdateCallout(
  clone: Document,
  model: Diagram,
  op: UpdateCalloutOp,
): OpApplyResult {
  return applyUpdateGeneric(
    clone,
    model,
    'callouts',
    model.callouts,
    'callout',
    op.target,
    op.patch as Record<string, unknown>,
  );
}

export function applyRemoveCallout(
  clone: Document,
  model: Diagram,
  op: RemoveCalloutOp,
): OpApplyResult {
  const resolved = resolveSelector(model, op.target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== 'callout') {
    return {
      issues: [
        { path: 'target', message: `selector "${resolved.key}" does not resolve to a callout` },
      ],
    };
  }
  const idx = model.callouts.indexOf(resolved.element);
  const seq = clone.get('callouts') as YAMLSeq;
  removeAt(seq, idx);
  return { changed: ['callouts'] };
}

export function applySetView(clone: Document, model: Diagram, op: SetViewOp): OpApplyResult {
  const existingIdx = model.views.findIndex((view) => view.id === op.view.id);
  const seq = getOrCreateSeq(clone, 'views');
  if (existingIdx >= 0) {
    // Full replacement, not a merge (see SetViewOp's doc comment): the
    // whole existing mapping is swapped out for a freshly built one, so a
    // field omitted from `op.view` (e.g. `title`) is genuinely absent from
    // the result, not left over from the old node. The replacement mimics
    // the *existing* view's own flow/block style (not the list's
    // first-sibling style, which is only relevant when adding a new item).
    const existingNode = seq.items[existingIdx];
    const style = existingNode instanceof YAMLMap && existingNode.flow === true ? 'flow' : 'block';
    const replacement = createItem(clone, op.view, style);
    carryNestedFlow(existingNode, replacement);
    replaceAt(seq, existingIdx, replacement);
    return { changed: [`views[${existingIdx}]`] };
  }
  const style = styleOfFirstItem(seq);
  const view = createItem(clone, op.view, style);
  const index = seq.items.length;
  insertAt(seq, index, view);
  return { changed: [`views[${index}]`] };
}

export function applyRemoveView(clone: Document, model: Diagram, op: RemoveViewOp): OpApplyResult {
  const idx = model.views.findIndex((view) => view.id === op.id);
  if (idx < 0) {
    return { issues: [{ path: 'id', message: `no view with id "${op.id}"` }] };
  }
  const seq = clone.get('views') as YAMLSeq;
  removeAt(seq, idx);
  return { changed: ['views'] };
}
