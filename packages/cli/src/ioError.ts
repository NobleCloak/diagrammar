import { isErrnoException } from '@noblecloak/diagrammar-core';

/**
 * Maps a filesystem error to a short, readable message for a CLI command to
 * print — never the raw Node error (no "ENOENT: no such file or directory,
 * open '...'" stack-shaped text reaching the terminal) and never a
 * temp-file name from an interrupted `writeAtomic` (every mapped branch
 * below builds its message from the caller's own `path` argument, not
 * `err.message`).
 *
 * Shared by every CLI command that reads or writes a diagram file by path:
 * `describe`, `edit`, `validate`, `render` (M10). `new` keeps its own
 * mapping since its messages are write-specific (e.g. EEXIST means "already
 * exists", not the generic wording here).
 */
export function describeIoError(err: unknown, path: string): string {
  if (isErrnoException(err)) {
    switch (err.code) {
      case 'ENOENT':
        return `file not found: ${path}`;
      case 'EACCES':
      case 'EPERM':
        return `permission denied: ${path}`;
      case 'EISDIR':
        return `is a directory, not a file: ${path}`;
      case 'ENOTDIR':
        return `not a directory: ${path}`;
      case 'EEXIST':
        return `already exists: ${path}`;
      case 'EROFS':
        return `read-only file system: ${path}`;
      case 'ELOOP':
        return `too many symbolic links: ${path}`;
      case 'ENAMETOOLONG':
        return `path name too long: ${path}`;
      case 'EMFILE':
        return 'too many open files';
      default:
        break;
    }
  }
  return err instanceof Error ? err.message : String(err);
}
