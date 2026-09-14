import { z } from 'zod';
import { GraphFileSchema, type GraphFileInput } from './graph.js';
import { SequenceFileSchema, type SequenceFileInput } from './sequence.js';

export * from './style.js';
export * from './envelope.js';
export * from './annotations.js';
export * from './graph.js';
export * from './sequence.js';

export const DiagramFileSchema = z.discriminatedUnion('type', [
  GraphFileSchema,
  SequenceFileSchema,
]);
export type DiagramFile = GraphFileInput | SequenceFileInput;
