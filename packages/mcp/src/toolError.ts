import { resolve } from 'node:path';
import { ConflictError, DiagrammarError, ValidationError } from '@noblecloak/diagrammar-core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Maps a Node.js filesystem error `code` to a Diagrammar tool-error code. */
const NODE_ERRNO_CODE_MAP: Record<string, string> = {
  EEXIST: 'exists',
  ENOENT: 'not_found',
  EACCES: 'forbidden',
  EPERM: 'forbidden',
};

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

/** Matches a Windows drive-letter path or a POSIX absolute path, stopping at whitespace or a quote. */
const ABSOLUTE_PATH_RE = /[A-Za-z]:\\[^\s'"]+|\/[^\s'"]+/g;

/**
 * Strips absolute host filesystem paths out of an error message before it
 * reaches an MCP client, so hosts never leak local filesystem layout.
 * When the configured server `root` is known, every occurrence of its
 * resolved absolute path is replaced with the literal `<root>`. When `root`
 * is unknown (no root configured, e.g. a call site that hasn't wired one
 * through), any absolute path found anywhere in the message is replaced
 * with `<path>` instead — a coarser but still leak-proof fallback.
 */
function sanitizeMessage(message: string, root: string | undefined): string {
  if (root !== undefined) {
    return message.split(resolve(root)).join('<root>');
  }
  return message.replace(ABSOLUTE_PATH_RE, '<path>');
}

export function toErrorResult(err: unknown, root?: string): CallToolResult {
  if (err instanceof ValidationError) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ code: err.code, issues: err.issues }) }],
    };
  }
  if (err instanceof ConflictError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ code: err.code, expected: err.expected, actual: err.actual }),
        },
      ],
    };
  }
  if (err instanceof DiagrammarError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ code: err.code, message: sanitizeMessage(err.message, root) }),
        },
      ],
    };
  }
  if (isErrnoException(err) && err.code !== undefined) {
    // A mapped code (EEXIST, ENOENT, EACCES, EPERM) gets its specific tool
    // error code; any other Node errno (ENOTDIR, EISDIR, ELOOP,
    // ENAMETOOLONG, EROFS, EMFILE, ...) still goes through the sanitised
    // envelope, under the generic `io_error` code, rather than escaping as
    // an uncaught exception with an unsanitised message.
    const code = NODE_ERRNO_CODE_MAP[err.code] ?? 'io_error';
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({ code, message: sanitizeMessage(err.message, root) }),
        },
      ],
    };
  }
  // Every other error (a non-errno `Error`, or a non-Error throw) still gets
  // a sanitised envelope instead of propagating — an MCP tool call must
  // never surface a raw stack trace or unsanitised message to a client.
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ code: 'internal', message: sanitizeMessage(message, root) }),
      },
    ],
  };
}

export async function withToolErrors(
  fn: () => Promise<CallToolResult>,
  root?: string,
): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (err) {
    return toErrorResult(err, root);
  }
}
