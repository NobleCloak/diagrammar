import { describe, it, expect } from 'vitest';
import { ConflictError, DiagrammarError, ValidationError } from '@noblecloak/diagrammar-core';
import { toErrorResult, withToolErrors } from './toolError.js';

function makeErrnoError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe('toErrorResult', () => {
  it('maps ValidationError to an isError content block with issues', () => {
    const err = new ValidationError([{ path: 'nodes[0].id', message: 'required' }]);
    const result = toErrorResult(err);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      issues: unknown[];
    };
    expect(parsed.code).toBe('validation');
    expect(parsed.issues).toEqual([{ path: 'nodes[0].id', message: 'required' }]);
  });

  it('maps ConflictError to an isError content block with expected and actual hashes', () => {
    const err = new ConflictError('abc', 'def');
    const result = toErrorResult(err);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      expected: string;
      actual: string;
    };
    expect(parsed).toEqual({ code: 'conflict', expected: 'abc', actual: 'def' });
  });

  it('maps a generic DiagrammarError to an isError content block with its code', () => {
    const err = new DiagrammarError('nope', 'fs_disabled');
    const result = toErrorResult(err);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({ code: 'fs_disabled', message: 'nope' });
  });

  it('sanitises the configured root out of a generic DiagrammarError message (the fallback branch)', () => {
    const root = '/Users/someone/diagrams';
    const err = new DiagrammarError(`path "x.yaml" escapes root "${root}"`, 'path_outside_root');
    const result = toErrorResult(err, root);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({
      code: 'path_outside_root',
      message: 'path "x.yaml" escapes root "<root>"',
    });
  });

  it('maps a Node EEXIST error to code "exists" and sanitises the configured root out of its message', () => {
    const root = '/Users/someone/diagrams';
    const err = makeErrnoError('EEXIST', `file already exists, open '${root}/x.yaml'`);
    const result = toErrorResult(err, root);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({
      code: 'exists',
      message: "file already exists, open '<root>/x.yaml'",
    });
  });

  it('maps a Node ENOENT error to code "not_found" and sanitises the configured root out of its message', () => {
    const root = '/Users/someone/diagrams';
    const err = makeErrnoError('ENOENT', `no such file or directory, open '${root}/x.yaml'`);
    const result = toErrorResult(err, root);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({
      code: 'not_found',
      message: "no such file or directory, open '<root>/x.yaml'",
    });
  });

  it('maps a Node EACCES error to code "forbidden" and sanitises the configured root out of its message', () => {
    const root = '/Users/someone/diagrams';
    const err = makeErrnoError('EACCES', `permission denied, open '${root}/x.yaml'`);
    const result = toErrorResult(err, root);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({
      code: 'forbidden',
      message: "permission denied, open '<root>/x.yaml'",
    });
  });

  it('maps a Node EPERM error to code "forbidden" and sanitises the configured root out of its message', () => {
    const root = '/Users/someone/diagrams';
    const err = makeErrnoError('EPERM', `operation not permitted, open '${root}/x.yaml'`);
    const result = toErrorResult(err, root);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({
      code: 'forbidden',
      message: "operation not permitted, open '<root>/x.yaml'",
    });
  });

  it('strips an absolute path out of the message with a generic <path> placeholder when no root is configured', () => {
    const err = makeErrnoError(
      'ENOENT',
      "no such file or directory, open '/Users/someone/diagrams/x.yaml'",
    );
    const result = toErrorResult(err);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({
      code: 'not_found',
      message: "no such file or directory, open '<path>'",
    });
    expect(parsed.message).not.toContain('/Users/');
  });

  it('maps an unmapped Node errno (e.g. ENOTDIR) to a sanitised io_error envelope instead of rethrowing', () => {
    const root = '/Users/someone/diagrams';
    const err = makeErrnoError('ENOTDIR', `not a directory, stat '${root}/ok.yaml/nested.yaml'`);
    const result = toErrorResult(err, root);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed.code).toBe('io_error');
    expect(parsed.message).toBe("not a directory, stat '<root>/ok.yaml/nested.yaml'");
    expect(parsed.message).not.toContain('/Users/');
  });

  it('maps EISDIR to a sanitised io_error envelope instead of rethrowing', () => {
    const root = '/Users/someone/diagrams';
    const err = makeErrnoError('EISDIR', `illegal operation on a directory, read '${root}/sub'`);
    const result = toErrorResult(err, root);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed.code).toBe('io_error');
    expect(parsed.message).not.toContain('/Users/');
    expect(parsed.message).not.toContain('/private/');
  });

  it('maps a non-errno unknown error to a generic internal envelope, never a stack trace', () => {
    const err = new Error('boom');
    const result = toErrorResult(err);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({ code: 'internal', message: 'boom' });
    const raw = (result.content[0] as { text: string }).text;
    expect(raw).not.toContain('    at ');
  });

  it('maps a non-Error thrown value to a generic internal envelope', () => {
    const result = toErrorResult('just a string');
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({ code: 'internal', message: 'just a string' });
  });
});

describe('withToolErrors', () => {
  it('passes through a successful result', async () => {
    const result = await withToolErrors(() =>
      Promise.resolve({
        content: [{ type: 'text' as const, text: 'ok' }],
      }),
    );
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('catches a thrown DiagrammarError and converts it', async () => {
    const result = await withToolErrors(() => {
      throw new DiagrammarError('nope', 'fs_disabled');
    });
    expect(result.isError).toBe(true);
  });

  it('converts an unexpected error to an internal envelope instead of rethrowing', async () => {
    const result = await withToolErrors(() => {
      throw new Error('boom');
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({ code: 'internal', message: 'boom' });
  });

  it('passes the root through to toErrorResult so paths are sanitised', async () => {
    const root = '/Users/someone/diagrams';
    const result = await withToolErrors(() => {
      throw new DiagrammarError(`path "x.yaml" escapes root "${root}"`, 'path_outside_root');
    }, root);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      code: string;
      message: string;
    };
    expect(parsed).toEqual({
      code: 'path_outside_root',
      message: 'path "x.yaml" escapes root "<root>"',
    });
  });
});
