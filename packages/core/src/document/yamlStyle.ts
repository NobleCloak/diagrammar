import type { Document, Node } from 'yaml';
import { YAMLMap, YAMLSeq } from 'yaml';

export type SiblingStyle = 'flow' | 'block';

/**
 * Reports whether the first item of a YAML sequence is written in flow
 * style (`{ a: 1 }` / `[a, b]`) or block style, so a newly added list item
 * can mimic its siblings instead of always defaulting to one style.
 * An empty sequence defaults to `'block'`.
 */
export function styleOfFirstItem(seq: YAMLSeq): SiblingStyle {
  const first = seq.items[0];
  if (first !== undefined && (first instanceof YAMLMap || first instanceof YAMLSeq)) {
    return first.flow === true ? 'flow' : 'block';
  }
  return 'block';
}

/**
 * Creates a new YAML node for `value` (a plain JS object/array/scalar),
 * rendered in the given style. Key order in a produced mapping matches the
 * key order of `value` exactly.
 */
export function createItem(doc: Document, value: unknown, style: SiblingStyle): Node {
  return doc.createNode(value, { flow: style === 'flow' });
}

/** Inserts `node` into `seq.items` at `index`, shifting later items down. */
export function insertAt(seq: YAMLSeq, index: number, node: Node): void {
  seq.items.splice(index, 0, node as never);
}

/** Removes and returns the item at `index` from `seq.items`. */
export function removeAt(seq: YAMLSeq, index: number): unknown {
  return seq.items.splice(index, 1)[0];
}

/** Replaces the item at `index` in `seq.items` with `node`, in place (unlike `insertAt`, nothing shifts). */
export function replaceAt(seq: YAMLSeq, index: number, node: Node): void {
  seq.items.splice(index, 1, node as never);
}

/** Finds the index of the first item in `seq` that is a mapping whose `id` field equals `id`. Returns -1 if none matches. */
export function findIndexById(seq: YAMLSeq, id: string): number {
  return seq.items.findIndex((item) => item instanceof YAMLMap && item.get('id') === id);
}

/**
 * Carries flow/block style from `oldNode` onto the structurally-matching
 * parts of `newNode`, recursively. `doc.createNode(value, { flow })` only
 * sets `flow` on the node it's called on — every nested collection it
 * builds renders block regardless of the parent's style — so a full-mapping
 * replacement (e.g. `applySetView`) that mimics the *old* node's top-level
 * style still loses the flow style of any nested list/map the old node had.
 * This walks both trees together and re-applies the old style at every
 * level: for a `YAMLMap` pair, only when `newNode` still has a
 * correspondingly-keyed pair in `oldNode`; for a `YAMLSeq`, pairwise by
 * index for as long as both have an item at that index. Mismatched shapes
 * (a field that changed from a list to a map, say) and scalars are left
 * untouched — recursion simply doesn't apply to them.
 */
export function carryNestedFlow(oldNode: unknown, newNode: unknown): void {
  if (oldNode instanceof YAMLMap && newNode instanceof YAMLMap) {
    if (oldNode.flow !== undefined) newNode.flow = oldNode.flow;
    else delete newNode.flow;
    for (const pair of newNode.items) {
      if (!oldNode.has(pair.key)) continue;
      carryNestedFlow(oldNode.get(pair.key), pair.value);
    }
  } else if (oldNode instanceof YAMLSeq && newNode instanceof YAMLSeq) {
    if (oldNode.flow !== undefined) newNode.flow = oldNode.flow;
    else delete newNode.flow;
    const length = Math.min(oldNode.items.length, newNode.items.length);
    for (let i = 0; i < length; i++) {
      carryNestedFlow(oldNode.items[i], newNode.items[i]);
    }
  }
}

/**
 * Returns the live `YAMLSeq` at the document's top-level `key`, creating an
 * empty one (and setting it on the document) if the key is absent.
 *
 * The empty sequence is built via `doc.createNode([])`, not by assigning a
 * raw `[]` to the key. `Document#set`/`#setIn` store a plain array exactly
 * as given rather than wrapping it — `doc.toString()` still renders it fine,
 * but `doc.get(key)` afterward returns that same raw array back, which has
 * no `.items` to splice into. `doc.createNode([])` builds a real `YAMLSeq`
 * up front so every caller of this function can immediately splice into the
 * result (see the primer above).
 */
export function getOrCreateSeq(doc: Document, key: string): YAMLSeq {
  const existing = doc.get(key);
  if (existing instanceof YAMLSeq) return existing;
  const seq = doc.createNode([]) as YAMLSeq;
  doc.set(key, seq);
  return seq;
}
