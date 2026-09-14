import type { ValidationIssue } from './errors.js';
import { loadAndBuild } from './parse.js';

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validate(yaml: string): ValidationResult {
  const result = loadAndBuild(yaml);
  return result.ok ? { ok: true, issues: [] } : { ok: false, issues: result.issues };
}
