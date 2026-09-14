import { describe, it, expect } from 'vitest';
import { describeIoError } from './ioError.js';

function makeErrnoError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe('describeIoError', () => {
  it('maps ENOENT to "file not found"', () => {
    expect(describeIoError(makeErrnoError('ENOENT', 'raw'), 'x.yaml')).toBe(
      'file not found: x.yaml',
    );
  });

  it('maps EACCES and EPERM to "permission denied"', () => {
    expect(describeIoError(makeErrnoError('EACCES', 'raw'), 'x.yaml')).toBe(
      'permission denied: x.yaml',
    );
    expect(describeIoError(makeErrnoError('EPERM', 'raw'), 'x.yaml')).toBe(
      'permission denied: x.yaml',
    );
  });

  it('maps EISDIR to "is a directory, not a file"', () => {
    expect(describeIoError(makeErrnoError('EISDIR', 'raw'), 'sub')).toBe(
      'is a directory, not a file: sub',
    );
  });

  it('maps ENOTDIR to "not a directory"', () => {
    expect(describeIoError(makeErrnoError('ENOTDIR', 'raw'), 'ok.yaml/nested.yaml')).toBe(
      'not a directory: ok.yaml/nested.yaml',
    );
  });

  it('maps EEXIST to "already exists"', () => {
    expect(describeIoError(makeErrnoError('EEXIST', 'raw'), 'x.yaml')).toBe(
      'already exists: x.yaml',
    );
  });

  it('maps EROFS, ELOOP, and ENAMETOOLONG', () => {
    expect(describeIoError(makeErrnoError('EROFS', 'raw'), 'x.yaml')).toBe(
      'read-only file system: x.yaml',
    );
    expect(describeIoError(makeErrnoError('ELOOP', 'raw'), 'x.yaml')).toBe(
      'too many symbolic links: x.yaml',
    );
    expect(describeIoError(makeErrnoError('ENAMETOOLONG', 'raw'), 'x.yaml')).toBe(
      'path name too long: x.yaml',
    );
  });

  it('maps EMFILE without echoing the path', () => {
    expect(describeIoError(makeErrnoError('EMFILE', 'raw'), 'x.yaml')).toBe('too many open files');
  });

  it('never includes a temp-file name for a mapped code, even if the underlying error message has one', () => {
    const err = makeErrnoError(
      'ENOENT',
      "ENOENT: no such file or directory, open 'x.yaml.123.abc.tmp'",
    );
    expect(describeIoError(err, 'x.yaml')).toBe('file not found: x.yaml');
  });

  it('falls back to the raw message for an unmapped errno code', () => {
    const err = makeErrnoError('EBUSY', 'resource busy or locked');
    expect(describeIoError(err, 'x.yaml')).toBe('resource busy or locked');
  });

  it('falls back to String() for a non-Error thrown value', () => {
    expect(describeIoError('boom', 'x.yaml')).toBe('boom');
  });
});
