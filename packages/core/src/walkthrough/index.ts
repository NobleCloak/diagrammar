import type { Diagram, SequenceItem, MessageModel } from '../model/types.js';

export interface WalkthroughOptions {
  imagePath?: string;
}

function elementLine(label: string, id: string, description: string | undefined): string {
  const base = `- **${label}** (\`${id}\`)`;
  return description !== undefined ? `${base}: ${description.trim()}` : base;
}

function connectionLine(
  from: string,
  to: string,
  label: string,
  description: string | undefined,
): string {
  const base = `- **${from} → ${to}** ${label}`;
  return description !== undefined ? `${base}: ${description.trim()}` : base;
}

function flattenMessages(items: SequenceItem[]): MessageModel[] {
  const out: MessageModel[] = [];
  for (const item of items) {
    if (item.kind === 'message') out.push(item);
    else out.push(...flattenMessages(item.messages));
  }
  return out;
}

/**
 * Emits the Markdown walkthrough (spec §6.6) for an already-parsed model:
 * `# title`, an optional image reference, the callout legend in number
 * order, then `## Elements` — every node/participant, and every *labeled*
 * edge/message, in file order. The Elements section is omitted when there
 * are no elements.
 */
export function walkthrough(model: Diagram, opts: WalkthroughOptions = {}): string {
  const title = model.title ?? 'Untitled diagram';
  const lines: string[] = [];

  lines.push(`# ${title}`);

  if (opts.imagePath !== undefined) {
    lines.push('');
    lines.push(`![${title}](${opts.imagePath})`);
  }

  if (model.callouts.length > 0) {
    lines.push('');
    lines.push('## Callouts');
    lines.push('');
    const sorted = [...model.callouts].sort((a, b) => a.number - b.number);
    for (const c of sorted) {
      lines.push(`${c.number}. ${c.text ?? ''}`.trimEnd());
    }
  }

  const elementLines: string[] = [];
  if (model.type === 'sequence') {
    for (const p of model.participants)
      elementLines.push(elementLine(p.label, p.id, p.description));
    for (const msg of flattenMessages(model.items)) {
      if (msg.label === undefined) continue;
      elementLines.push(connectionLine(msg.from, msg.to, msg.label, msg.description));
    }
  } else {
    for (const n of model.nodes) elementLines.push(elementLine(n.label, n.id, n.description));
    for (const e of model.edges) {
      if (e.label === undefined) continue;
      elementLines.push(connectionLine(e.from, e.to, e.label, e.description));
    }
  }

  if (elementLines.length > 0) {
    lines.push('');
    lines.push('## Elements');
    lines.push('');
    lines.push(...elementLines);
  }

  return lines.join('\n') + '\n';
}
