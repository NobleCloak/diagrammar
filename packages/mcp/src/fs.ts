import { existsSync, realpathSync } from 'node:fs';
import { link, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  DiagrammarError,
  ValidationError,
  isErrnoException,
  normalizeRelativePath,
  type AssetResolver,
  type IconRegistry,
  type ValidationIssue,
} from '@noblecloak/diagrammar-core';

export interface ToolContext {
  /** Absolute path to the jailed root directory. Always defined when noFs is false. */
  root: string | undefined;
  noFs: boolean;
  /** Icon sets available to `icon:` set-form references. */
  icons: IconRegistry;
}

/**
 * Guards any filesystem-touching tool code path: throws when the server was
 * started with `--no-fs` or otherwise has no root configured. Narrows
 * `ctx.root` to `string` for the rest of the caller's scope, so a `path`
 * or `outputPath`-handling branch can pass it straight to `resolveInRoot`
 * without its own `undefined` check.
 */
export function assertFsEnabled(ctx: ToolContext): asserts ctx is ToolContext & { root: string } {
  if (ctx.noFs || ctx.root === undefined) {
    throw new DiagrammarError(
      'Filesystem access is disabled on this server (--no-fs).',
      'fs_disabled',
    );
  }
}

const DIAGRAMMAR_HEADER = /^diagrammar:\s*1\b/m;
const HEADER_PROBE_BYTES = 2048;

/**
 * Resolves `absPath` to its real, symlink-free location for jail comparison.
 * Walks up to the nearest existing ancestor (falling back to the filesystem
 * root), resolves that ancestor's real path, and reattaches any non-existent
 * trailing segments unchanged. Used only to detect symlink escapes; the
 * literal (non-realpath) target is still what `resolveInRoot` returns.
 */
function realishPath(absPath: string): string {
  let current = absPath;
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    suffix.unshift(basename(current));
    current = parent;
  }
  const real = realpathSync(current);
  return suffix.length > 0 ? resolve(real, ...suffix) : real;
}

export function resolveInRoot(root: string, relPath: string): string {
  if (relPath.includes('\0')) {
    throw new DiagrammarError('path contains a null byte', 'invalid_path');
  }
  if (isAbsolute(relPath)) {
    throw new DiagrammarError(
      `path must be relative to root, got absolute path "${relPath}"`,
      'path_outside_root',
    );
  }
  const rootAbs = resolve(root);
  const target = resolve(rootAbs, relPath);
  const rel = relative(rootAbs, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new DiagrammarError(`path "${relPath}" escapes root "${rootAbs}"`, 'path_outside_root');
  }

  const realRel = relative(realishPath(rootAbs), realishPath(target));
  if (realRel.startsWith('..') || isAbsolute(realRel)) {
    throw new DiagrammarError(
      `path "${relPath}" escapes root "${rootAbs}" via a symlink`,
      'path_outside_root',
    );
  }

  return target;
}

const SKIPPED_ENTRY_NAMES = new Set(['node_modules']);

function isSkippedEntryName(name: string): boolean {
  return name.startsWith('.') || SKIPPED_ENTRY_NAMES.has(name);
}

/**
 * Recursively collects `.yaml`/`.yml` file paths (relative to `rootAbs`,
 * `/`-separated) under `dirAbs`, never descending into a symlinked
 * directory and skipping `node_modules` and dotfile/dot-directory entries.
 * A symlinked *file* is included only when `resolveInRoot` accepts it,
 * reusing the same root-jail (including the symlink-target) check that
 * guards direct path access.
 */
async function walkYamlFiles(
  rootAbs: string,
  dirAbs: string,
  relDir: string,
  out: string[],
): Promise<void> {
  const entries = await readdir(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    if (isSkippedEntryName(entry.name)) continue;
    const entryRel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
    const entryAbs = resolve(dirAbs, entry.name);

    if (entry.isSymbolicLink()) {
      let targetStat;
      try {
        targetStat = await stat(entryAbs);
      } catch {
        continue; // dangling symlink
      }
      if (targetStat.isDirectory()) {
        // Symlinked directories are never followed, inside or outside root.
        continue;
      }
      if (targetStat.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
        try {
          resolveInRoot(rootAbs, entryRel);
        } catch {
          continue; // symlink target escapes the root jail
        }
        out.push(entryRel);
      }
      continue;
    }

    if (entry.isDirectory()) {
      await walkYamlFiles(rootAbs, entryAbs, entryRel, out);
      continue;
    }

    if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
      out.push(entryRel);
    }
  }
}

export async function listDiagrams(root: string, glob?: string): Promise<string[]> {
  const rootAbs = resolve(root);
  const candidates: string[] = [];
  await walkYamlFiles(rootAbs, rootAbs, '', candidates);
  candidates.sort();

  let allowed: Set<string> | undefined;
  if (glob !== undefined) {
    const { glob: fsGlob } = await import('node:fs/promises');
    const matches: string[] = [];
    for await (const match of fsGlob(glob, { cwd: rootAbs })) {
      matches.push(match.split('\\').join('/'));
    }
    allowed = new Set(matches);
  }

  const result: string[] = [];
  for (const relPath of candidates) {
    if (allowed !== undefined && !allowed.has(relPath)) continue;
    const full = resolve(rootAbs, relPath);
    const text = await readFile(full, 'utf8');
    if (DIAGRAMMAR_HEADER.test(text.slice(0, HEADER_PROBE_BYTES))) {
      result.push(relPath);
    }
  }
  return result;
}

export interface SourceInput {
  source?: string | undefined;
  path?: string | undefined;
}

export interface ResolvedSource {
  text: string;
  /** Absolute path the text was read from, when `path` was used. */
  resolvedPath?: string;
}

export async function resolveSource(ctx: ToolContext, input: SourceInput): Promise<ResolvedSource> {
  const hasSource = input.source !== undefined;
  const hasPath = input.path !== undefined;
  if (hasSource === hasPath) {
    const issue: ValidationIssue = {
      path: 'source|path',
      message: 'Provide exactly one of "source" or "path".',
    };
    throw new ValidationError([issue]);
  }
  if (input.path !== undefined) {
    assertFsEnabled(ctx);
    const resolvedPath = resolveInRoot(ctx.root, input.path);
    const text = await readFile(resolvedPath, 'utf8');
    return { text, resolvedPath };
  }
  if (input.source === undefined) {
    throw new DiagrammarError('Internal error: expected source to be defined.', 'internal');
  }
  return { text: input.source };
}

export interface WriteAtomicOptions {
  /**
   * When true, fails with an `EEXIST` error rather than overwriting an
   * existing file at `path` — used by callers (`diagrammar_create`, the
   * CLI's `new` command) whose contract is "refuse to overwrite".
   */
  exclusive?: boolean;
}

/**
 * Writes `data` to `path` without ever leaving a partial file visible
 * there: writes to a sibling temp file first, then atomically publishes it.
 *
 * Non-exclusive writes (edit, render) use `rename`, which atomically
 * replaces any existing file at `path` — safe on the same filesystem
 * (always true here, since the temp file is a sibling of the target) on
 * both POSIX and Windows. Exclusive writes (create, CLI `new`) use `link`
 * instead, which fails with `EEXIST` rather than silently overwriting when
 * `path` already exists, then always cleans up the now-orphaned temp file
 * (`rm` with `force: true`, a no-op if `rename` already consumed it).
 */
export async function writeAtomic(
  path: string,
  data: string | Buffer,
  options?: WriteAtomicOptions,
): Promise<void> {
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, data);
  try {
    if (options?.exclusive === true) {
      await link(tempPath, path);
    } else {
      await rename(tempPath, path);
    }
  } finally {
    await rm(tempPath, { force: true });
  }
}

/**
 * The MCP server's asset resolver (spec §6.2): paths are relative to the
 * diagram's directory (`resolvedPath` from `resolveSource`) or to the root
 * for inline `source`, and every read goes through `resolveInRoot`, so the
 * same lexical + symlink jail that guards `path` arguments guards theme
 * files. Under `--no-fs` every read fails with `asset_fs_disabled`.
 */
export function assetResolverFor(ctx: ToolContext, resolvedPath?: string): AssetResolver {
  if (ctx.noFs || ctx.root === undefined) {
    return {
      read: (relPath: string) =>
        Promise.reject(
          new DiagrammarError(
            `asset "${relPath}" cannot be read: filesystem access is disabled on this server (--no-fs)`,
            'asset_fs_disabled',
          ),
        ),
    };
  }
  const root = ctx.root;
  const baseAbs = resolvedPath !== undefined ? dirname(resolvedPath) : root;
  return {
    async read(relPath: string): Promise<Uint8Array> {
      const target = resolve(baseAbs, normalizeRelativePath(relPath));
      const rootRel = relative(root, target).split(sep).join('/');
      let abs: string;
      try {
        abs = resolveInRoot(root, rootRel);
      } catch (error) {
        if (error instanceof DiagrammarError && error.code === 'path_outside_root') {
          throw new DiagrammarError(
            `asset "${relPath}" escapes the server root`,
            'asset_outside_base',
          );
        }
        throw error;
      }
      try {
        return await readFile(abs);
      } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
          throw new DiagrammarError(`asset "${relPath}" not found`, 'asset_not_found');
        }
        throw error;
      }
    },
  };
}
