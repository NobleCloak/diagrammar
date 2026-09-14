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

function formatValidationMessage(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return 'Validation failed';
  }
  return issues
    .map((issue) => {
      const location = issue.line !== undefined ? ` (line ${issue.line})` : '';
      return `${issue.path}: ${issue.message}${location}`;
    })
    .join('; ');
}

export class ValidationError extends DiagrammarError {
  override readonly code = 'validation' as const;
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(formatValidationMessage(issues), 'validation');
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
