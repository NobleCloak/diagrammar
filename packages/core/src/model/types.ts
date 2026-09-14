export type DiagramType = 'flowchart' | 'architecture' | 'sequence';
export type Direction = 'down' | 'right' | 'up' | 'left';
export type LayoutEngine = 'dagre' | 'elk' | 'tala';
/**
 * A theme *reference* exactly as written in the file: a preset name
 * (`light`, `dark`, `colorblind`, `mono`) or a relative path to a theme
 * file (spec §3.1). Resolution to a `ResolvedTheme` happens in `render()`.
 */
export type Theme = string;

export interface Style {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  bold?: boolean;
  italic?: boolean;
  fontColor?: string;
  opacity?: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export type GraphShape =
  | 'oval'
  | 'rect'
  | 'diamond'
  | 'document'
  | 'parallelogram'
  | 'hexagon' // flowchart
  | 'cylinder'
  | 'queue'
  | 'cloud'
  | 'person'
  | 'package'; // architecture (+ rect, hexagon)

export const FLOWCHART_SHAPES: readonly GraphShape[] = [
  'oval',
  'rect',
  'diamond',
  'document',
  'parallelogram',
  'hexagon',
];
export const ARCHITECTURE_SHAPES: readonly GraphShape[] = [
  'rect',
  'cylinder',
  'queue',
  'cloud',
  'person',
  'hexagon',
  'package',
];

export type ParticipantKind = 'actor' | 'service' | 'database' | 'queue';
export type MessageStyle = 'sync' | 'async' | 'return';
export type FragmentKind = 'alt' | 'loop' | 'opt' | 'par';

export interface NodeModel {
  kind: 'node';
  id: string;
  label: string;
  shape: GraphShape;
  group?: string;
  description?: string;
  style?: Style;
}

export interface GroupModel {
  kind: 'group';
  id: string;
  label: string;
  parent?: string;
  style?: Style;
}

export interface EdgeModel {
  kind: 'edge';
  key: string;
  id?: string;
  from: string;
  to: string;
  label?: string;
  style?: Style;
  description?: string;
}

export interface ParticipantModel {
  kind: 'participant';
  id: string;
  label: string;
  participantKind: ParticipantKind;
  description?: string;
  style?: Style;
}

export interface MessageModel {
  kind: 'message';
  key: string;
  path: string;
  id?: string;
  from: string;
  to: string;
  label?: string;
  style: MessageStyle;
  description?: string;
}

export interface FragmentModel {
  kind: 'fragment';
  path: string;
  fragment: FragmentKind;
  label?: string;
  messages: SequenceItem[];
}

export type SequenceItem = MessageModel | FragmentModel;

export interface NoteModel {
  kind: 'note';
  key: string;
  id?: string;
  at?: string;
  side: Side;
  width: number;
  text: string;
}

export interface CalloutModel {
  kind: 'callout';
  key: string;
  id?: string;
  at: string;
  number: number;
  text?: string;
}

export interface ViewModel {
  id: string;
  title?: string;
  focus: string[];
}

export interface DiagramBase {
  version: 1;
  type: DiagramType;
  title?: string;
  theme: Theme;
  layout: LayoutEngine;
  notes: NoteModel[];
  callouts: CalloutModel[];
  views: ViewModel[];
}

export interface GraphDiagram extends DiagramBase {
  type: 'flowchart' | 'architecture';
  direction: Direction;
  groups: GroupModel[];
  nodes: NodeModel[];
  edges: EdgeModel[];
}

export interface SequenceDiagram extends DiagramBase {
  type: 'sequence';
  participants: ParticipantModel[];
  items: SequenceItem[];
}

export type Diagram = GraphDiagram | SequenceDiagram;

export type ElementModel =
  | NodeModel
  | GroupModel
  | EdgeModel
  | ParticipantModel
  | MessageModel
  | FragmentModel
  | NoteModel
  | CalloutModel;

export interface ElementIndex {
  get(key: string): ElementModel | undefined;
  keys(): string[];
}

class ElementIndexImpl implements ElementIndex {
  constructor(private readonly map: Map<string, ElementModel>) {}

  get(key: string): ElementModel | undefined {
    return this.map.get(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

function indexSequenceItems(items: readonly SequenceItem[], map: Map<string, ElementModel>): void {
  for (const item of items) {
    const key = item.kind === 'message' ? item.key : item.path;
    map.set(key, item);
    if (item.kind === 'fragment') {
      indexSequenceItems(item.messages, map);
    }
  }
}

/**
 * Every addressable element in a diagram, keyed the same way build.ts
 * computed keys (contract §3): nodes/groups/participants/notes/callouts by
 * `id` (or their synthetic `notes[i]`/`callouts[i]` key when id-less);
 * edges by `id` or `"<from>-><to>"`; messages/fragments by `id` or their
 * position `path`. The resulting map is last-wins on key collision (e.g. a
 * duplicate id, or an explicit edge id that happens to equal another edge's
 * `"<from>-><to>"` key) — that ambiguity is caught separately by semantic
 * rule 1 (checkDuplicateIds), not by this index. `resolveSelector`'s
 * `{ id }` and `{ from, to }` forms scan the diagram's raw arrays instead of
 * this map for exactly that reason: they need to detect and report every
 * collision, not silently resolve to whichever element happened to be set
 * last.
 */
export function indexElements(d: Diagram): ElementIndex {
  const map = new Map<string, ElementModel>();
  if (d.type === 'sequence') {
    for (const participant of d.participants) {
      map.set(participant.id, participant);
    }
    indexSequenceItems(d.items, map);
  } else {
    for (const group of d.groups) {
      map.set(group.id, group);
    }
    for (const node of d.nodes) {
      map.set(node.id, node);
    }
    for (const edge of d.edges) {
      map.set(edge.key, edge);
    }
  }
  for (const note of d.notes) {
    map.set(note.key, note);
  }
  for (const callout of d.callouts) {
    map.set(callout.key, callout);
  }
  return new ElementIndexImpl(map);
}
