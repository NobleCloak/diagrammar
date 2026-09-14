import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DiagramDocument } from '@noblecloak/diagrammar-core';
import { run } from './edit.js';

const FLOWCHART =
  'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\n';

describe('edit command', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'diagrammar-edit-cmd-'));
    await writeFile(join(dir, 'f.yaml'), FLOWCHART, 'utf8');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('applies an op and writes the file back', async () => {
    const opsFile = join(dir, 'ops.json');
    await writeFile(opsFile, JSON.stringify([{ op: 'addNode', node: { id: 'c' } }]), 'utf8');
    const code = await run([join(dir, 'f.yaml'), '--ops', opsFile]);
    expect(code).toBe(0);
    const text = await readFile(join(dir, 'f.yaml'), 'utf8');
    expect(text).toContain('id: c');
  });

  it('reports removed cascade keys in the JSON output, like the MCP tool', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const opsFile = join(dir, 'ops.json');
    await writeFile(
      opsFile,
      JSON.stringify([{ op: 'removeNode', target: { id: 'a' }, cascade: true }]),
      'utf8',
    );
    const code = await run([join(dir, 'f.yaml'), '--ops', opsFile]);
    expect(code).toBe(0);
    const output = JSON.parse(String(logSpy.mock.calls[0]![0])) as {
      changed: string[];
      removed: string[];
    };
    expect(output.removed).toEqual(expect.arrayContaining(['a', 'a->b']));
  });

  it('reports an empty removed array when nothing cascaded', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const opsFile = join(dir, 'ops.json');
    await writeFile(opsFile, JSON.stringify([{ op: 'addNode', node: { id: 'c' } }]), 'utf8');
    const code = await run([join(dir, 'f.yaml'), '--ops', opsFile]);
    expect(code).toBe(0);
    const output = JSON.parse(String(logSpy.mock.calls[0]![0])) as { removed: string[] };
    expect(output.removed).toEqual([]);
  });

  it('returns 1 and reports a conflict on hash mismatch, without writing', async () => {
    const opsFile = join(dir, 'ops.json');
    await writeFile(opsFile, JSON.stringify([{ op: 'addNode', node: { id: 'c' } }]), 'utf8');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([join(dir, 'f.yaml'), '--ops', opsFile, '--expected-hash', 'wrong']);
    expect(code).toBe(1);
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('conflict'))).toBe(true);
    const text = await readFile(join(dir, 'f.yaml'), 'utf8');
    expect(text).toBe(FLOWCHART);
  });

  it('succeeds when --expected-hash matches the current hash', async () => {
    const opsFile = join(dir, 'ops.json');
    await writeFile(opsFile, JSON.stringify([{ op: 'addNode', node: { id: 'c' } }]), 'utf8');
    const currentHash = DiagramDocument.from(FLOWCHART).hash();
    const code = await run([join(dir, 'f.yaml'), '--ops', opsFile, '--expected-hash', currentHash]);
    expect(code).toBe(0);
  });

  it('returns 1 and reports issues for an invalid op, without writing', async () => {
    const opsFile = join(dir, 'ops.json');
    await writeFile(
      opsFile,
      JSON.stringify([{ op: 'addEdge', edge: { from: 'a', to: 'nope' } }]),
      'utf8',
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([join(dir, 'f.yaml'), '--ops', opsFile]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
    const text = await readFile(join(dir, 'f.yaml'), 'utf8');
    expect(text).toBe(FLOWCHART);
  });

  it('returns 1 when --ops is missing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await run([join(dir, 'f.yaml')]);
    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalled();
  });

  // Controller ruling (Task 16): --ops accepts EITHER a typed-ops array OR
  // an RFC 6902 JSON Patch array in the same file, auto-detected.
  it('applies an RFC 6902 JSON Patch array via --ops', async () => {
    const opsFile = join(dir, 'ops.json');
    await writeFile(
      opsFile,
      JSON.stringify([{ op: 'add', path: '/nodes/-', value: { id: 'c' } }]),
      'utf8',
    );
    const code = await run([join(dir, 'f.yaml'), '--ops', opsFile]);
    expect(code).toBe(0);
    const text = await readFile(join(dir, 'f.yaml'), 'utf8');
    expect(text).toContain('id: c');
  });

  // Controller ruling (Task 16): --ops - reads the ops JSON from stdin.
  it('reads ops from stdin when --ops is "-"', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: Readable.from([JSON.stringify([{ op: 'addNode', node: { id: 'c' } }])]),
    });
    try {
      const code = await run([join(dir, 'f.yaml'), '--ops', '-']);
      expect(code).toBe(0);
    } finally {
      if (original !== undefined) Object.defineProperty(process, 'stdin', original);
    }
    const text = await readFile(join(dir, 'f.yaml'), 'utf8');
    expect(text).toContain('id: c');
  });
});
