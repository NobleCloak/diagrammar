import type { Document } from 'yaml';
import { YAMLSeq } from 'yaml';
import type { Diagram, GraphDiagram, SequenceDiagram, SequenceItem } from '../model/types.js';
import { indexElements } from '../model/types.js';
import { resolveSelector } from '../model/selectors.js';
import { getOrCreateSeq, styleOfFirstItem, createItem, insertAt, removeAt } from './yamlStyle.js';
import { parseMessagePathTokens } from './ops.sequence.js';
import {
  applyUpdateGeneric,
  resolveSiblingIndex,
  rewriteIdField,
  rewriteAtField,
  requireGraph,
  stripFocus,
  type AddNodeOp,
  type OpApplyResult,
  type UpdateNodeOp,
  type RemoveNodeOp,
  type RenameIdOp,
  type AddGroupOp,
  type UpdateGroupOp,
  type RemoveGroupOp,
  type AddEdgeOp,
  type UpdateEdgeOp,
  type RemoveEdgeOp,
} from './ops.js';

export function applyAddNode(clone: Document, model: Diagram, op: AddNodeOp): OpApplyResult {
  const guard = requireGraph(model, 'addNode', 'nodes');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  const anchor = resolveSiblingIndex(model, graph.nodes, 'node', op.before, op.after);
  if (typeof anchor !== 'number') return anchor;
  const seq = getOrCreateSeq(clone, 'nodes');
  const style = styleOfFirstItem(seq);
  const node = createItem(clone, op.node, style);
  insertAt(seq, anchor, node);
  return { changed: [`nodes[${anchor}]`] };
}

export function applyUpdateNode(clone: Document, model: Diagram, op: UpdateNodeOp): OpApplyResult {
  const guard = requireGraph(model, 'updateNode', 'nodes');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  return applyUpdateGeneric(
    clone,
    model,
    'nodes',
    graph.nodes,
    'node',
    op.target,
    op.patch as Record<string, unknown>,
  );
}

/**
 * Computes the transitive removal closure for `removeNode`, `removeGroup`
 * (Task 5), and `removeParticipant` (sequence, Task 7 — which extends this
 * function's `messages` branch and imports it from here): given the key(s)
 * being removed directly, finds every edge (graph) or message (sequence)
 * referencing any of them, then every note/callout targeting any of those
 * keys *or* the directly-removed key(s) — so a callout on an edge/message
 * that is itself being cascaded away is included too. `edges` is always
 * `[]` for a group key (nothing connects to a group via `from`/`to` the way
 * an edge connects to a node), which is exactly the behavior `removeGroup`
 * needs. Returns only the newly discovered keys, not `rootKeys` themselves
 * — callers build the full removed-key list as `[...rootKeys, ...edges,
 * ...messages, ...notes, ...callouts]`, which is both `OpResult.removed`'s
 * order and the exact set to strip out of every view's `focus`.
 *
 * The `messages` branch is added in Task 7; until then it is always `[]`,
 * which is correct because this function is only called with graph-family
 * models before Task 7 exists.
 */
export function collectCascade(
  model: Diagram,
  rootKeys: string[],
): { edges: string[]; messages: string[]; notes: string[]; callouts: string[] } {
  const rootSet = new Set(rootKeys);
  const edges =
    model.type !== 'sequence'
      ? model.edges
          .filter((edge) => rootSet.has(edge.from) || rootSet.has(edge.to))
          .map((edge) => edge.key)
      : [];
  const messages =
    model.type === 'sequence' ? collectMessageKeysReferencing(model.items, rootSet) : [];
  const targetSet = new Set([...rootKeys, ...edges, ...messages]);
  const notes = model.notes
    .filter((note) => note.at !== undefined && targetSet.has(note.at))
    .map((note) => note.key);
  const callouts = model.callouts
    .filter((callout) => targetSet.has(callout.at))
    .map((callout) => callout.key);
  return { edges, messages, notes, callouts };
}

/**
 * Recursively collects the `.key` of every message (through fragments) in
 * `items` whose `from` or `to` is in `targetSet`. Used by `collectCascade`
 * for the sequence family, exactly analogous to the `edges` computation for
 * the graph family.
 */
function collectMessageKeysReferencing(items: SequenceItem[], targetSet: Set<string>): string[] {
  const result: string[] = [];
  for (const item of items) {
    if (item.kind === 'message') {
      if (targetSet.has(item.from) || targetSet.has(item.to)) result.push(item.key);
    } else {
      result.push(...collectMessageKeysReferencing(item.messages, targetSet));
    }
  }
  return result;
}

/**
 * Removes every item in `list` whose `.key` is in `keys` from `clone`'s
 * top-level `seqKey` sequence, in descending index order so earlier
 * removals don't shift the indices of later ones. Records `seqKey` in
 * `changed` if anything was removed. Only valid for flat, top-level,
 * `.key`-bearing lists (edges, notes, callouts) — messages are removed
 * differently (`ops.sequence.ts`'s position-path-based removal, since a
 * message can be nested inside a fragment).
 */
/**
 * Formats a referencing element's key for a removal-refusal message.
 * `key` is either the element's own id or (when id-less) the synthetic
 * position path `build.ts` already gives it, e.g. `notes[0]` or
 * `messages[2].messages[0]` — wrapping that again as `${listKey}[${key}]`
 * would double up into `notes[notes[0]]` (or, for a nested id-less message,
 * `messages[messages[2].messages[0]]`). Position-path keys always contain
 * `[`, real ids never do, so that's the discriminator: emit the key as-is
 * when it's already a position path, otherwise wrap it in `listKey[...]`.
 * Shared by the graph family (`removeNode`/`removeGroup`/`removeEdge`,
 * here) and the sequence family (`removeParticipant`/`removeMessage`,
 * `ops.sequence.ts` — I3/I8), which is why this is exported.
 */
export function formatRefKey(listKey: string, key: string): string {
  return key.includes('[') ? key : `${listKey}[${key}]`;
}

function removeByKeys<T extends { key: string }>(
  clone: Document,
  seqKey: string,
  list: readonly T[],
  keys: readonly string[],
  changed: string[],
): void {
  if (keys.length === 0) return;
  const seq = clone.get(seqKey) as YAMLSeq | undefined;
  if (seq === undefined) return;
  const indices = keys.map((k) => list.findIndex((item) => item.key === k)).sort((a, b) => b - a);
  for (const idx of indices) {
    // M9: a key not found in `list` yields -1 from findIndex — `removeAt`
    // would then splice from the *end* of the sequence (Array#splice's
    // negative-index behavior), silently removing the wrong item instead
    // of no-op-ing on a key that was never in this list.
    if (idx < 0) continue;
    removeAt(seq, idx);
  }
  changed.push(seqKey);
}

export function applyRemoveNode(clone: Document, model: Diagram, op: RemoveNodeOp): OpApplyResult {
  const guard = requireGraph(model, 'removeNode', 'nodes');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  const resolved = resolveSelector(model, op.target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== 'node') {
    return {
      issues: [
        { path: 'target', message: `selector "${resolved.key}" does not resolve to a node` },
      ],
    };
  }
  const key = resolved.key;
  const cascade = collectCascade(model, [key]);
  const removedKeys = [
    key,
    ...cascade.edges,
    ...cascade.messages,
    ...cascade.notes,
    ...cascade.callouts,
  ];
  const referencingViews = graph.views.filter((view) =>
    view.focus.some((focusKey) => removedKeys.includes(focusKey)),
  );
  const hasReferences =
    cascade.edges.length > 0 ||
    cascade.notes.length > 0 ||
    cascade.callouts.length > 0 ||
    referencingViews.length > 0;
  if (hasReferences && op.cascade !== true) {
    const refs = [
      ...cascade.edges.map((k) => `edges[${k}]`),
      ...cascade.notes.map((k) => formatRefKey('notes', k)),
      ...cascade.callouts.map((k) => formatRefKey('callouts', k)),
      ...referencingViews.map((view) => `views[${view.id}].focus`),
    ];
    return {
      issues: [
        {
          path: 'target',
          message: `cannot remove "${key}": referenced by ${refs.join(', ')} (pass cascade: true to remove them)`,
        },
      ],
    };
  }
  const changed: string[] = [];
  removeByKeys(clone, 'edges', graph.edges, cascade.edges, changed);
  removeByKeys(clone, 'notes', graph.notes, cascade.notes, changed);
  removeByKeys(clone, 'callouts', graph.callouts, cascade.callouts, changed);
  changed.push(...stripFocus(clone, graph.views, removedKeys));
  const nodeIdx = graph.nodes.indexOf(resolved.element);
  const nodesSeq = clone.get('nodes') as YAMLSeq;
  removeAt(nodesSeq, nodeIdx);
  changed.push('nodes');
  return { changed, removed: removedKeys };
}

export function applyRenameId(clone: Document, model: Diagram, op: RenameIdOp): OpApplyResult {
  const index = indexElements(model);
  const found = index.get(op.from);
  if (found === undefined) {
    const isView = model.views.some((view) => view.id === op.from);
    return {
      issues: [
        {
          path: 'from',
          message: isView
            ? `"${op.from}" is a view id; renameId does not support renaming views`
            : `no element with id "${op.from}"`,
        },
      ],
    };
  }
  const toTaken = index.get(op.to) !== undefined || model.views.some((view) => view.id === op.to);
  if (toTaken) {
    return { issues: [{ path: 'to', message: `id "${op.to}" already exists` }] };
  }
  const changed: string[] = [];
  if (model.type !== 'sequence') {
    const graph: GraphDiagram = model;
    const nodeIdx = graph.nodes.findIndex((node) => node.id === op.from);
    if (nodeIdx >= 0) rewriteIdField(clone, ['nodes', nodeIdx, 'id'], op.from, op.to, changed);
    const groupIdx = graph.groups.findIndex((group) => group.id === op.from);
    if (groupIdx >= 0) rewriteIdField(clone, ['groups', groupIdx, 'id'], op.from, op.to, changed);
    const edgeIdx = graph.edges.findIndex((edge) => edge.id === op.from);
    if (edgeIdx >= 0) rewriteIdField(clone, ['edges', edgeIdx, 'id'], op.from, op.to, changed);
    graph.nodes.forEach((node, i) => {
      if (node.group === op.from)
        rewriteIdField(clone, ['nodes', i, 'in'], op.from, op.to, changed);
    });
    graph.groups.forEach((group, i) => {
      if (group.parent === op.from)
        rewriteIdField(clone, ['groups', i, 'in'], op.from, op.to, changed);
    });
    graph.edges.forEach((edge, i) => {
      if (edge.from === op.from)
        rewriteIdField(clone, ['edges', i, 'from'], op.from, op.to, changed);
      if (edge.to === op.from) rewriteIdField(clone, ['edges', i, 'to'], op.from, op.to, changed);
    });
  } else {
    const seqDiagram: SequenceDiagram = model;
    const participantIdx = seqDiagram.participants.findIndex(
      (participant) => participant.id === op.from,
    );
    if (participantIdx >= 0)
      rewriteIdField(clone, ['participants', participantIdx, 'id'], op.from, op.to, changed);
    renameInSequenceItems(clone, seqDiagram.items, op.from, op.to, changed);
  }
  for (const [i, note] of model.notes.entries()) {
    if (note.id === op.from) rewriteIdField(clone, ['notes', i, 'id'], op.from, op.to, changed);
    rewriteAtField(clone, ['notes', i, 'at'], op.from, op.to, changed);
  }
  for (const [i, callout] of model.callouts.entries()) {
    if (callout.id === op.from)
      rewriteIdField(clone, ['callouts', i, 'id'], op.from, op.to, changed);
    rewriteAtField(clone, ['callouts', i, 'at'], op.from, op.to, changed);
  }
  for (const [vi, view] of model.views.entries()) {
    view.focus.forEach((focusKey, fi) => {
      if (focusKey === op.from) {
        clone.setIn(['views', vi, 'focus', fi], op.to);
        changed.push(`views[${view.id}].focus[${fi}]`);
      }
    });
  }
  return { changed };
}

function renameInSequenceItems(
  clone: Document,
  items: SequenceItem[],
  from: string,
  to: string,
  changed: string[],
): void {
  for (const item of items) {
    if (item.kind === 'message') {
      const tokens = parseMessagePathTokens(item.path);
      if (item.id === from) rewriteIdField(clone, [...tokens, 'id'], from, to, changed);
      if (item.from === from) rewriteIdField(clone, [...tokens, 'from'], from, to, changed);
      if (item.to === from) rewriteIdField(clone, [...tokens, 'to'], from, to, changed);
    } else {
      renameInSequenceItems(clone, item.messages, from, to, changed);
    }
  }
}

export function applyAddGroup(clone: Document, model: Diagram, op: AddGroupOp): OpApplyResult {
  const guard = requireGraph(model, 'addGroup', 'groups');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  const anchor = resolveSiblingIndex(model, graph.groups, 'group', op.before, op.after);
  if (typeof anchor !== 'number') return anchor;
  const seq = getOrCreateSeq(clone, 'groups');
  const style = styleOfFirstItem(seq);
  const group = createItem(clone, op.group, style);
  insertAt(seq, anchor, group);
  return { changed: [`groups[${anchor}]`] };
}

export function applyUpdateGroup(
  clone: Document,
  model: Diagram,
  op: UpdateGroupOp,
): OpApplyResult {
  const guard = requireGraph(model, 'updateGroup', 'groups');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  return applyUpdateGeneric(
    clone,
    model,
    'groups',
    graph.groups,
    'group',
    op.target,
    op.patch as Record<string, unknown>,
  );
}

export function applyRemoveGroup(
  clone: Document,
  model: Diagram,
  op: RemoveGroupOp,
): OpApplyResult {
  const guard = requireGraph(model, 'removeGroup', 'groups');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  const resolved = resolveSelector(model, op.target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== 'group') {
    return {
      issues: [
        { path: 'target', message: `selector "${resolved.key}" does not resolve to a group` },
      ],
    };
  }
  const key = resolved.key;
  const childNodes = graph.nodes.filter((node) => node.group === key);
  const childGroups = graph.groups.filter((group) => group.parent === key);
  // collectCascade's `edges`/`messages` are always [] for a group key (no
  // edge/message ever has `from`/`to` equal to a group id), so this only
  // ever contributes notes/callouts targeting the group directly.
  const cascade = collectCascade(model, [key]);
  const removedKeys = [key, ...cascade.notes, ...cascade.callouts];
  const referencingViews = graph.views.filter((view) =>
    view.focus.some((focusKey) => removedKeys.includes(focusKey)),
  );
  const hasReferences =
    childNodes.length > 0 ||
    childGroups.length > 0 ||
    cascade.notes.length > 0 ||
    cascade.callouts.length > 0 ||
    referencingViews.length > 0;
  if (hasReferences && op.cascade !== true) {
    const refs = [
      ...childNodes.map((node) => `nodes[${node.id}]`),
      ...childGroups.map((group) => `groups[${group.id}]`),
      ...cascade.notes.map((k) => formatRefKey('notes', k)),
      ...cascade.callouts.map((k) => formatRefKey('callouts', k)),
      ...referencingViews.map((view) => `views[${view.id}].focus`),
    ];
    return {
      issues: [
        {
          path: 'target',
          message: `cannot remove "${key}": referenced by ${refs.join(', ')} (pass cascade: true to remove them)`,
        },
      ],
    };
  }
  const changed: string[] = [];
  for (const node of childNodes) {
    const idx = graph.nodes.indexOf(node);
    clone.deleteIn(['nodes', idx, 'in']);
    changed.push(`nodes[${idx}].in`);
  }
  for (const group of childGroups) {
    const idx = graph.groups.indexOf(group);
    clone.deleteIn(['groups', idx, 'in']);
    changed.push(`groups[${idx}].in`);
  }
  removeByKeys(clone, 'notes', graph.notes, cascade.notes, changed);
  removeByKeys(clone, 'callouts', graph.callouts, cascade.callouts, changed);
  changed.push(...stripFocus(clone, graph.views, removedKeys));
  const groupIdx = graph.groups.indexOf(resolved.element);
  const groupsSeq = clone.get('groups') as YAMLSeq;
  removeAt(groupsSeq, groupIdx);
  changed.push('groups');
  return { changed, removed: removedKeys };
}

export function applyAddEdge(clone: Document, model: Diagram, op: AddEdgeOp): OpApplyResult {
  const guard = requireGraph(model, 'addEdge', 'edges');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  const anchor = resolveSiblingIndex(model, graph.edges, 'edge', op.before, op.after);
  if (typeof anchor !== 'number') return anchor;
  const seq = getOrCreateSeq(clone, 'edges');
  const style = styleOfFirstItem(seq);
  const edge = createItem(clone, op.edge, style);
  insertAt(seq, anchor, edge);
  return { changed: [`edges[${anchor}]`] };
}

export function applyUpdateEdge(clone: Document, model: Diagram, op: UpdateEdgeOp): OpApplyResult {
  const guard = requireGraph(model, 'updateEdge', 'edges');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  return applyUpdateGeneric(
    clone,
    model,
    'edges',
    graph.edges,
    'edge',
    op.target,
    op.patch as Record<string, unknown>,
  );
}

export function applyRemoveEdge(clone: Document, model: Diagram, op: RemoveEdgeOp): OpApplyResult {
  const guard = requireGraph(model, 'removeEdge', 'edges');
  if ('issues' in guard) return guard;
  const { graph } = guard;
  const resolved = resolveSelector(model, op.target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== 'edge') {
    return {
      issues: [
        { path: 'target', message: `selector "${resolved.key}" does not resolve to an edge` },
      ],
    };
  }
  // I8: unlike removeNode/removeGroup/removeParticipant, removeEdge has no
  // `cascade` option — an edge referenced by a note/callout or focused by a
  // view is simply refused, with no way to remove the referencing
  // annotations/views in the same op.
  const key = resolved.key;
  const cascade = collectCascade(model, [key]);
  const referencingViews = graph.views.filter((view) => view.focus.includes(key));
  const hasReferences =
    cascade.notes.length > 0 || cascade.callouts.length > 0 || referencingViews.length > 0;
  if (hasReferences) {
    const refs = [
      ...cascade.notes.map((k) => formatRefKey('notes', k)),
      ...cascade.callouts.map((k) => formatRefKey('callouts', k)),
      ...referencingViews.map((view) => `views[${view.id}].focus`),
    ];
    return {
      issues: [
        { path: 'target', message: `cannot remove "${key}": referenced by ${refs.join(', ')}` },
      ],
    };
  }
  const idx = graph.edges.indexOf(resolved.element);
  const seq = clone.get('edges') as YAMLSeq;
  removeAt(seq, idx);
  return { changed: ['edges'] };
}
