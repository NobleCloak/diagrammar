import { indexElements, type Diagram } from '../model/types.js';
import type { LaidOutDiagram } from '../engine/types.js';
import type { Badge, PlacedNote, KeyMap, LayoutSidecar } from './types.js';
import { BADGE_RADIUS } from './geometry.js';
import { stampAttribute } from './svg.js';
import { indexShapeBoxes, indexConnections } from './callouts.js';

export function buildSidecar(
  model: Diagram,
  laidOut: LaidOutDiagram,
  keyMap: KeyMap,
  badges: Badge[],
  notes: PlacedNote[],
): LayoutSidecar {
  const index = indexElements(model);
  const sidecar: LayoutSidecar = {};

  // Go through indexShapeBoxes/indexConnections (Task 5) rather than reading
  // laidOut.shapes/laidOut.connections directly: both already add
  // laidOut.origin, so the sidecar lands in the same outer-<svg>-space the
  // annotation group and the badges/notes below are already drawn in (spec
  // section 5.7: "same coordinate space as the SVG viewBox"). Both helpers
  // already drop any shape/connection whose key doesn't resolve (D2's
  // synthetic lifelines among connections), so that skip is silent here too.
  const shapeBoxByKey = indexShapeBoxes(laidOut, keyMap);
  for (const [key, bbox] of shapeBoxByKey) {
    const element = index.get(key);
    if (element === undefined) continue;
    sidecar[key] = { kind: element.kind, bbox };
  }

  const connectionByKey = indexConnections(laidOut, keyMap);
  for (const [key, connection] of connectionByKey) {
    const element = index.get(key);
    if (element === undefined) continue;
    sidecar[key] = { kind: element.kind, route: connection.route };
  }

  for (const note of notes) {
    sidecar[note.key] = { kind: 'note', bbox: note.box };
  }

  for (const badge of badges) {
    sidecar[badge.key] = {
      kind: 'callout',
      bbox: {
        x: badge.center.x - BADGE_RADIUS,
        y: badge.center.y - BADGE_RADIUS,
        width: 2 * BADGE_RADIUS,
        height: 2 * BADGE_RADIUS,
      },
    };
  }

  return sidecar;
}

export function stampAll(
  svg: string,
  laidOut: LaidOutDiagram,
  model: Diagram,
  keyMap: KeyMap,
): string {
  const index = indexElements(model);
  let result = svg;

  for (const shape of laidOut.shapes) {
    const key = keyMap.shapeKey(shape.id);
    if (key === undefined) continue;
    const element = index.get(key);
    if (element === undefined) continue;
    result = stampAttribute(result, shape.id, { 'data-dg-id': key, 'data-dg-kind': element.kind });
  }

  for (const connection of laidOut.connections) {
    // D2's synthetic lifelines (contract §11 item 19) never resolve to a
    // model key — skipped silently, no warning, no stamp.
    const key = keyMap.connectionKey(connection);
    if (key === undefined) continue;
    const element = index.get(key);
    if (element === undefined) continue;
    result = stampAttribute(result, connection.id, {
      'data-dg-id': key,
      'data-dg-kind': element.kind,
    });
  }

  return result;
}
