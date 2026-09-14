import type {
  CalloutInput,
  EdgeInput,
  FragmentInput,
  GraphFileInput,
  GroupInput,
  MessageInput,
  NodeInput,
  NoteInput,
  ParticipantInput,
  SelectorRefInput,
  SequenceFileInput,
  SequenceItemInput,
  StyleInput,
  ViewInput,
} from '../schema/index.js';
import type { DiagramFile } from '../schema/index.js';
import type {
  CalloutModel,
  Diagram,
  EdgeModel,
  FragmentModel,
  GraphDiagram,
  GroupModel,
  MessageModel,
  NodeModel,
  NoteModel,
  ParticipantModel,
  SequenceDiagram,
  SequenceItem,
  Style,
  ViewModel,
} from './types.js';

/**
 * `StyleInput` (from `z.object({ ... .optional() }).strict()`) types every
 * field as `T | undefined`, since zod's `.optional()` does not distinguish
 * "key omitted" from "key present with value `undefined`" at the type
 * level. The model's `Style` requires the stricter "omitted, never
 * `undefined`" shape (`exactOptionalPropertyTypes`), so each field is
 * re-copied through the same omit-if-undefined pattern used everywhere
 * else in this file.
 */
export function buildStyle(s: StyleInput): Style {
  return {
    ...(s.fill !== undefined ? { fill: s.fill } : {}),
    ...(s.stroke !== undefined ? { stroke: s.stroke } : {}),
    ...(s.strokeWidth !== undefined ? { strokeWidth: s.strokeWidth } : {}),
    ...(s.dashed !== undefined ? { dashed: s.dashed } : {}),
    ...(s.bold !== undefined ? { bold: s.bold } : {}),
    ...(s.italic !== undefined ? { italic: s.italic } : {}),
    ...(s.fontColor !== undefined ? { fontColor: s.fontColor } : {}),
    ...(s.opacity !== undefined ? { opacity: s.opacity } : {}),
  };
}

export function buildModel(file: DiagramFile): Diagram {
  return file.type === 'sequence' ? buildSequenceDiagram(file) : buildGraphDiagram(file);
}

function buildGraphDiagram(file: GraphFileInput): GraphDiagram {
  return {
    version: 1,
    type: file.type,
    ...(file.title !== undefined ? { title: file.title } : {}),
    theme: file.theme ?? 'light',
    layout: file.layout ?? (file.type === 'architecture' ? 'tala' : 'dagre'),
    direction: file.direction ?? (file.type === 'architecture' ? 'right' : 'down'),
    groups: (file.groups ?? []).map(buildGroup),
    nodes: (file.nodes ?? []).map(buildNode),
    edges: (file.edges ?? []).map(buildEdge),
    notes: (file.notes ?? []).map((n, i) => buildNote(n, i)),
    callouts: (file.callouts ?? []).map((c, i) => buildCallout(c, i)),
    views: (file.views ?? []).map(buildView),
  };
}

function buildGroup(g: GroupInput): GroupModel {
  return {
    kind: 'group',
    id: g.id,
    label: g.label ?? g.id,
    ...(g.in !== undefined ? { parent: g.in } : {}),
    ...(g.style !== undefined ? { style: buildStyle(g.style) } : {}),
  };
}

function buildNode(n: NodeInput): NodeModel {
  return {
    kind: 'node',
    id: n.id,
    label: n.label ?? n.id,
    shape: n.shape ?? 'rect',
    ...(n.in !== undefined ? { group: n.in } : {}),
    ...(n.description !== undefined ? { description: n.description } : {}),
    ...(n.style !== undefined ? { style: buildStyle(n.style) } : {}),
  };
}

function buildEdge(e: EdgeInput): EdgeModel {
  return {
    kind: 'edge',
    key: e.id ?? `${e.from}->${e.to}`,
    ...(e.id !== undefined ? { id: e.id } : {}),
    from: e.from,
    to: e.to,
    ...(e.label !== undefined ? { label: e.label } : {}),
    ...(e.style !== undefined ? { style: buildStyle(e.style) } : {}),
    ...(e.description !== undefined ? { description: e.description } : {}),
  };
}

function buildSequenceDiagram(file: SequenceFileInput): SequenceDiagram {
  return {
    version: 1,
    type: 'sequence',
    ...(file.title !== undefined ? { title: file.title } : {}),
    theme: file.theme ?? 'light',
    layout: file.layout ?? 'dagre',
    participants: (file.participants ?? []).map(buildParticipant),
    items: buildSequenceItems(file.messages ?? [], undefined),
    notes: (file.notes ?? []).map((n, i) => buildNote(n, i)),
    callouts: (file.callouts ?? []).map((c, i) => buildCallout(c, i)),
    views: (file.views ?? []).map(buildView),
  };
}

function buildParticipant(p: ParticipantInput): ParticipantModel {
  return {
    kind: 'participant',
    id: p.id,
    label: p.label ?? p.id,
    participantKind: p.kind ?? 'service',
    ...(p.description !== undefined ? { description: p.description } : {}),
    ...(p.style !== undefined ? { style: buildStyle(p.style) } : {}),
  };
}

function isFragmentInput(item: SequenceItemInput): item is FragmentInput {
  return 'fragment' in item;
}

/**
 * `path` always mirrors the file's own `messages` key, at every nesting
 * level — spec §3.3: "messages[1].messages[0]" — regardless of the fact
 * that the built model renames the top-level array to `items`. `path` is
 * what `lineOf`, `describe()`, and selectors key off of, so it must match
 * what a human or agent sees in the YAML source.
 */
function buildSequenceItems(
  items: readonly SequenceItemInput[],
  parentPath: string | undefined,
): SequenceItem[] {
  return items.map((item, i) => {
    const path = parentPath !== undefined ? `${parentPath}.messages[${i}]` : `messages[${i}]`;
    return isFragmentInput(item) ? buildFragment(item, path) : buildMessage(item, path);
  });
}

function buildMessage(m: MessageInput, path: string): MessageModel {
  return {
    kind: 'message',
    key: m.id ?? path,
    path,
    ...(m.id !== undefined ? { id: m.id } : {}),
    from: m.from,
    to: m.to,
    ...(m.label !== undefined ? { label: m.label } : {}),
    style: m.style ?? 'sync',
    ...(m.description !== undefined ? { description: m.description } : {}),
  };
}

function buildFragment(f: FragmentInput, path: string): FragmentModel {
  return {
    kind: 'fragment',
    path,
    fragment: f.fragment,
    ...(f.label !== undefined ? { label: f.label } : {}),
    messages: buildSequenceItems(f.messages, path),
  };
}

function selectorRefToKey(at: SelectorRefInput): string {
  return typeof at === 'string' ? at : `${at.from}->${at.to}`;
}

function buildNote(n: NoteInput, index: number): NoteModel {
  return {
    kind: 'note',
    key: n.id ?? `notes[${index}]`,
    ...(n.id !== undefined ? { id: n.id } : {}),
    ...(n.at !== undefined ? { at: selectorRefToKey(n.at) } : {}),
    side: n.side ?? 'right',
    width: n.width ?? 240,
    text: n.text,
  };
}

function buildCallout(c: CalloutInput, index: number): CalloutModel {
  return {
    kind: 'callout',
    key: c.id ?? `callouts[${index}]`,
    ...(c.id !== undefined ? { id: c.id } : {}),
    at: selectorRefToKey(c.at),
    number: c.number ?? index + 1,
    ...(c.text !== undefined ? { text: c.text } : {}),
  };
}

function buildView(v: ViewInput): ViewModel {
  return {
    id: v.id,
    ...(v.title !== undefined ? { title: v.title } : {}),
    focus: v.focus ?? [],
  };
}
