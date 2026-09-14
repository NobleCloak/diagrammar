import { createHash } from 'node:crypto';
import { parse, loadYaml } from '../parse.js';
import type {
  Diagram,
  DiagramType,
  Direction,
  ElementModel,
  LayoutEngine,
  SequenceItem,
  Theme,
} from '../model/types.js';
import type { Selector } from '../model/selectors.js';
import type { ValidationIssue } from '../errors.js';
import { withOptional } from './ops.js';

export interface DescribedElement {
  kind: ElementModel['kind'];
  key: string;
  id?: string;
  selector: Selector;
  label?: string;
  from?: string;
  to?: string;
  path?: string;
  in?: string;
  refs: string[];
}

export interface DescribedNote {
  key: string;
  id?: string;
  selector: Selector;
  at?: string;
  text: string;
}

export interface DescribedCallout {
  key: string;
  id?: string;
  selector: Selector;
  at: string;
  number: number;
  text?: string;
}

export interface DescribedView {
  id: string;
  title?: string;
  focus: string[];
}

export interface Description {
  hash: string;
  valid: boolean;
  issues: ValidationIssue[];
  type?: DiagramType;
  title?: string;
  theme?: Theme;
  layout?: LayoutEngine;
  direction?: Direction;
  elements: DescribedElement[];
  notes: DescribedNote[];
  callouts: DescribedCallout[];
  views: DescribedView[];
}

function selectorFor(
  kind: ElementModel['kind'],
  id: string | undefined,
  from: string | undefined,
  to: string | undefined,
  key: string,
): Selector {
  if (id !== undefined) return { id };
  if (kind === 'edge' && from !== undefined && to !== undefined) return { from, to };
  return { path: key };
}

function describeSequenceItems(items: SequenceItem[], out: DescribedElement[]): void {
  for (const item of items) {
    if (item.kind === 'message') {
      out.push(
        withOptional(
          {
            kind: 'message' as const,
            key: item.key,
            selector: selectorFor('message', item.id, item.from, item.to, item.key),
            from: item.from,
            to: item.to,
            path: item.path,
            refs: [item.from, item.to],
          },
          { id: item.id, label: item.label },
        ),
      );
    } else {
      out.push(
        withOptional(
          {
            kind: 'fragment' as const,
            key: item.path,
            selector: { path: item.path },
            path: item.path,
            refs: [],
          },
          { label: item.label },
        ),
      );
      describeSequenceItems(item.messages, out);
    }
  }
}

const DIAGRAM_TYPES = ['flowchart', 'architecture', 'sequence'] as const;
const THEMES = ['light', 'dark'] as const;
const LAYOUT_ENGINES = ['dagre', 'elk', 'tala'] as const;
const DIRECTIONS = ['down', 'right', 'up', 'left'] as const;

/**
 * Returns `value` narrowed to one of `values` when it's a string that
 * actually appears there, `undefined` otherwise.
 *
 * M10: on the *invalid* path, `readPartialMeta` below is reading a
 * best-effort scrap of meta out of a file that failed the real schema
 * parse — `record.type`/`record.theme`/etc. can be any string an author
 * typed, not necessarily one of `DiagramType`/`Theme`/etc.'s actual members
 * (e.g. `type: bogus`). The previous implementation cast straight to the
 * target type (`record.type as DiagramType`) regardless, so `describe()`
 * could return a `Description.type` that lied about being a real
 * `DiagramType`. Of the two fixes the brief allows — widen `Description`'s
 * fields to `string` on this branch, or validate against the real enum and
 * drop anything else — this picks the latter: `Description`'s fields stay
 * exactly what their names promise (a real `DiagramType`/`Theme`/...), and
 * an invalid value is simply omitted rather than surfaced as a
 * type-incorrect one. `title` isn't enum-constrained, so it's unaffected.
 */
function oneOf<const T extends readonly string[]>(
  values: T,
  value: unknown,
): T[number] | undefined {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? value
    : undefined;
}

function readPartialMeta(
  text: string,
): Partial<Pick<Description, 'type' | 'title' | 'theme' | 'layout' | 'direction'>> {
  try {
    const { value } = loadYaml(text);
    if (typeof value !== 'object' || value === null) return {};
    const record = value as Record<string, unknown>;
    return withOptional(
      {},
      {
        type: oneOf(DIAGRAM_TYPES, record.type),
        title: typeof record.title === 'string' ? record.title : undefined,
        theme: oneOf(THEMES, record.theme),
        layout: oneOf(LAYOUT_ENGINES, record.layout),
        direction: oneOf(DIRECTIONS, record.direction),
      },
    );
  } catch {
    return {};
  }
}

export function describe(text: string): Description {
  const hash = createHash('sha256').update(text).digest('hex');
  const result = parse(text);
  if (!result.ok) {
    return {
      hash,
      valid: false,
      issues: result.issues,
      ...readPartialMeta(text),
      elements: [],
      notes: [],
      callouts: [],
      views: [],
    };
  }
  const model: Diagram = result.diagram;
  const elements: DescribedElement[] = [];
  if (model.type !== 'sequence') {
    for (const group of model.groups) {
      elements.push(
        withOptional(
          {
            kind: 'group' as const,
            key: group.id,
            id: group.id,
            selector: { id: group.id },
            label: group.label,
            refs: group.parent !== undefined ? [group.parent] : [],
          },
          { in: group.parent },
        ),
      );
    }
    for (const node of model.nodes) {
      elements.push(
        withOptional(
          {
            kind: 'node' as const,
            key: node.id,
            id: node.id,
            selector: { id: node.id },
            label: node.label,
            refs: node.group !== undefined ? [node.group] : [],
          },
          { in: node.group },
        ),
      );
    }
    for (const edge of model.edges) {
      elements.push(
        withOptional(
          {
            kind: 'edge' as const,
            key: edge.key,
            selector: selectorFor('edge', edge.id, edge.from, edge.to, edge.key),
            from: edge.from,
            to: edge.to,
            refs: [edge.from, edge.to],
          },
          { id: edge.id, label: edge.label },
        ),
      );
    }
  } else {
    for (const participant of model.participants) {
      // M11: every other element push here routes its `label` through
      // `withOptional`, because the model's `label` field is genuinely
      // optional for those kinds. `ParticipantModel.label` isn't —
      // `build.ts`'s `buildParticipant` defaults it to the participant's
      // own id when the file omits it — so it's always a plain `string`,
      // never `undefined`, and a direct assignment here is exactly as sound
      // as `withOptional` would be, just without the indirection.
      elements.push({
        kind: 'participant',
        key: participant.id,
        id: participant.id,
        selector: { id: participant.id },
        label: participant.label,
        refs: [],
      });
    }
    describeSequenceItems(model.items, elements);
  }
  const notes: DescribedNote[] = model.notes.map((note) =>
    withOptional(
      {
        key: note.key,
        selector: note.id !== undefined ? { id: note.id } : { path: note.key },
        text: note.text,
      },
      { id: note.id, at: note.at },
    ),
  );
  const callouts: DescribedCallout[] = model.callouts.map((callout) =>
    withOptional(
      {
        key: callout.key,
        selector: callout.id !== undefined ? { id: callout.id } : { path: callout.key },
        at: callout.at,
        number: callout.number,
      },
      { id: callout.id, text: callout.text },
    ),
  );
  const views: DescribedView[] = model.views.map((view) =>
    withOptional({ id: view.id, focus: view.focus }, { title: view.title }),
  );
  return withOptional(
    {
      hash,
      valid: true,
      issues: [],
      type: model.type,
      theme: model.theme,
      layout: model.layout,
      elements,
      notes,
      callouts,
      views,
    },
    { title: model.title, direction: model.type !== 'sequence' ? model.direction : undefined },
  );
}
