import { z } from 'zod';
import type { DiagramType, GraphShape } from '../model/types.js';
import { NoteSchema, CalloutSchema, ViewSchema } from './annotations.js';
import { BaseEnvelopeFields, DirectionSchema, IdSchema } from './envelope.js';
import { StyleSchema } from './style.js';

/**
 * The union of every flowchart and architecture shape. The schema does not
 * restrict shapes per family — that is semantic rule 6 (spec §3.6),
 * enforced in model/semantic.ts against FLOWCHART_SHAPES/ARCHITECTURE_SHAPES
 * so both families can share one GroupSchema/NodeSchema/EdgeSchema set, per
 * spec §3.2 ("One graph schema, two sets of defaults").
 */
const ALL_GRAPH_SHAPES = [
  'oval',
  'rect',
  'diamond',
  'document',
  'parallelogram',
  'hexagon',
  'cylinder',
  'queue',
  'cloud',
  'person',
  'package',
] as const satisfies readonly GraphShape[];
export const GraphShapeSchema = z.enum(ALL_GRAPH_SHAPES);

export const GroupSchema = z
  .object({
    id: IdSchema,
    label: z.string().optional(),
    in: z.string().optional(),
    style: StyleSchema.optional(),
  })
  .strict();
export type GroupInput = z.infer<typeof GroupSchema>;

export const NodeSchema = z
  .object({
    id: IdSchema,
    label: z.string().optional(),
    shape: GraphShapeSchema.optional(),
    in: z.string().optional(),
    description: z.string().optional(),
    style: StyleSchema.optional(),
  })
  .strict();
export type NodeInput = z.infer<typeof NodeSchema>;

export const EdgeSchema = z
  .object({
    id: IdSchema.optional(),
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    style: StyleSchema.optional(),
  })
  .strict();
export type EdgeInput = z.infer<typeof EdgeSchema>;

const GRAPH_TYPES = ['flowchart', 'architecture'] as const satisfies readonly DiagramType[];
const GraphTypeSchema = z.enum(GRAPH_TYPES);

export const GraphFileSchema = z
  .object({
    ...BaseEnvelopeFields,
    type: GraphTypeSchema,
    direction: DirectionSchema.optional(),
    groups: z.array(GroupSchema).optional(),
    nodes: z.array(NodeSchema).optional(),
    edges: z.array(EdgeSchema).optional(),
    notes: z.array(NoteSchema).optional(),
    callouts: z.array(CalloutSchema).optional(),
    views: z.array(ViewSchema).optional(),
  })
  .strict();
export type GraphFileInput = z.infer<typeof GraphFileSchema>;
