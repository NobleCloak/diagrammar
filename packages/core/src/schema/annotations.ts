import { z } from 'zod';
import type { Side } from '../model/types.js';
import { IdSchema } from './envelope.js';

const SIDES = ['left', 'right', 'top', 'bottom'] as const satisfies readonly Side[];
export const SideSchema = z.enum(SIDES);

/**
 * `at` (spec §3.4): an element id, or for an id-less edge an object
 * {from, to}, or for an id-less message a position-path string (e.g.
 * "messages[1].messages[0]"). Path strings and ids are both plain strings
 * at the schema level — disambiguating them happens in model/build.ts,
 * which already knows every id and every message's computed path.
 */
export const SelectorRefSchema = z.union([
  z.string(),
  z.object({ from: z.string(), to: z.string() }).strict(),
]);
export type SelectorRefInput = z.infer<typeof SelectorRefSchema>;

export const NoteSchema = z
  .object({
    id: IdSchema.optional(),
    at: SelectorRefSchema.optional(),
    side: SideSchema.optional(),
    width: z.number().positive().optional(),
    text: z.string(),
  })
  .strict();
export type NoteInput = z.infer<typeof NoteSchema>;

export const CalloutSchema = z
  .object({
    id: IdSchema.optional(),
    at: SelectorRefSchema,
    number: z.number().int().positive().optional(),
    text: z.string().optional(),
  })
  .strict();
export type CalloutInput = z.infer<typeof CalloutSchema>;

export const ViewSchema = z
  .object({
    id: IdSchema,
    title: z.string().optional(),
    focus: z.array(z.string()).optional(),
  })
  .strict();
export type ViewInput = z.infer<typeof ViewSchema>;
