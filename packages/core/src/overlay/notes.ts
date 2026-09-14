import type { Diagram } from '../model/types.js';
import type { LaidOutDiagram } from '../engine/types.js';
import type { Warning } from '../errors.js';
import type { Box, PlacedNote, KeyMap, Point } from './types.js';
import type { TextMetrics } from './text.js';
import { lineHeight } from './text.js';
import {
  union,
  placeBeside,
  pushUntilClear,
  nearestPointOnBox,
  polylineMidpoint,
  NOTE_PADDING,
  NOTE_GAP,
  COLLISION_STEP,
  COLLISION_MAX_STEPS,
  FLOATING_COLUMN_GAP,
  NOTE_FONT_SIZE,
} from './geometry.js';
import { focusKeysFor, indexShapeBoxes, indexConnections } from './callouts.js';

function pointBox(p: Point): Box {
  return { x: p.x, y: p.y, width: 0, height: 0 };
}

/**
 * Every shape's box except the one keyed `excludeKey` (M9: filter by model
 * key, not by object identity against the target's own box — identity
 * happened to work while `indexShapeBoxes` produced one fresh object per
 * shape per call, but keying is the actual invariant and stays correct
 * regardless of how the boxes were constructed). `excludeKey` is
 * `undefined` for an edge/message target (no shape to exclude), in which
 * case every shape box is an obstacle.
 */
function obstaclesExcluding(
  shapeBoxByKey: Map<string, Box>,
  excludeKey: string | undefined,
): Box[] {
  const boxes: Box[] = [];
  for (const [key, box] of shapeBoxByKey) {
    if (key !== excludeKey) boxes.push(box);
  }
  return boxes;
}

export function placeNotes(
  model: Diagram,
  laidOut: LaidOutDiagram,
  keyMap: KeyMap,
  view: string | undefined,
  measure: TextMetrics,
): { notes: PlacedNote[]; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const focusSet = focusKeysFor(model, view);
  const shapeBoxByKey = indexShapeBoxes(laidOut, keyMap);
  const connectionByKey = indexConnections(laidOut, keyMap);
  const allShapeBoxes = [...shapeBoxByKey.values()];
  const diagramUnion = union(allShapeBoxes);

  let floatingCursorY = diagramUnion.y;
  const notes: PlacedNote[] = [];

  model.notes.forEach((note, i) => {
    const n = i + 1;
    const id = `dg-note-${n}`;
    const innerWidth = note.width - 2 * NOTE_PADDING;
    const lines = measure.wrap(note.text, innerWidth, NOTE_FONT_SIZE);
    const boxHeight = lines.length * lineHeight(NOTE_FONT_SIZE) + 2 * NOTE_PADDING;
    const size = { width: note.width, height: boxHeight };

    if (note.at === undefined) {
      const box: Box = {
        x: diagramUnion.x + diagramUnion.width + FLOATING_COLUMN_GAP,
        y: floatingCursorY,
        ...size,
      };
      floatingCursorY += size.height + NOTE_GAP;
      notes.push({ id, key: note.key, box, lines, hidden: false });
      return;
    }

    const targetKey = note.at;
    const shapeBox = shapeBoxByKey.get(targetKey);
    const connection = connectionByKey.get(targetKey);
    if (shapeBox === undefined && connection === undefined) {
      warnings.push({
        code: 'note_target_not_found',
        path: note.key,
        message: `note target "${targetKey}" not found in layout`,
      });
      notes.push({ id, key: note.key, box: { x: 0, y: 0, ...size }, lines, hidden: true });
      return;
    }

    const hidden = focusSet !== undefined && !focusSet.has(targetKey);
    const targetBox = shapeBox ?? pointBox(polylineMidpoint(connection!.route));
    const placement = placeBeside(targetBox, size, note.side, NOTE_GAP);
    const obstacles = obstaclesExcluding(
      shapeBoxByKey,
      shapeBox !== undefined ? targetKey : undefined,
    );
    const pushed = pushUntilClear(
      placement.box,
      obstacles,
      note.side,
      COLLISION_STEP,
      COLLISION_MAX_STEPS,
    );
    const box = pushed.box;
    if (!pushed.cleared) {
      warnings.push({
        code: 'note_overlap',
        path: note.key,
        message: `note "${note.key}" could not be placed clear of other shapes`,
      });
    }
    const boxCenter: Point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const leaderTo = nearestPointOnBox(targetBox, boxCenter);
    const leaderFrom = nearestPointOnBox(box, leaderTo);
    notes.push({ id, key: note.key, box, lines, hidden, leaderFrom, leaderTo });
  });

  return { notes, warnings };
}
