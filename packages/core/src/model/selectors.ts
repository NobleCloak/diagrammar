import { indexElements } from './types.js';
import type { Diagram, ElementModel, SequenceItem } from './types.js';

export type Selector = { id: string } | { from: string; to: string } | { path: string };

export interface SelectorError {
  code: 'not_found' | 'ambiguous';
  message: string;
}

export function resolveSelector(
  d: Diagram,
  s: Selector,
): { key: string; element: ElementModel } | SelectorError {
  if ('id' in s) {
    return resolveById(d, s.id);
  }
  if ('from' in s && 'to' in s) {
    return resolveByFromTo(d, s.from, s.to);
  }
  return resolveByPath(d, s.path);
}

function resolveById(
  d: Diagram,
  id: string,
): { key: string; element: ElementModel } | SelectorError {
  const matches: Array<{ key: string; element: ElementModel }> = [];

  // Search all id-bearing elements in the diagram
  if (d.type === 'sequence') {
    for (const participant of d.participants) {
      if (participant.id === id) {
        matches.push({ key: participant.id, element: participant });
      }
    }
    // Recursively search messages in items for explicit ids
    scanSequenceItemsForId(d.items, id, matches);
  } else {
    for (const group of d.groups) {
      if (group.id === id) {
        matches.push({ key: group.id, element: group });
      }
    }
    for (const node of d.nodes) {
      if (node.id === id) {
        matches.push({ key: node.id, element: node });
      }
    }
    for (const edge of d.edges) {
      if (edge.id === id) {
        matches.push({ key: edge.key, element: edge });
      }
    }
  }

  for (const note of d.notes) {
    if (note.id === id) {
      matches.push({ key: note.key, element: note });
    }
  }
  for (const callout of d.callouts) {
    if (callout.id === id) {
      matches.push({ key: callout.key, element: callout });
    }
  }

  const [match, ...rest] = matches;
  if (match === undefined) {
    return { code: 'not_found', message: `no element with id "${id}"` };
  }
  if (rest.length > 0) {
    return { code: 'ambiguous', message: `multiple elements with id "${id}"` };
  }
  return match;
}

function scanSequenceItemsForId(
  items: readonly SequenceItem[],
  id: string,
  matches: Array<{ key: string; element: ElementModel }>,
): void {
  for (const item of items) {
    if (item.kind === 'message' && item.id === id) {
      matches.push({ key: item.key, element: item });
    }
    if (item.kind === 'fragment') {
      scanSequenceItemsForId(item.messages, id, matches);
    }
  }
}

function resolveByFromTo(
  d: Diagram,
  from: string,
  to: string,
): { key: string; element: ElementModel } | SelectorError {
  const matches: Array<{ key: string; element: ElementModel }> = [];

  if (d.type === 'sequence') {
    // For sequence diagrams, scan messages/fragments recursively for matching endpoints
    scanSequenceItemsForEndpoints(d.items, from, to, matches);
  } else {
    // For graph diagrams, scan edges for matching endpoints
    for (const edge of d.edges) {
      if (edge.from === from && edge.to === to) {
        matches.push({ key: edge.key, element: edge });
      }
    }
  }

  const [match, ...rest] = matches;
  if (match === undefined) {
    const diagramType = d.type === 'sequence' ? 'message' : 'edge';
    return { code: 'not_found', message: `no ${diagramType} from "${from}" to "${to}"` };
  }
  if (rest.length > 0) {
    const diagramType = d.type === 'sequence' ? 'message' : 'edge';
    return { code: 'ambiguous', message: `multiple ${diagramType}s from "${from}" to "${to}"` };
  }
  return match;
}

function scanSequenceItemsForEndpoints(
  items: readonly SequenceItem[],
  from: string,
  to: string,
  matches: Array<{ key: string; element: ElementModel }>,
): void {
  for (const item of items) {
    if (item.kind === 'message' && item.from === from && item.to === to) {
      matches.push({ key: item.key, element: item });
    }
    if (item.kind === 'fragment') {
      scanSequenceItemsForEndpoints(item.messages, from, to, matches);
    }
  }
}

/**
 * Contract §4 / §11 item 13: `{ path }` matches ANY element whose key
 * equals the path string — not only id-less messages/fragments
 * (`messages[1].messages[0]`), but also id-less notes (`notes[2]`) and
 * id-less callouts (`callouts[0]`), since `model/types.ts`'s `indexElements`
 * keys both of those by exactly that synthetic position string when they
 * carry no explicit `id`. Plan 05's document ops (`updateCallout`,
 * `removeCallout`, `updateNote`, `removeNote`) target id-less annotations
 * this way.
 */
const PATH_ADDRESSABLE_KINDS = new Set<ElementModel['kind']>([
  'message',
  'fragment',
  'note',
  'callout',
]);

function resolveByPath(
  d: Diagram,
  path: string,
): { key: string; element: ElementModel } | SelectorError {
  const index = indexElements(d);
  const element = index.get(path);
  if (element === undefined || !PATH_ADDRESSABLE_KINDS.has(element.kind)) {
    return {
      code: 'not_found',
      message: `no message, fragment, note, or callout at path "${path}"`,
    };
  }
  return { key: path, element };
}
