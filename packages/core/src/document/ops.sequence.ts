import type { Document } from 'yaml';
import { YAMLSeq } from 'yaml';
import type { Diagram, SequenceItem } from '../model/types.js';
import { resolveSelector } from '../model/selectors.js';
import { getOrCreateSeq, styleOfFirstItem, createItem, insertAt, removeAt } from './yamlStyle.js';
import { collectCascade, formatRefKey } from './ops.graph.js';
import {
  applyUpdateGeneric,
  applyShallowMergePatch,
  resolveSiblingIndex,
  requireSequence,
  stripFocus,
  type AddParticipantOp,
  type OpApplyResult,
  type UpdateParticipantOp,
  type RemoveParticipantOp,
  type InsertMessageOp,
  type UpdateMessageOp,
  type RemoveMessageOp,
} from './ops.js';

/** "messages[1].messages[0]" -> ['messages', 1, 'messages', 0]. */
export function parseMessagePathTokens(path: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  for (const segment of path.split('.')) {
    const match = /^([a-zA-Z_][\w-]*)\[(\d+)\]$/.exec(segment);
    if (match === null) {
      throw new Error(`unrecognized message path segment: "${segment}"`);
    }
    tokens.push(match[1] as string, Number(match[2]));
  }
  return tokens;
}

export function applyAddParticipant(
  clone: Document,
  model: Diagram,
  op: AddParticipantOp,
): OpApplyResult {
  const guard = requireSequence(model, 'addParticipant', 'participants');
  if ('issues' in guard) return guard;
  const { seq: seqDiagram } = guard;
  const anchor = resolveSiblingIndex(
    model,
    seqDiagram.participants,
    'participant',
    op.before,
    op.after,
  );
  if (typeof anchor !== 'number') return anchor;
  const seq = getOrCreateSeq(clone, 'participants');
  const style = styleOfFirstItem(seq);
  const participant = createItem(clone, op.participant, style);
  insertAt(seq, anchor, participant);
  return { changed: [`participants[${anchor}]`] };
}

export function applyUpdateParticipant(
  clone: Document,
  model: Diagram,
  op: UpdateParticipantOp,
): OpApplyResult {
  const guard = requireSequence(model, 'updateParticipant', 'participants');
  if ('issues' in guard) return guard;
  const { seq: seqDiagram } = guard;
  return applyUpdateGeneric(
    clone,
    model,
    'participants',
    seqDiagram.participants,
    'participant',
    op.target,
    op.patch as Record<string, unknown>,
  );
}

function locateSeqForItems(clone: Document, items: SequenceItem[]): YAMLSeq {
  const first = items[0];
  if (first === undefined) {
    throw new Error('locateSeqForItems called with an empty items list');
  }
  const tokens = parseMessagePathTokens(first.path);
  const containerPath = tokens.slice(0, -1);
  return clone.getIn(containerPath) as YAMLSeq;
}

/**
 * Removes every message in `items` (recursively through fragments) whose
 * `.key` is in `keysToRemove` — the message keys already computed by
 * `collectCascade`, not a re-scan by participant. Removing a fragment's own
 * key is not supported here (fragments aren't part of `collectCascade`'s
 * `messages`); only individual messages are ever cascaded away by
 * `removeParticipant`.
 */
function removeMessagesByKeys(
  clone: Document,
  items: SequenceItem[],
  keysToRemove: readonly string[],
  changed: string[],
): void {
  if (keysToRemove.length === 0) return;
  const keySet = new Set(keysToRemove);
  removeMessagesByKeysRec(clone, items, keySet, changed);
}

function removeMessagesByKeysRec(
  clone: Document,
  items: SequenceItem[],
  keySet: Set<string>,
  changed: string[],
): void {
  for (const item of items) {
    if (item.kind === 'fragment') removeMessagesByKeysRec(clone, item.messages, keySet, changed);
  }
  const matchingIndices = items
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.kind === 'message' && keySet.has(item.key))
    .map(({ i }) => i);
  if (matchingIndices.length === 0) return;
  const seq = locateSeqForItems(clone, items);
  for (const i of [...matchingIndices].sort((a, b) => b - a)) removeAt(seq, i);
  changed.push('messages');
}

export function applyRemoveParticipant(
  clone: Document,
  model: Diagram,
  op: RemoveParticipantOp,
): OpApplyResult {
  const guard = requireSequence(model, 'removeParticipant', 'participants');
  if ('issues' in guard) return guard;
  const { seq: seqDiagram } = guard;
  const resolved = resolveSelector(model, op.target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== 'participant') {
    return {
      issues: [
        { path: 'target', message: `selector "${resolved.key}" does not resolve to a participant` },
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
  const referencingViews = model.views.filter((view) =>
    view.focus.some((focusKey) => removedKeys.includes(focusKey)),
  );
  const hasReferences =
    cascade.messages.length > 0 ||
    cascade.notes.length > 0 ||
    cascade.callouts.length > 0 ||
    referencingViews.length > 0;
  if (hasReferences && op.cascade !== true) {
    // I3: route messages/notes/callouts through the shared `formatRefKey`
    // (already used by removeNode/removeGroup) instead of a raw
    // `` `${listKey}[${k}]` `` template — an id-less nested message's key is
    // itself a position path (`messages[2].messages[0]`), and wrapping that
    // again produced a double-wrapped `messages[messages[2].messages[0]]`.
    const refs = [
      ...cascade.messages.map((k) => formatRefKey('messages', k)),
      ...cascade.notes.map((k) => formatRefKey('notes', k)),
      ...cascade.callouts.map((k) => formatRefKey('callouts', k)),
      ...referencingViews.map((view) => `views[${view.id}].focus`),
    ];
    return {
      issues: [
        {
          // I3: report path 'target' (the field the caller actually passed
          // a selector for), not the resolved element `key` — consistent
          // with every other resolve-then-refuse issue in this file.
          path: 'target',
          message: `cannot remove "${key}": referenced by ${refs.join(', ')} (pass cascade: true to remove them)`,
        },
      ],
    };
  }
  const changed: string[] = [];
  removeMessagesByKeys(clone, seqDiagram.items, cascade.messages, changed);
  const notesSeq = clone.get('notes') as YAMLSeq | undefined;
  if (notesSeq !== undefined && cascade.notes.length > 0) {
    const indices = cascade.notes
      .map((k) => model.notes.findIndex((note) => note.key === k))
      .sort((a, b) => b - a);
    for (const idx of indices) removeAt(notesSeq, idx);
    changed.push('notes');
  }
  const calloutsSeq = clone.get('callouts') as YAMLSeq | undefined;
  if (calloutsSeq !== undefined && cascade.callouts.length > 0) {
    const indices = cascade.callouts
      .map((k) => model.callouts.findIndex((callout) => callout.key === k))
      .sort((a, b) => b - a);
    for (const idx of indices) removeAt(calloutsSeq, idx);
    changed.push('callouts');
  }
  changed.push(...stripFocus(clone, model.views, removedKeys));
  const participantIdx = seqDiagram.participants.indexOf(resolved.element);
  const participantsSeq = clone.get('participants') as YAMLSeq;
  removeAt(participantsSeq, participantIdx);
  changed.push('participants');
  return { changed, removed: removedKeys };
}

export function applyInsertMessage(
  clone: Document,
  model: Diagram,
  op: InsertMessageOp,
): OpApplyResult {
  const guard = requireSequence(model, 'insertMessage', 'messages');
  if ('issues' in guard) return guard;
  let seq: YAMLSeq;
  let index: number;
  if (op.before === undefined && op.after === undefined) {
    seq = getOrCreateSeq(clone, 'messages');
    index = seq.items.length;
  } else {
    const isBefore = op.before !== undefined;
    const selector = op.before ?? op.after;
    if (selector === undefined) {
      throw new Error('unreachable: op.before/op.after checked above');
    }
    const resolved = resolveSelector(model, selector);
    if ('code' in resolved) {
      return { issues: [{ path: isBefore ? 'before' : 'after', message: resolved.message }] };
    }
    if (resolved.element.kind !== 'message' && resolved.element.kind !== 'fragment') {
      return {
        issues: [
          {
            path: isBefore ? 'before' : 'after',
            message: `selector "${resolved.key}" does not resolve to a message or fragment`,
          },
        ],
      };
    }
    const anchorPath = resolved.element.path;
    const tokens = parseMessagePathTokens(anchorPath);
    const localIndex = tokens[tokens.length - 1];
    if (typeof localIndex !== 'number') {
      throw new Error(`unreachable: message path "${anchorPath}" must end in a numeric index`);
    }
    const containerPath = tokens.slice(0, -1);
    seq = clone.getIn(containerPath) as YAMLSeq;
    index = isBefore ? localIndex : localIndex + 1;
  }
  const style = styleOfFirstItem(seq);
  const node = createItem(clone, op.item, style);
  insertAt(seq, index, node);
  return { changed: ['messages'] };
}

export function applyUpdateMessage(
  clone: Document,
  model: Diagram,
  op: UpdateMessageOp,
): OpApplyResult {
  const guard = requireSequence(model, 'updateMessage', 'messages');
  if ('issues' in guard) return guard;
  const resolved = resolveSelector(model, op.target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== 'message') {
    return {
      issues: [
        { path: 'target', message: `selector "${resolved.key}" does not resolve to a message` },
      ],
    };
  }
  const itemPath = parseMessagePathTokens(resolved.element.path);
  const changed = applyShallowMergePatch(clone, itemPath, op.patch);
  return { changed };
}

export function applyRemoveMessage(
  clone: Document,
  model: Diagram,
  op: RemoveMessageOp,
): OpApplyResult {
  const guard = requireSequence(model, 'removeMessage', 'messages');
  if ('issues' in guard) return guard;
  const resolved = resolveSelector(model, op.target);
  if ('code' in resolved) return { issues: [{ path: 'target', message: resolved.message }] };
  if (resolved.element.kind !== 'message' && resolved.element.kind !== 'fragment') {
    return {
      issues: [
        {
          path: 'target',
          message: `selector "${resolved.key}" does not resolve to a message or fragment`,
        },
      ],
    };
  }
  // I8: like removeEdge, removeMessage has no `cascade` option — a message
  // referenced by a note/callout or focused by a view is simply refused.
  const key = resolved.key;
  const cascade = collectCascade(model, [key]);
  const referencingViews = model.views.filter((view) => view.focus.includes(key));
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
  const path = resolved.element.path;
  const tokens = parseMessagePathTokens(path);
  const localIndex = tokens[tokens.length - 1];
  if (typeof localIndex !== 'number') {
    throw new Error(`unreachable: message path "${path}" must end in a numeric index`);
  }
  const containerPath = tokens.slice(0, -1);
  const seq = clone.getIn(containerPath) as YAMLSeq;
  removeAt(seq, localIndex);
  return { changed: ['messages'] };
}
