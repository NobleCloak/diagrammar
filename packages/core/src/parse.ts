import { LineCounter, parseDocument, type Document } from 'yaml';
import type { ValidationIssue } from './errors.js';
import { buildModel } from './model/build.js';
import { runSemanticRules } from './model/semantic.js';
import type { Diagram } from './model/types.js';
import { DiagramFileSchema } from './schema/index.js';
import { zodErrorToIssues } from './schema/issues.js';

export interface YamlLoadResult {
  doc: Document;
  value: unknown;
  lineOf: (path: string) => number | undefined;
}

export function loadYaml(text: string): YamlLoadResult {
  const lineCounter = new LineCounter();
  // `keepSourceTokens: true` isn't needed by this module — it's kept here so
  // that Plan 05's yamlStyle sibling-style mimicry (matching a new node's
  // formatting to its neighbors) can read each node's `srcToken`.
  const doc = parseDocument(text, { lineCounter, keepSourceTokens: true });
  const value: unknown = doc.toJS({ mapAsMap: false });

  function lineOf(path: string): number | undefined {
    const segments = parseDottedPath(path);
    if (segments.length === 0) {
      return undefined;
    }
    const node: unknown = doc.getIn(segments, true);
    const range = rangeOf(node);
    if (range === undefined) {
      return undefined;
    }
    return lineCounter.linePos(range[0]).line;
  }

  return { doc, value, lineOf };
}

/**
 * "edges[1].to" -> ['edges', 1, 'to']. The regex alternates between
 * "a run of characters that are not '.', '[' or ']'" and "[<digits>]";
 * the '.' separators between segments are never matched by either
 * alternative, so the global exec loop skips over them on its own.
 */
function parseDottedPath(path: string): Array<string | number> {
  const segments: Array<string | number> = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push(match[1]);
    } else if (match[2] !== undefined) {
      segments.push(Number(match[2]));
    }
  }
  return segments;
}

interface RangedNode {
  range?: [number, number, number];
}

function rangeOf(node: unknown): [number, number, number] | undefined {
  if (typeof node !== 'object' || node === null || !('range' in node)) {
    return undefined;
  }
  return (node as RangedNode).range;
}

export type ParseResult =
  { ok: true; diagram: Diagram; text: string } | { ok: false; issues: ValidationIssue[] };

export function parse(yaml: string): ParseResult {
  const result = loadAndBuild(yaml);
  return result.ok
    ? { ok: true, diagram: result.diagram, text: yaml }
    : { ok: false, issues: result.issues };
}

/**
 * Shared by parse() and validate() (validate.ts) so both agree on exactly
 * what counts as valid. Not re-exported from index.ts.
 */
export function loadAndBuild(
  yaml: string,
): { ok: true; diagram: Diagram } | { ok: false; issues: ValidationIssue[] } {
  const { doc, value, lineOf } = loadYaml(yaml);

  if (doc.errors.length > 0) {
    return {
      ok: false,
      // A YAML parse error's `message` can run to several lines (the
      // offending snippet plus a caret pointer); only the first line is a
      // human-readable summary, so that's all a ValidationIssue carries.
      issues: doc.errors.map((error) => ({
        path: '',
        message: error.message.split('\n')[0] ?? error.message,
        ...(error.linePos?.[0]?.line !== undefined ? { line: error.linePos[0].line } : {}),
      })),
    };
  }

  const parsed = DiagramFileSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: zodErrorToIssues(parsed.error, value).map((issue) => withLine(issue, lineOf)),
    };
  }

  const diagram = buildModel(parsed.data);
  const semanticIssues = runSemanticRules(diagram).map((issue) => withLine(issue, lineOf));
  if (semanticIssues.length > 0) {
    return { ok: false, issues: semanticIssues };
  }

  return { ok: true, diagram };
}

function withLine(
  issue: ValidationIssue,
  lineOf: (path: string) => number | undefined,
): ValidationIssue {
  const line = lineOf(issue.path);
  return line !== undefined ? { ...issue, line } : issue;
}
