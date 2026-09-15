import { DiagrammarError } from '../errors.js';

/**
 * A `theme:` value is a file reference (spec §3.1) when it contains a `/`
 * or ends in `.yaml`/`.yml`; otherwise it names a preset.
 */
export function isPathRef(value: string): boolean {
  return value.includes('/') || /\.ya?ml$/i.test(value);
}

/**
 * Validates and normalizes a relative asset path (spec §6.1): rejects
 * absolute paths, Windows drive letters, backslashes, null bytes and empty
 * results; collapses `.` and resolvable `..` segments; keeps a leading `..`
 * (a shared theme normally lives above the diagrams that use it — the
 * resolver, not this function, enforces the jail root). Pure: never touches
 * the filesystem.
 */
export function normalizeRelativePath(relPath: string): string {
  if (relPath.length === 0 || relPath.includes('\0')) {
    throw new DiagrammarError(`invalid asset path "${relPath}"`, 'asset_outside_base');
  }
  if (relPath.startsWith('/') || /^[A-Za-z]:/.test(relPath) || relPath.includes('\\')) {
    throw new DiagrammarError(
      `asset path must be relative and use "/" separators, got "${relPath}"`,
      'asset_outside_base',
    );
  }
  const out: string[] = [];
  for (const segment of relPath.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      const last = out[out.length - 1];
      if (last !== undefined && last !== '..') {
        out.pop();
      } else {
        out.push('..');
      }
      continue;
    }
    out.push(segment);
  }
  const last = out[out.length - 1];
  if (last === undefined || last === '..') {
    throw new DiagrammarError(`asset path "${relPath}" does not name a file`, 'asset_outside_base');
  }
  return out.join('/');
}
