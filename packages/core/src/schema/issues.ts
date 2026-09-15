import type { z } from 'zod';
import type { ValidationIssue } from '../errors.js';
import { FragmentSchema, MessageSchema } from './sequence.js';

type ZodIssue = z.core.$ZodIssue;
type ZodUnionIssue = Extract<ZodIssue, { code: 'invalid_union' }>;

/** Dotted/bracket path form exactly as the spec shows: `edges[1].to`. */
export function formatZodPath(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else {
      out += out.length === 0 ? String(segment) : `.${String(segment)}`;
    }
  }
  return out;
}

/**
 * Converts a ZodError into ValidationIssue[] (no `line` — callers that have
 * a YAML `Document` attach that separately via `loadYaml(...).lineOf`).
 * `rawValue` is the plain JS value that was parsed (loadYaml's `.value`) —
 * needed to re-resolve `invalid_union` issues raised by SequenceItemSchema,
 * and to pick a branch for other unions (e.g. SelectorRefSchema).
 */
export function zodErrorToIssues(error: z.ZodError, rawValue: unknown): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const issue of error.issues) {
    out.push(...resolveIssue(issue, rawValue));
  }
  return out;
}

/**
 * A nested fragment's `messages` array is itself validated against
 * `SequenceItemSchema` when we re-parse with `FragmentSchema` below, so a
 * bad message inside a nested fragment raises its own `invalid_union` issue
 * among `branchResult.error.issues` — one level down from the outer issue
 * this function was called to resolve. `resolveIssue` and
 * `resolveSequenceItemUnionIssue` recurse into each other so arbitrarily
 * nested fragments still resolve to the full concrete path.
 */
function resolveIssue(issue: ZodIssue, rawValue: unknown): ValidationIssue[] {
  if (issue.code === 'invalid_union') {
    return resolveUnionIssue(issue, rawValue);
  }
  if (issue.code === 'unrecognized_keys') {
    // Zod reports unrecognized keys as ONE issue with a `keys` array, at the
    // PARENT path (no per-key path/line). Split into one ValidationIssue per
    // key so each gets its own path (and, via loadAndBuild's `withLine`,
    // its own line).
    return issue.keys.map((key) => ({
      path: formatZodPath([...issue.path, key]),
      message: `Unrecognized key "${key}"`,
    }));
  }
  return [{ path: formatZodPath(issue.path), message: issue.message }];
}

/**
 * `errors: []` means Zod couldn't even pick a branch to blame — a
 * discriminated union whose discriminator (`type`) is missing or doesn't
 * match any option. Zod's own message ("Invalid discriminator value.
 * Expected 'flowchart' | 'architecture' | 'sequence'") is already exactly
 * what a typo'd/missing `type` should report, so pass it through as-is
 * rather than trying to resolve a branch that was never attempted.
 */
/** Zod 4's message for an `invalid_union` issue that carries no custom `error`. */
const ZOD_DEFAULT_UNION_MESSAGE = 'Invalid input';

function resolveUnionIssue(issue: ZodUnionIssue, rawValue: unknown): ValidationIssue[] {
  // A union declared with its own `error` (ThemeSchema, IconRefSchema) has
  // already said what a value must look like; blaming one regex branch would
  // replace that sentence with Zod's raw "must match pattern /.../" text.
  if (issue.errors.length === 0 || issue.message !== ZOD_DEFAULT_UNION_MESSAGE) {
    return [{ path: formatZodPath(issue.path), message: issue.message }];
  }

  const subValue = getAtPath(rawValue, issue.path);

  if (isSequenceItemUnionSite(issue.path, subValue)) {
    return resolveSequenceItemUnionIssue(issue.path, subValue, rawValue);
  }

  const branch = pickBranch(issue.errors, subValue);
  const out: ValidationIssue[] = [];
  for (const branchIssue of branch) {
    out.push(
      ...resolveIssue({ ...branchIssue, path: [...issue.path, ...branchIssue.path] }, rawValue),
    );
  }
  return out;
}

/**
 * The only union in the schema shaped like `messages[<n>]` (or nested,
 * `messages[<n>].messages[<m>]`) is `SequenceItemSchema` (Message |
 * Fragment) — every other union (e.g. `SelectorRefSchema`) sits elsewhere.
 * Re-parsing with the concrete branch schema below only makes sense there.
 */
function isSequenceItemUnionSite(
  path: ReadonlyArray<PropertyKey>,
  subValue: unknown,
): subValue is Record<PropertyKey, unknown> {
  const last = path[path.length - 1];
  const parent = path[path.length - 2];
  return isObjectShaped(subValue) && parent === 'messages' && typeof last === 'number';
}

function resolveSequenceItemUnionIssue(
  path: ReadonlyArray<PropertyKey>,
  subValue: Record<PropertyKey, unknown>,
  rawValue: unknown,
): ValidationIssue[] {
  const isFragmentShaped = 'fragment' in subValue;
  const branchResult = isFragmentShaped
    ? FragmentSchema.safeParse(subValue)
    : MessageSchema.safeParse(subValue);
  if (branchResult.success) {
    return [
      { path: formatZodPath(path), message: 'value does not match a sequence message or fragment' },
    ];
  }
  const out: ValidationIssue[] = [];
  for (const branchIssue of branchResult.error.issues) {
    out.push(...resolveIssue({ ...branchIssue, path: [...path, ...branchIssue.path] }, rawValue));
  }
  return out;
}

/**
 * For unions other than the sequence-item one (gated above, and blamed via
 * a concrete-schema re-parse instead), there is no concrete branch schema to
 * re-parse with — pick the most useful of Zod's already-computed per-branch
 * issue lists directly instead. A string value blames whichever branch
 * expected a string (SelectorRefSchema's string form); otherwise fall back
 * to the first branch. (An object carrying a `fragment` key would blame
 * whichever branch mentions `fragment`/`messages`, but every such union in
 * this schema — SequenceItemSchema — is the gated sequence-item case above,
 * so that case never reaches here.)
 */
function pickBranch(errors: readonly ZodIssue[][], subValue: unknown): readonly ZodIssue[] {
  if (typeof subValue === 'string') {
    const stringBranch = errors.find((branch) =>
      branch.some((i) => i.code === 'invalid_type' && i.expected === 'string'),
    );
    if (stringBranch !== undefined) {
      return stringBranch;
    }
  }
  return errors[0] ?? [];
}

function isObjectShaped(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getAtPath(value: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}
