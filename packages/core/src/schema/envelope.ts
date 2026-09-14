import { z } from 'zod';
import type { DiagramType, Direction, LayoutEngine, Theme } from '../model/types.js';

const DIAGRAM_TYPES = [
  'flowchart',
  'architecture',
  'sequence',
] as const satisfies readonly DiagramType[];
export const DiagramTypeSchema = z.enum(DIAGRAM_TYPES);

const DIRECTIONS = ['down', 'right', 'up', 'left'] as const satisfies readonly Direction[];
export const DirectionSchema = z.enum(DIRECTIONS);

const LAYOUT_ENGINES = ['dagre', 'elk', 'tala'] as const satisfies readonly LayoutEngine[];
export const LayoutEngineSchema = z.enum(LAYOUT_ENGINES);

const THEMES = ['light', 'dark'] as const satisfies readonly Theme[];
export const ThemeSchema = z.enum(THEMES);

/**
 * Every element-declared `id` (nodes, groups, edges, participants, messages,
 * notes, callouts, views — Tasks 2-4) uses this shape, not a bare
 * `z.string()`. Plan 03 emits node/group/participant ids as bare, unquoted
 * D2 identifiers (contract §6's "D2 keys" section: `g.<id>`, `seq.<id>`),
 * so an id containing whitespace, a leading digit/hyphen, or a `.` would
 * either be invalid D2 syntax or silently change meaning (an unquoted `.`
 * creates nested scope). This is not in the spec's schema section
 * verbatim — it is required so every downstream plan's "ids become bare D2
 * keys" assumption is actually guaranteed by the schema layer.
 */
export const IdSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_-]*$/, 'id must match /^[A-Za-z_][A-Za-z0-9_-]*$/');

/**
 * Fields shared by every top-level file schema. `diagrammar` is a version
 * literal (only `1` exists today). `direction` is intentionally NOT here —
 * it is graph-family-only and is added directly on `GraphFileSchema`, so a
 * `direction` key on a sequence file trips `.strict()`'s unrecognized-key
 * check (spec §3.6 rule 7 / contract §3's family-mismatch note).
 *
 * No field here carries a Zod `.default()`. Every "optional, default X" in
 * the spec is resolved by `model/build.ts` (Task 9), not by the schema —
 * that keeps `*Input` types honestly optional (see schema/graph.ts) and
 * keeps all family-dependent defaults (e.g. layout/direction differ by
 * flowchart vs. architecture) in one place.
 */
export const BaseEnvelopeFields = {
  diagrammar: z.literal(1),
  title: z.string().optional(),
  layout: LayoutEngineSchema.optional(),
  theme: ThemeSchema.optional(),
};
