import type {
  SequenceDiagram,
  ViewModel,
  SequenceItem,
  MessageModel,
  MessageStyle,
  FragmentModel,
} from '../model/types.js';
import { d2ShapeForParticipant } from './shapes.js';
import { d2String, quoteKey, styleLines, DIM_OPACITY_LINE } from './style.js';

function messageExtraLines(style: MessageStyle, dim: boolean): string[] {
  let base: string[];
  switch (style) {
    case 'sync':
      base = [];
      break;
    case 'async':
      base = ['style.stroke-dash: 3'];
      break;
    case 'return':
      base = ['style.stroke-dash: 3', 'target-arrowhead: {', '  shape: arrow', '}'];
      break;
  }
  return dim ? [...base, DIM_OPACITY_LINE] : base;
}

function emitMessage(
  msg: MessageModel,
  indent: string,
  lines: string[],
  focus: Set<string> | undefined,
): void {
  const dim = focus !== undefined && !focus.has(msg.key);
  const extra = messageExtraLines(msg.style, dim);
  const arrow = `${quoteKey(msg.from)} -> ${quoteKey(msg.to)}`;
  if (extra.length === 0) {
    lines.push(
      msg.label !== undefined ? `${indent}${arrow}: ${d2String(msg.label)}` : `${indent}${arrow}`,
    );
    return;
  }
  lines.push(
    msg.label !== undefined
      ? `${indent}${arrow}: ${d2String(msg.label)} {`
      : `${indent}${arrow}: {`,
  );
  for (const l of extra) lines.push(`${indent}  ${l}`);
  lines.push(`${indent}}`);
}

function emitFragment(
  fragment: FragmentModel,
  indent: string,
  lines: string[],
  focus: Set<string> | undefined,
): void {
  const label =
    fragment.label !== undefined ? `${fragment.fragment}: ${fragment.label}` : fragment.fragment;
  lines.push(`${indent}${d2String(fragment.path)}: {`);
  lines.push(`${indent}  label: ${d2String(label)}`);
  if (focus !== undefined && !focus.has(fragment.path))
    lines.push(`${indent}  ${DIM_OPACITY_LINE}`);
  emitItems(fragment.messages, `${indent}  `, lines, focus);
  lines.push(`${indent}}`);
}

/**
 * Emits top-level sequence items (messages and fragments). `indent` is the
 * current nesting prefix (spaces).
 */
function emitItems(
  items: SequenceItem[],
  indent: string,
  lines: string[],
  focus: Set<string> | undefined,
): void {
  for (const item of items) {
    if (item.kind === 'message') {
      emitMessage(item, indent, lines, focus);
    } else {
      emitFragment(item, indent, lines, focus);
    }
  }
}

/**
 * Compiles a sequence model to D2 source text: a single `seq` object with
 * `shape: sequence_diagram`, participants and messages nested inside it
 * using bare (unqualified) ids — see the D2 syntax primer, point 9.
 */
export function compileSequence(model: SequenceDiagram, view?: ViewModel): string {
  const focus = view !== undefined ? new Set(view.focus) : undefined;
  const lines: string[] = [];

  lines.push('seq: {');
  lines.push('  shape: sequence_diagram');
  // Without an explicit label D2 falls back to the shape's own id ("seq") as
  // its visible title (verified against a real render — see the X ruling in
  // final-fix-brief.md); an empty label renders no text at all and D2 (0.9.0
  // via @d2lang/d2 0.1.34) accepts it without error.
  lines.push('  label: ""');

  for (const p of model.participants) {
    const dim = focus !== undefined && !focus.has(p.id);
    lines.push(`  ${quoteKey(p.id)}: {`);
    lines.push(`    shape: ${d2ShapeForParticipant(p.participantKind)}`);
    lines.push(`    label: ${d2String(p.label)}`);
    for (const l of styleLines(p.style, dim)) lines.push(`    ${l}`);
    lines.push('  }');
  }

  emitItems(model.items, '  ', lines, focus);

  lines.push('}');
  return lines.join('\n') + '\n';
}
