import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe as describeDiagram } from '@noblecloak/diagrammar-core';
import { run } from './new.js';

describe('new command', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-new-cmd-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('creates a minimal valid file with the given type and title', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const file = join(dir, 'fresh.yaml');
    const code = await run([file, '--type', 'sequence', '--title', 'Fresh']);
    expect(code).toBe(0);
    const text = await readFile(file, 'utf8');
    expect(text).toContain('diagrammar: 1');
    expect(text).toContain('type: sequence');
  });

  it('strips the seed placeholder so the file has exactly no elements', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const file = join(dir, 'empty.yaml');
    const code = await run([file, '--type', 'flowchart']);
    expect(code).toBe(0);
    const text = await readFile(file, 'utf8');
    expect(text).not.toContain('start');
    const described = describeDiagram(text);
    expect(described.valid).toBe(true);
    expect(described.elements).toEqual([]);
  });

  it('strips the sequence seed placeholder participants and message', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const file = join(dir, 'empty-seq.yaml');
    const code = await run([file, '--type', 'sequence']);
    expect(code).toBe(0);
    const text = await readFile(file, 'utf8');
    const described = describeDiagram(text);
    expect(described.valid).toBe(true);
    expect(described.elements).toEqual([]);
  });

  it('returns 1 for a missing --type', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([join(dir, 'x.yaml')]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('returns 1 for an invalid --type', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([join(dir, 'x.yaml'), '--type', 'bogus']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('returns 1 and does not overwrite an existing file', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const file = join(dir, 'once.yaml');
    expect(await run([file, '--type', 'flowchart'])).toBe(0);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await run([file, '--type', 'flowchart'])).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  it('returns 1 with a readable message when the parent directory is missing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = join(dir, 'nope', 'x.yaml');
    const code = await run([file, '--type', 'flowchart']);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });
});
