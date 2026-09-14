import type { GraphShape, ParticipantKind } from '../model/types.js';

const GRAPH_SHAPE_TO_D2: Record<GraphShape, string> = {
  oval: 'oval',
  rect: 'rectangle',
  diamond: 'diamond',
  document: 'document',
  parallelogram: 'parallelogram',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  queue: 'queue',
  cloud: 'cloud',
  person: 'person',
  package: 'package',
};

/** Maps a flowchart/architecture GraphShape to its D2 `shape:` value. */
export function d2ShapeFor(shape: GraphShape): string {
  return GRAPH_SHAPE_TO_D2[shape];
}

const PARTICIPANT_KIND_TO_D2: Record<ParticipantKind, string> = {
  actor: 'person',
  service: 'rectangle',
  database: 'cylinder',
  queue: 'queue',
};

/** Maps a sequence-diagram ParticipantKind to its D2 `shape:` value. */
export function d2ShapeForParticipant(kind: ParticipantKind): string {
  return PARTICIPANT_KIND_TO_D2[kind];
}
