import type { GraphDiagram, ViewModel } from '../model/types.js';
import type { ResolvedTheme } from '../theme/types.js';
import { mergeStyle } from '../theme/merge.js';
import { d2ShapeFor } from './shapes.js';
import { d2String, quoteKey, styleLines, themeOverrideLines } from './style.js';

/** Absolute D2 key for a group, honoring `parent` chains. */
export function absGroupKey(model: GraphDiagram, groupId: string): string {
  const group = model.groups.find((g) => g.id === groupId);
  if (!group) throw new Error(`compileGraph: unknown group "${groupId}"`);
  return group.parent !== undefined ? `${absGroupKey(model, group.parent)}.${group.id}` : group.id;
}

/** Absolute D2 key for a node: its own id, prefixed by its group's absolute key if any. */
export function absNodeKey(model: GraphDiagram, nodeId: string): string {
  const node = model.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`compileGraph: unknown node "${nodeId}"`);
  return node.group !== undefined ? `${absGroupKey(model, node.group)}.${node.id}` : node.id;
}

/**
 * Compiles a flowchart/architecture model to D2 source text. Groups become
 * flat dotted-key container declarations; nodes are declared under their
 * group's absolute key. When `view` is given, every group/node/edge whose
 * key is not in `view.focus` gets an extra `style.opacity: 0.25` line.
 */
export function compileGraph(model: GraphDiagram, view?: ViewModel, theme?: ResolvedTheme): string {
  const focus = view !== undefined ? new Set(view.focus) : undefined;
  const lines: string[] = [];

  lines.push(`direction: ${model.direction}`);
  lines.push('');
  lines.push('vars: {');
  lines.push('  d2-config: {');
  lines.push(`    layout-engine: ${model.layout}`);
  const overrides = themeOverrideLines(theme?.overrides ?? {});
  if (overrides.length > 0) {
    lines.push('    theme-overrides: {');
    for (const l of overrides) lines.push(`      ${l}`);
    lines.push('    }');
  }
  lines.push('  }');
  lines.push('}');
  lines.push('');

  for (const group of model.groups) {
    const key = absGroupKey(model, group.id);
    const dim = focus !== undefined && !focus.has(group.id);
    lines.push(`${quoteKey(key)}: {`);
    lines.push(`  label: ${d2String(group.label)}`);
    for (const l of styleLines(mergeStyle(theme, { family: 'group' }, group.style), dim))
      lines.push(`  ${l}`);
    lines.push('}');
  }
  if (model.groups.length > 0) lines.push('');

  for (const node of model.nodes) {
    const key = absNodeKey(model, node.id);
    const dim = focus !== undefined && !focus.has(node.id);
    lines.push(`${quoteKey(key)}: {`);
    lines.push(`  shape: ${d2ShapeFor(node.shape)}`);
    lines.push(`  label: ${d2String(node.label)}`);
    for (const l of styleLines(
      mergeStyle(theme, { family: 'node', shape: node.shape }, node.style),
      dim,
    ))
      lines.push(`  ${l}`);
    lines.push('}');
  }
  if (model.nodes.length > 0) lines.push('');

  for (const edge of model.edges) {
    const from = quoteKey(absNodeKey(model, edge.from));
    const to = quoteKey(absNodeKey(model, edge.to));
    const dim = focus !== undefined && !focus.has(edge.key);
    const extra = styleLines(mergeStyle(theme, { family: 'edge' }, edge.style), dim);
    if (extra.length === 0) {
      lines.push(
        edge.label !== undefined ? `${from} -> ${to}: ${d2String(edge.label)}` : `${from} -> ${to}`,
      );
      continue;
    }
    lines.push(
      edge.label !== undefined
        ? `${from} -> ${to}: ${d2String(edge.label)} {`
        : `${from} -> ${to}: {`,
    );
    for (const l of extra) lines.push(`  ${l}`);
    lines.push('}');
  }

  return lines.join('\n') + '\n';
}
