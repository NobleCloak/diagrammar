import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { DiagramDocument } from '@noblecloak/diagrammar-core';
import { register } from './edit.js';
import type { ToolContext } from '../fs.js';

const FLOWCHART =
  'diagrammar: 1\ntype: flowchart\nnodes:\n  - { id: a }\n  - { id: b }\nedges:\n  - { from: a, to: b }\n';

interface EditPayload {
  yaml: string;
  hash: string;
  ok: boolean;
  issues: { path: string; message: string }[];
  describe: unknown;
  changed: string[];
  removed: string[];
  warnings: unknown[];
}

async function connectedClient(ctx: ToolContext) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  register(server, ctx);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

function parseResult(result: unknown): EditPayload {
  const content = (result as { content: { text: string }[] }).content;
  return JSON.parse(content[0]!.text) as EditPayload;
}

describe('diagrammar_edit', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-edit-'));
    await writeFile(join(root, 'f.yaml'), FLOWCHART, 'utf8');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('applies an op to inline source and returns updated YAML without writing a file', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: { source: FLOWCHART, ops: [{ op: 'addNode', node: { id: 'c' } }] },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result);
    expect(parsed.yaml).toContain('id: c');
    expect(parsed.changed.length).toBeGreaterThan(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.issues).toEqual([]);
    expect(parsed.removed).toEqual([]);
    expect(parsed.hash).toBe(DiagramDocument.from(parsed.yaml).hash());
    expect(parsed.describe).toBeTruthy();
    await client.close();
  });

  it('applies an op to a path-based file and writes it back', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: { path: 'f.yaml', ops: [{ op: 'addNode', node: { id: 'c' } }] },
    });
    expect(result.isError).toBeFalsy();
    const onDisk = await readFile(join(root, 'f.yaml'), 'utf8');
    expect(onDisk).toContain('id: c');
    await client.close();
  });

  it('applies a JSON Patch to inline source and returns updated YAML without writing a file', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: {
        source: FLOWCHART,
        patch: [{ op: 'add', path: '/nodes/-', value: { id: 'c' } }],
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = parseResult(result);
    expect(parsed.yaml).toContain('id: c');
    expect(parsed.ok).toBe(true);
    expect(parsed.hash).toBe(DiagramDocument.from(parsed.yaml).hash());
    await client.close();
  });

  it('applies a JSON Patch to a path-based file and writes it back', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: { path: 'f.yaml', patch: [{ op: 'add', path: '/nodes/-', value: { id: 'c' } }] },
    });
    expect(result.isError).toBeFalsy();
    const onDisk = await readFile(join(root, 'f.yaml'), 'utf8');
    expect(onDisk).toContain('id: c');
    await client.close();
  });

  it('rejects a call with both "ops" and "patch"', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: {
        path: 'f.yaml',
        ops: [{ op: 'addNode', node: { id: 'c' } }],
        patch: [{ op: 'add', path: '/nodes/-', value: { id: 'd' } }],
      },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      code: string;
      issues: { path: string; message: string }[];
    };
    expect(parsed.code).toBe('validation');
    expect(parsed.issues).toEqual([
      { path: 'ops', message: 'Provide exactly one of "ops" or "patch".' },
    ]);
    const after = await readFile(join(root, 'f.yaml'), 'utf8');
    expect(after).toBe(FLOWCHART);
    await client.close();
  });

  it('rejects a call with neither "ops" nor "patch"', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: { path: 'f.yaml' },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      code: string;
      issues: { path: string; message: string }[];
    };
    expect(parsed.code).toBe('validation');
    expect(parsed.issues).toEqual([
      { path: 'ops', message: 'Provide exactly one of "ops" or "patch".' },
    ]);
    await client.close();
  });

  it('returns a conflict error on hash mismatch, leaving the file untouched', async () => {
    const client = await connectedClient({ root, noFs: false });
    const before = await readFile(join(root, 'f.yaml'), 'utf8');
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: {
        path: 'f.yaml',
        ops: [{ op: 'addNode', node: { id: 'c' } }],
        expectedHash: 'not-the-real-hash',
      },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      code: string;
      expected: string;
      actual: string;
    };
    expect(parsed.code).toBe('conflict');
    expect(parsed.expected).toBe('not-the-real-hash');
    expect(parsed.actual).toBe(DiagramDocument.from(before).hash());
    const after = await readFile(join(root, 'f.yaml'), 'utf8');
    expect(after).toBe(before);
    await client.close();
  });

  it('succeeds when expectedHash matches the current hash', async () => {
    const client = await connectedClient({ root, noFs: false });
    const currentHash = DiagramDocument.from(FLOWCHART).hash();
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: {
        path: 'f.yaml',
        ops: [{ op: 'addNode', node: { id: 'c' } }],
        expectedHash: currentHash,
      },
    });
    expect(result.isError).toBeFalsy();
    await client.close();
  });

  it('is atomic: an invalid op batch leaves the document unchanged and reports bracket-path issues', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: {
        path: 'f.yaml',
        ops: [{ op: 'addEdge', edge: { from: 'a', to: 'does-not-exist' } }],
      },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      issues: { path: string; message: string }[];
    };
    expect(parsed.issues.some((issue) => issue.path === 'edges[1].to')).toBe(true);
    const after = await readFile(join(root, 'f.yaml'), 'utf8');
    expect(after).toBe(FLOWCHART);
    await client.close();
  });

  it('is atomic: an invalid patch batch leaves the document unchanged and reports JSON-Pointer issues', async () => {
    const client = await connectedClient({ root, noFs: false });
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: { path: 'f.yaml', patch: [{ op: 'remove', path: '/nonexistent' }] },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      issues: { path: string; message: string }[];
    };
    expect(parsed.issues.some((issue) => issue.path === '/nonexistent')).toBe(true);
    const after = await readFile(join(root, 'f.yaml'), 'utf8');
    expect(after).toBe(FLOWCHART);
    await client.close();
  });

  it('excludes path from the registered schema under --no-fs', async () => {
    const client = await connectedClient({ root: undefined, noFs: true });
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'diagrammar_edit');
    if (tool === undefined) throw new Error('diagrammar_edit not found');
    const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties).toBeDefined();
    expect(Object.keys(properties!)).not.toContain('path');
    await client.close();
  });

  it('includes path in the registered schema when fs is enabled', async () => {
    const client = await connectedClient({ root, noFs: false });
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'diagrammar_edit');
    if (tool === undefined) throw new Error('diagrammar_edit not found');
    const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(properties).toBeDefined();
    expect(Object.keys(properties!)).toContain('path');
    await client.close();
  });
});
