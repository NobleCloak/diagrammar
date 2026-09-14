import { z } from 'zod';

export const StyleSchema = z
  .object({
    fill: z.string().optional(),
    stroke: z.string().optional(),
    strokeWidth: z.number().optional(),
    dashed: z.boolean().optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    fontColor: z.string().optional(),
    opacity: z.number().optional(),
  })
  .strict();

export type StyleInput = z.infer<typeof StyleSchema>;
