import { z } from 'zod';
import type { FragmentKind, MessageStyle, ParticipantKind } from '../model/types.js';
import { CalloutSchema, NoteSchema, ViewSchema } from './annotations.js';
import { BaseEnvelopeFields, IdSchema } from './envelope.js';
import { IconRefSchema } from './graph.js';
import { StyleSchema } from './style.js';

const PARTICIPANT_KINDS = [
  'actor',
  'service',
  'database',
  'queue',
] as const satisfies readonly ParticipantKind[];
export const ParticipantKindSchema = z.enum(PARTICIPANT_KINDS);

const MESSAGE_STYLES = ['sync', 'async', 'return'] as const satisfies readonly MessageStyle[];
export const MessageStyleSchema = z.enum(MESSAGE_STYLES);

const FRAGMENT_KINDS = ['alt', 'loop', 'opt', 'par'] as const satisfies readonly FragmentKind[];
export const FragmentKindSchema = z.enum(FRAGMENT_KINDS);

export const ParticipantSchema = z
  .object({
    id: IdSchema,
    label: z.string().optional(),
    icon: IconRefSchema.optional(),
    kind: ParticipantKindSchema.optional(),
    description: z.string().optional(),
    style: StyleSchema.optional(),
  })
  .strict();
export type ParticipantInput = z.infer<typeof ParticipantSchema>;

export const MessageSchema = z
  .object({
    id: IdSchema.optional(),
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    style: MessageStyleSchema.optional(),
  })
  .strict();
export type MessageInput = z.infer<typeof MessageSchema>;

export interface FragmentInput {
  fragment: FragmentKind;
  label?: string | undefined;
  messages: SequenceItemInput[];
}
export type SequenceItemInput = MessageInput | FragmentInput;

export const FragmentSchema: z.ZodType<FragmentInput> = z
  .object({
    fragment: FragmentKindSchema,
    label: z.string().optional(),
    messages: z.array(z.lazy((): z.ZodType<SequenceItemInput> => SequenceItemSchema)),
  })
  .strict();

export const SequenceItemSchema: z.ZodType<SequenceItemInput> = z.union([
  MessageSchema,
  FragmentSchema,
]);

export const SequenceFileSchema = z
  .object({
    ...BaseEnvelopeFields,
    type: z.literal('sequence'),
    participants: z.array(ParticipantSchema).optional(),
    messages: z.array(SequenceItemSchema).optional(),
    notes: z.array(NoteSchema).optional(),
    callouts: z.array(CalloutSchema).optional(),
    views: z.array(ViewSchema).optional(),
  })
  .strict();
export type SequenceFileInput = z.infer<typeof SequenceFileSchema>;
