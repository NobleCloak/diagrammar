import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { DiagrammarError, isErrnoException } from '../errors.js';
import { normalizeRelativePath } from './paths.js';

/**
 * Supplies the bytes of files a diagram references by relative path (a
 * theme file today; icons in plan 2). Core never reads the filesystem for
 * these itself — the CLI and the MCP server each hand `render()` a
 * resolver rooted where they decide (spec §6.2).
 */
export interface AssetResolver {
  /** `relPath` is `/`-separated and relative to the diagram's directory. */
  read(relPath: string): Promise<Uint8Array>;
}

export interface FileResolverOptions {
  /**
   * Absolute directory every resolved path must stay inside. Omit for
   * trusted local use (the CLI). The check is lexical; symlink targets are
   * the MCP jail's concern (spec §6.1).
   */
  root?: string;
}

export function fileResolver(baseDir: string, options: FileResolverOptions = {}): AssetResolver {
  const baseAbs = resolve(baseDir);
  const rootAbs = options.root !== undefined ? resolve(options.root) : undefined;
  return {
    async read(relPath: string): Promise<Uint8Array> {
      const target = resolve(baseAbs, normalizeRelativePath(relPath));
      if (rootAbs !== undefined) {
        const rel = relative(rootAbs, target);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          throw new DiagrammarError(
            `asset path "${relPath}" escapes the allowed root`,
            'asset_outside_base',
          );
        }
      }
      try {
        return await readFile(target);
      } catch (error) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
          throw new DiagrammarError(`asset "${relPath}" not found`, 'asset_not_found');
        }
        throw error;
      }
    },
  };
}

/** In-memory resolver for tests and docs; keys are normalized relative paths. */
export function memoryResolver(files: Record<string, string>): AssetResolver {
  return {
    read(relPath: string): Promise<Uint8Array> {
      const text = files[normalizeRelativePath(relPath)];
      if (text === undefined) {
        return Promise.reject(
          new DiagrammarError(`asset "${relPath}" not found`, 'asset_not_found'),
        );
      }
      return Promise.resolve(new TextEncoder().encode(text));
    },
  };
}
