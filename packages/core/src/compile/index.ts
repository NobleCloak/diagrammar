import type { Diagram, SequenceItem, ViewModel } from '../model/types.js';
import type { LaidOutConnection, LaidOutDiagram } from '../engine/types.js';
import type { KeyMap } from '../overlay/types.js';
import type { ResolvedTheme } from '../theme/types.js';
import { DiagrammarError } from '../errors.js';
import { compileGraph, absGroupKey, absNodeKey } from './graph.js';
import { compileSequence } from './sequence.js';
import { d2String } from './style.js';

export interface CompileResult {
  d2: string;
  /** Absolute D2 key -> model key, for every node/group (graph) or participant (sequence). */
  keyMap: Map<string, string>;
}

function findView(model: Diagram, view: string | undefined): ViewModel | undefined {
  if (view === undefined) return undefined;
  const found = model.views.find((v) => v.id === view);
  if (!found) throw new DiagrammarError(`unknown view "${view}"`, 'unknown_view');
  return found;
}

/**
 * Recurses `items` for fragments, mapping each fragment's model key (its
 * `path`) to its D2 shape id. A fragment's own D2 key segment is always
 * `d2String(fragment.path)` — one quoted literal, never split on `.` — so a
 * nested fragment's absolute id is its ancestors' quoted paths dot-joined
 * with its own, e.g. `seq."messages[1]"."messages[1].messages[1]"` (contract
 * §6). The root `seq` container itself is never mapped here.
 */
function collectFragmentKeys(
  items: SequenceItem[],
  prefix: string,
  map: Map<string, string>,
): void {
  for (const item of items) {
    if (item.kind !== 'fragment') continue;
    const d2Key = `${prefix}.${d2String(item.path)}`;
    map.set(d2Key, item.path);
    collectFragmentKeys(item.messages, d2Key, map);
  }
}

function buildKeyMap(model: Diagram): Map<string, string> {
  const map = new Map<string, string>();
  if (model.type === 'sequence') {
    for (const p of model.participants) map.set(`seq.${p.id}`, p.id);
    collectFragmentKeys(model.items, 'seq', map);
    return map;
  }
  for (const g of model.groups) map.set(absGroupKey(model, g.id), g.id);
  for (const n of model.nodes) map.set(absNodeKey(model, n.id), n.id);
  return map;
}

/**
 * Compiles a model (optionally scoped to one named view) to D2 source text
 * plus a key map from absolute D2 keys to model keys. Throws
 * `DiagrammarError` with code `unknown_view` if `view` does not name an
 * existing view on the model.
 *
 * Resets `modelKeyForConnection`'s internal per-`model` connection-pairing
 * counter, so a fresh compile of the same `model` object starts counting
 * `(src, dst)` pairs from zero again instead of continuing a prior compile's
 * count. Prefer `createKeyMap(model, laidOut)` over calling
 * `modelKeyForConnection` directly: it is a pure function of its two
 * arguments with no shared module-level state to reset or leak.
 */
export function compile(model: Diagram, view?: string, theme?: ResolvedTheme): CompileResult {
  pairNextIndex.delete(model);
  const viewModel = findView(model, view);
  const d2 =
    model.type === 'sequence'
      ? compileSequence(model, viewModel, theme)
      : compileGraph(model, viewModel, theme);
  return { d2, keyMap: buildKeyMap(model) };
}

/** Absolute D2 key for a node, group, or sequence participant model key. */
export function d2KeyFor(model: Diagram, key: string): string {
  const map = buildKeyMap(model);
  for (const [d2Key, modelKey] of map) {
    if (modelKey === key) return d2Key;
  }
  throw new DiagrammarError(`d2KeyFor: unknown model key "${key}"`, 'unknown_element');
}

/** Reverse of `d2KeyFor`: model key for an absolute D2 key, or undefined if not found. */
export function modelKeyFor(model: Diagram, d2Key: string): string | undefined {
  return buildKeyMap(model).get(d2Key);
}

interface ConnectionEntry {
  from: string;
  to: string;
  modelKey: string;
}

function flattenSequenceMessages(items: SequenceItem[]): ConnectionEntry[] {
  const out: ConnectionEntry[] = [];
  for (const item of items) {
    if (item.kind === 'message') {
      out.push({ from: `seq.${item.from}`, to: `seq.${item.to}`, modelKey: item.key });
    } else {
      out.push(...flattenSequenceMessages(item.messages));
    }
  }
  return out;
}

function connectionEntries(model: Diagram): ConnectionEntry[] {
  if (model.type === 'sequence') return flattenSequenceMessages(model.items);
  return model.edges.map((e) => ({
    from: absNodeKey(model, e.from),
    to: absNodeKey(model, e.to),
    modelKey: e.key,
  }));
}

// Per-connection-object cache: the resolved model key (or `undefined` if
// none matched), keyed by object identity. Makes `modelKeyForConnection`
// idempotent no matter how many times a caller re-visits the same
// `LaidOutConnection` object (see the docstring below).
const connectionKeyCache = new WeakMap<LaidOutConnection, string | undefined>();
// Per-model, per-ordered-pair "next index to hand out" counter. Only
// advances the first time a *new* connection object for that pair is seen.
const pairNextIndex = new WeakMap<Diagram, Map<string, number>>();

/**
 * Resolves a laid-out D2 connection back to its model key, pairing by
 * `src`/`dst` plus emission order — and never by inspecting `conn.id`'s
 * string format. Contract §6/§11 item 11: "pairs by `src`/`dst` + emission
 * order and does not parse the id string." Plan 01's spike later confirmed
 * `LaidOutConnection.id`'s exact format (`(<src> -> <dst>)[<n>]`), but this
 * function deliberately does not rely on that confirmation, so it stays
 * correct even if a future D2 version changes the id's shape.
 *
 * Because D2 preserves declaration order (spec §4.1), the Nth *distinct*
 * `LaidOutConnection` object first seen for a given ordered `(src, dst)`
 * pair resolves to the Nth model edge/message declared for that same pair,
 * in file order.
 *
 * **Idempotent per `(model, conn)` object pair.** Plan 04's overlay calls
 * `KeyMap.connectionKey` (which wraps this function) once per connection
 * from more than one traversal of the same `laidOut.connections` array
 * within a single `applyOverlay` call (`indexConnections`, `stampAll`,
 * etc.) — a naive "count every call" implementation would advance the
 * counter multiple times for the same connection and desync the pairing.
 * Instead, the resolved key is memoized per connection *object*
 * (`connectionKeyCache`) the first time it is seen; the per-pair counter
 * (`pairNextIndex`, scoped per `model` via a `WeakMap` so it never leaks or
 * needs resetting — a fresh `model`/`laidOut` exists per `render()` call)
 * only advances on that first sighting. Repeat calls with the same `conn`
 * object — including across repeated `applyOverlay` calls over the same
 * `laidOut` — return the cached answer without advancing anything.
 *
 * **Caller obligation:** when two or more *distinct* connection objects
 * share a `(src, dst)` pair, whichever traversal first calls this function
 * for each of them must do so in `laidOut.connections` array order (D2's
 * emission order). Every Plan 04 traversal does
 * `for (const connection of laidOut.connections)`, so this holds.
 *
 * This is the one function in `compile/index.ts` that is not a pure
 * function of its arguments alone (it carries an internal cache) —
 * documented here rather than hidden, per contract §11 item 11's mandate
 * that this function not depend on `conn.id`'s format.
 */
export function modelKeyForConnection(model: Diagram, conn: LaidOutConnection): string | undefined {
  if (connectionKeyCache.has(conn)) return connectionKeyCache.get(conn);

  const byPair = new Map<string, ConnectionEntry[]>();
  for (const entry of connectionEntries(model)) {
    const pairKey = `${entry.from}|${entry.to}`;
    const list = byPair.get(pairKey);
    if (list) list.push(entry);
    else byPair.set(pairKey, [entry]);
  }

  const pairKey = `${conn.src}|${conn.dst}`;
  const candidates = byPair.get(pairKey);

  let counts = pairNextIndex.get(model);
  if (counts === undefined) {
    counts = new Map<string, number>();
    pairNextIndex.set(model, counts);
  }
  const idx = counts.get(pairKey) ?? 0;
  counts.set(pairKey, idx + 1);

  const resolved = candidates?.[idx]?.modelKey;
  connectionKeyCache.set(conn, resolved);
  return resolved;
}

/**
 * Builds a stateless `KeyMap` (contract §7) for one `(model, laidOut)` pair:
 * walks `laidOut.connections` exactly once, in array order, pairing each
 * connection to its model key positionally per `(src, dst)` pair — the same
 * algorithm `modelKeyForConnection` uses, but resolved into a `Map` local to
 * this call rather than shared module-level state. `shapeKey` is backed by
 * one `buildKeyMap(model)` call. This is the preferred API: calling it
 * repeatedly, for the same or different `(model, laidOut)` pairs, never
 * desyncs, since nothing is shared across calls.
 */
export function createKeyMap(model: Diagram, laidOut: LaidOutDiagram): KeyMap {
  const shapeMap = buildKeyMap(model);

  const byPair = new Map<string, ConnectionEntry[]>();
  for (const entry of connectionEntries(model)) {
    const pairKey = `${entry.from}|${entry.to}`;
    const list = byPair.get(pairKey);
    if (list) list.push(entry);
    else byPair.set(pairKey, [entry]);
  }

  const nextIndex = new Map<string, number>();
  const connectionMap = new Map<LaidOutConnection, string | undefined>();
  for (const conn of laidOut.connections) {
    const pairKey = `${conn.src}|${conn.dst}`;
    const idx = nextIndex.get(pairKey) ?? 0;
    nextIndex.set(pairKey, idx + 1);
    connectionMap.set(conn, byPair.get(pairKey)?.[idx]?.modelKey);
  }

  return {
    shapeKey: (id: string) => shapeMap.get(id),
    connectionKey: (conn: LaidOutConnection) => connectionMap.get(conn),
  };
}
