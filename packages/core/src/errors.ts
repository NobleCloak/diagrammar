export interface ValidationIssue {
  path: string;
  line?: number;
  message: string;
}

export class DiagrammarError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'DiagrammarError';
    this.code = code;
  }
}

/**
 * Renders a list of `ValidationIssue`s into one human-readable string:
 * `path: message (line N)`, semicolon-joined, with the `path: ` prefix
 * omitted when `path` is empty (a file-level issue with nowhere more
 * specific to point). Shared by `ValidationError`'s own message and by
 * `theme/load.ts`'s "theme file is invalid: ..." wrapper, so both surfaces
 * format issues identically.
 */
export function formatValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return 'Validation failed';
  }
  return issues
    .map((issue) => {
      const location = issue.line !== undefined ? ` (line ${issue.line})` : '';
      const path = issue.path.length > 0 ? `${issue.path}: ` : '';
      return `${path}${issue.message}${location}`;
    })
    .join('; ');
}

export class ValidationError extends DiagrammarError {
  override readonly code = 'validation' as const;
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(formatValidationIssues(issues), 'validation');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export class ConflictError extends DiagrammarError {
  override readonly code = 'conflict' as const;
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(`Document hash mismatch: expected ${expected}, got ${actual}`, 'conflict');
    this.name = 'ConflictError';
    this.expected = expected;
    this.actual = actual;
  }
}

export interface Warning {
  code: string;
  path?: string;
  message: string;
}

/**
 * Narrows a caught `unknown` to Node's `ErrnoException` shape (an `Error`
 * with a `code` string, e.g. `ENOENT`/`EACCES`). Was independently
 * redefined in `assets/resolver.ts` (as `isErrno`), `packages/mcp/src/fs.ts`,
 * `packages/mcp/src/toolError.ts`, `packages/cli/src/ioError.ts` and
 * `packages/cli/src/commands/new.ts`; this is the one shared copy every
 * filesystem-error-mapping call site now imports.
 */
export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
