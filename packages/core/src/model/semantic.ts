import type { ValidationIssue } from '../errors.js';
import { ARCHITECTURE_SHAPES, FLOWCHART_SHAPES, indexElements } from './types.js';
import type {
  Diagram,
  ElementIndex,
  GraphDiagram,
  SequenceDiagram,
  SequenceItem,
} from './types.js';
import { normalizeRelativePath } from '../assets/paths.js';
import { isPresetName } from '../theme/presets.js';

/**
 * Spec §3.6 rules beyond the schema. Rule 7 ("family mismatch: nodes/edges
 * in a sequence file, or participants/messages in a graph file, is an
 * error") is not implemented here — it is already enforced structurally by
 * GraphFileSchema/SequenceFileSchema each being `.strict()` with disjoint
 * key sets (schema/graph.ts, schema/sequence.ts), so a mismatched key fails
 * Zod validation before a Diagram is ever built.
 */
export function runSemanticRules(diagram: Diagram): ValidationIssue[] {
  const issues: ValidationIssue[] = [
    ...checkDuplicateIds(diagram),
    ...checkReferences(diagram),
    ...checkDuplicateCalloutNumbers(diagram),
    ...checkThemePath(diagram),
  ];
  if (diagram.type === 'sequence') {
    issues.push(...checkFragmentsNonEmpty(diagram));
  } else {
    issues.push(
      ...checkGroupCycles(diagram),
      ...checkAmbiguousEdges(diagram),
      ...checkShapeVocabulary(diagram),
      ...checkGroupParentFamily(diagram),
    );
  }
  return issues;
}

// --- Rule 1: all ids unique -------------------------------------------------

interface IdEntry {
  id: string;
  path: string;
}

function collectIdEntries(diagram: Diagram): IdEntry[] {
  const entries: IdEntry[] = [];
  if (diagram.type === 'sequence') {
    diagram.participants.forEach((p, i) =>
      entries.push({ id: p.id, path: `participants[${i}].id` }),
    );
    collectSequenceIdEntries(diagram.items, entries);
  } else {
    diagram.groups.forEach((g, i) => entries.push({ id: g.id, path: `groups[${i}].id` }));
    diagram.nodes.forEach((n, i) => entries.push({ id: n.id, path: `nodes[${i}].id` }));
    diagram.edges.forEach((e, i) => {
      if (e.id !== undefined) {
        entries.push({ id: e.id, path: `edges[${i}].id` });
      }
    });
  }
  diagram.notes.forEach((n, i) => {
    if (n.id !== undefined) {
      entries.push({ id: n.id, path: `notes[${i}].id` });
    }
  });
  diagram.callouts.forEach((c, i) => {
    if (c.id !== undefined) {
      entries.push({ id: c.id, path: `callouts[${i}].id` });
    }
  });
  diagram.views.forEach((v, i) => entries.push({ id: v.id, path: `views[${i}].id` }));
  return entries;
}

function collectSequenceIdEntries(items: readonly SequenceItem[], out: IdEntry[]): void {
  for (const item of items) {
    if (item.kind === 'message' && item.id !== undefined) {
      out.push({ id: item.id, path: `${item.path}.id` });
    }
    if (item.kind === 'fragment') {
      collectSequenceIdEntries(item.messages, out);
    }
  }
}

function checkDuplicateIds(diagram: Diagram): ValidationIssue[] {
  const seen = new Map<string, string>();
  const issues: ValidationIssue[] = [];
  for (const entry of collectIdEntries(diagram)) {
    const firstPath = seen.get(entry.id);
    if (firstPath === undefined) {
      seen.set(entry.id, entry.path);
    } else {
      issues.push({
        path: entry.path,
        message: `duplicate id "${entry.id}" (first declared at ${firstPath})`,
      });
    }
  }
  return issues;
}

// --- Rule 2: every from/to/in/at/focus resolves -----------------------------

function checkReferences(diagram: Diagram): ValidationIssue[] {
  const index = indexElements(diagram);
  const issues: ValidationIssue[] = [];

  if (diagram.type === 'sequence') {
    checkSequenceReferences(diagram.items, index, issues);
  } else {
    diagram.edges.forEach((e, i) => {
      if (index.get(e.from)?.kind !== 'node') {
        issues.push({ path: `edges[${i}].from`, message: `unknown node "${e.from}"` });
      }
      if (index.get(e.to)?.kind !== 'node') {
        issues.push({ path: `edges[${i}].to`, message: `unknown node "${e.to}"` });
      }
    });
    diagram.nodes.forEach((n, i) => {
      if (n.group !== undefined && index.get(n.group)?.kind !== 'group') {
        issues.push({ path: `nodes[${i}].in`, message: `unknown group "${n.group}"` });
      }
    });
    diagram.groups.forEach((g, i) => {
      if (g.parent !== undefined && index.get(g.parent)?.kind !== 'group') {
        issues.push({ path: `groups[${i}].in`, message: `unknown group "${g.parent}"` });
      }
    });
  }

  diagram.notes.forEach((n, i) => {
    if (n.at !== undefined && index.get(n.at) === undefined) {
      issues.push({ path: `notes[${i}].at`, message: `unknown target "${n.at}"` });
    }
  });
  diagram.callouts.forEach((c, i) => {
    if (index.get(c.at) === undefined) {
      issues.push({ path: `callouts[${i}].at`, message: `unknown target "${c.at}"` });
    }
  });
  diagram.views.forEach((v, i) => {
    v.focus.forEach((key, j) => {
      if (index.get(key) === undefined) {
        issues.push({ path: `views[${i}].focus[${j}]`, message: `unknown target "${key}"` });
      }
    });
  });

  return issues;
}

function checkSequenceReferences(
  items: readonly SequenceItem[],
  index: ElementIndex,
  issues: ValidationIssue[],
): void {
  for (const item of items) {
    if (item.kind === 'message') {
      if (index.get(item.from)?.kind !== 'participant') {
        issues.push({ path: `${item.path}.from`, message: `unknown participant "${item.from}"` });
      }
      if (index.get(item.to)?.kind !== 'participant') {
        issues.push({ path: `${item.path}.to`, message: `unknown participant "${item.to}"` });
      }
    } else {
      checkSequenceReferences(item.messages, index, issues);
    }
  }
}

// --- Rule 9: resolved callout numbers are unique ----------------------------

/**
 * Operates on `CalloutModel.number`, which `build.ts` has already resolved
 * (`c.number ?? index + 1`) — so an explicit number colliding with another
 * callout's derived number is caught the same way as two explicit numbers
 * colliding; there is no separate "explicit vs. derived" branch needed here.
 */
function checkDuplicateCalloutNumbers(diagram: Diagram): ValidationIssue[] {
  const seen = new Map<number, number>();
  const issues: ValidationIssue[] = [];
  diagram.callouts.forEach((c, i) => {
    const firstIndex = seen.get(c.number);
    if (firstIndex === undefined) {
      seen.set(c.number, i);
    } else {
      issues.push({
        path: `callouts[${i}].number`,
        message: `duplicate callout number ${c.number} (also used by callouts[${firstIndex}])`,
      });
    }
  });
  return issues;
}

// --- Rule 3: group parenting has no cycles (architecture only) -------------

function checkGroupCycles(diagram: GraphDiagram): ValidationIssue[] {
  const parentOf = new Map(diagram.groups.map((g) => [g.id, g.parent] as const));
  const issues: ValidationIssue[] = [];
  diagram.groups.forEach((g, i) => {
    const chain = [g.id];
    let current = g.parent;
    while (current !== undefined) {
      if (chain.includes(current)) {
        issues.push({
          path: `groups[${i}].in`,
          message: `cycle detected in group parenting: ${[...chain, current].join(' -> ')}`,
        });
        return;
      }
      chain.push(current);
      current = parentOf.get(current);
    }
  });
  return issues;
}

// --- Rule 4: id-less edges must have unique {from, to} ----------------------

function checkAmbiguousEdges(diagram: GraphDiagram): ValidationIssue[] {
  const byKey = new Map<string, number[]>();
  diagram.edges.forEach((e, i) => {
    if (e.id === undefined) {
      const indices = byKey.get(e.key) ?? [];
      indices.push(i);
      byKey.set(e.key, indices);
    }
  });
  const issues: ValidationIssue[] = [];
  for (const [key, indices] of byKey) {
    if (indices.length > 1) {
      for (const i of indices) {
        issues.push({
          path: `edges[${i}]`,
          message: `ambiguous edge "${key}": add an explicit id to disambiguate parallel edges`,
        });
      }
    }
  }
  return issues;
}

// --- Rule 5: fragments must be non-empty (sequence only) --------------------

function checkFragmentsNonEmpty(diagram: SequenceDiagram): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  walkFragments(diagram.items, issues);
  return issues;
}

function walkFragments(items: readonly SequenceItem[], issues: ValidationIssue[]): void {
  for (const item of items) {
    if (item.kind === 'fragment') {
      if (item.messages.length === 0) {
        issues.push({
          path: item.path,
          message: `fragment "${item.path}" must contain at least one message`,
        });
      }
      walkFragments(item.messages, issues);
    }
  }
}

// --- Rule 6: shape is in the family's vocabulary (graph only) ---------------

function checkShapeVocabulary(diagram: GraphDiagram): ValidationIssue[] {
  const allowed = diagram.type === 'architecture' ? ARCHITECTURE_SHAPES : FLOWCHART_SHAPES;
  const issues: ValidationIssue[] = [];
  diagram.nodes.forEach((n, i) => {
    if (!allowed.includes(n.shape)) {
      issues.push({
        path: `nodes[${i}].shape`,
        message: `shape "${n.shape}" is not valid for ${diagram.type} diagrams`,
      });
    }
  });
  return issues;
}

// --- Rule 8: groups[].in only valid in architecture -------------------------

function checkGroupParentFamily(diagram: GraphDiagram): ValidationIssue[] {
  if (diagram.type !== 'flowchart') {
    return [];
  }
  const issues: ValidationIssue[] = [];
  diagram.groups.forEach((g, i) => {
    if (g.parent !== undefined) {
      issues.push({
        path: `groups[${i}].in`,
        message: '"in" is only valid for architecture groups; flowchart groups are flat',
      });
    }
  });
  return issues;
}

// --- Rule 10: a path-form theme is a well-formed relative path -------------

/**
 * Syntax only (spec §6.1): the schema already guarantees a path form looks
 * like a path; this rejects absolute paths, drive letters, backslashes and
 * null bytes. Whether the file exists is `checkThemeRef`'s job, because it
 * needs an asset resolver and parsing stays synchronous.
 */
function checkThemePath(diagram: Diagram): ValidationIssue[] {
  if (isPresetName(diagram.theme)) return [];
  try {
    normalizeRelativePath(diagram.theme);
    return [];
  } catch (error) {
    return [{ path: 'theme', message: error instanceof Error ? error.message : String(error) }];
  }
}
