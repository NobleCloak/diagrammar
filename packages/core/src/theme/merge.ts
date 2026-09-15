import type { GraphShape, MessageStyle, ParticipantKind, Style } from '../model/types.js';
import type { ResolvedTheme } from './types.js';

export type StyleTarget =
  | { family: 'node'; shape: GraphShape }
  | { family: 'group' }
  | { family: 'edge' }
  | { family: 'participant'; kind: ParticipantKind }
  | { family: 'message'; messageStyle: MessageStyle };

/**
 * Spec §4.3, strongest first: the element's own style, its per-kind
 * default, its family default (which already carries the palette, see
 * buildTheme). Merged per key. With no theme the caller's `own` is
 * returned untouched, so existing compile output is byte-identical.
 */
export function mergeStyle(
  theme: ResolvedTheme | undefined,
  target: StyleTarget,
  own: Style | undefined,
): Style | undefined {
  if (theme === undefined) return own;
  const d = theme.defaults;
  let family: Style;
  let kind: Style | undefined;
  switch (target.family) {
    case 'node':
      family = d.nodes;
      kind = d.shapes[target.shape];
      break;
    case 'group':
      family = d.groups;
      break;
    case 'edge':
      family = d.edges;
      break;
    case 'participant':
      family = d.participants;
      kind = d.kinds[target.kind];
      break;
    case 'message':
      family = d.messages;
      kind = d.messageStyles[target.messageStyle];
      break;
    default: {
      const exhaustive: never = target;
      throw new Error(`mergeStyle: unhandled style target family: ${JSON.stringify(exhaustive)}`);
    }
  }
  const merged: Style = { ...family, ...kind, ...own };
  return Object.keys(merged).length === 0 ? undefined : merged;
}
