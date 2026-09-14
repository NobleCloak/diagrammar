import { z } from 'zod';
import { StyleSchema } from '../schema/style.js';
import { GraphShapeSchema } from '../schema/graph.js';
import { MessageStyleSchema, ParticipantKindSchema } from '../schema/sequence.js';
import { PRESET_NAMES } from './presets.js';

export const PresetNameSchema = z.enum(PRESET_NAMES);

export const PaletteSchema = z
  .object({
    background: z.string().optional(),
    fill: z.string().optional(),
    stroke: z.string().optional(),
    text: z.string().optional(),
    groupFill: z.string().optional(),
    edge: z.string().optional(),
  })
  .strict();

export const ThemeDefaultsSchema = z
  .object({
    nodes: StyleSchema.optional(),
    groups: StyleSchema.optional(),
    edges: StyleSchema.optional(),
    participants: StyleSchema.optional(),
    shapes: z.partialRecord(GraphShapeSchema, StyleSchema).optional(),
    kinds: z.partialRecord(ParticipantKindSchema, StyleSchema).optional(),
    messages: z.partialRecord(MessageStyleSchema, StyleSchema).optional(),
  })
  .strict();

/** Spec §4.1. `base` is a preset only — a theme file never names another file. */
export const ThemeFileSchema = z
  .object({
    'diagrammar-theme': z.literal(1),
    base: PresetNameSchema,
    palette: PaletteSchema.optional(),
    defaults: ThemeDefaultsSchema.optional(),
  })
  .strict();
export type ThemeFileInput = z.infer<typeof ThemeFileSchema>;

export function generateThemeJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ThemeFileSchema, { target: 'draft-2020-12', io: 'input' });
}
