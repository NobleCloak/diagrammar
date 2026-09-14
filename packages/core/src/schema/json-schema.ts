import { z } from 'zod';
import { DiagramFileSchema } from './index.js';

export function generateJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(DiagramFileSchema, {
    target: 'draft-2020-12',
    io: 'input',
  });
}
