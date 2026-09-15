import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { serve, type ServeResult } from './serve.js';

/**
 * `Client.connect()` takes a `Transport` whose `sessionId` field is declared
 * `sessionId?: string` (absent-or-string). `StreamableHTTPClientTransport`
 * instead exposes a `get sessionId(): string | undefined` — always present,
 * possibly `undefined` — which `exactOptionalPropertyTypes` treats as a
 * different (incompatible) shape from "may be absent". Same category of
 * SDK/`exactOptionalPropertyTypes` mismatch as the `sessionIdGenerator` one
 * documented in `app.ts`; this cast is the unavoidable bridge on the client
 * side, mirroring `edit.ts`'s precedent for casts required by the SDK's own
 * looser types.
 */
function asTransport(transport: StreamableHTTPClientTransport): Transport {
  return transport as Transport;
}

const FLOWCHART = `diagrammar: 1
type: flowchart
title: Order fulfilment
nodes:
  - id: start
    label: Order received
    shape: oval
  - id: check
    label: In stock?
  - id: ship
    label: Ship order
edges:
  - { from: start, to: check }
  - { id: yes, from: check, to: ship, label: "yes" }
`;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Splits an SSE response body into its individual events (blocks separated
 * by a blank line, per the SSE spec) and, for each event, joins every
 * `data:` line's value with `\n` (also per spec — a single logical data
 * payload can be split across multiple `data:` lines) rather than assuming
 * one `data:` line per event. A field line's value starts after the first
 * `:` and drops at most one leading space.
 */
function parseSseEvents(text: string): { dataLines: string[] }[] {
  return text
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const dataLines = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).replace(/^ /, ''));
      return { dataLines };
    });
}

/**
 * A stateless-mode fallback transport always answers over `text/event-stream`
 * (never plain `application/json`), even for a single request/response pair.
 * Reconstructs the JSON-RPC payload from that SSE body so raw `fetch` tests
 * against the fall-through path can assert on it directly, asserting along
 * the way that the body carried exactly one JSON-RPC message: comment-only
 * events (e.g. `: keepalive`) carry no `data:` line and are ignored, but
 * more than one data-carrying event is a test failure, not silently the
 * first one picked.
 */
async function readJsonRpcResponse(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  const text = await res.text();
  const messages = parseSseEvents(text).filter((event) => event.dataLines.length > 0);
  if (messages.length !== 1) {
    throw new Error(
      `expected exactly one SSE event carrying a JSON-RPC message, got ${messages.length}: ${text}`,
    );
  }
  return JSON.parse(messages[0]!.dataLines.join('\n'));
}

describe('diagrammar MCP server (integration)', () => {
  let root: string;
  let served: ServeResult;
  let noFsServed: ServeResult;
  let serverUrl: URL;
  let noFsUrl: URL;
  let healthzUrl: URL;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'diagrammar-mcp-integration-'));
    await writeFile(join(root, 'order.yaml'), FLOWCHART, 'utf8');
    served = await serve({ root, noFs: false, port: 0, host: '127.0.0.1' });
    serverUrl = new URL(`http://127.0.0.1:${served.port}/mcp`);
    healthzUrl = new URL('/healthz', serverUrl);
    noFsServed = await serve({ noFs: true, port: 0, host: '127.0.0.1' });
    noFsUrl = new URL(`http://127.0.0.1:${noFsServed.port}/mcp`);
  }, 30_000);

  afterAll(async () => {
    await expect(served.close()).resolves.toBeUndefined();
    await noFsServed.close();
    await rm(root, { recursive: true, force: true });
  });

  async function connect(url: URL): Promise<Client> {
    const client = new Client({ name: 'integration-test', version: '0.0.0' });
    await client.connect(asTransport(new StreamableHTTPClientTransport(url)));
    return client;
  }

  async function connectWithTransport(
    url: URL,
  ): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const client = new Client({ name: 'integration-test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(url);
    await client.connect(asTransport(transport));
    return { client, transport };
  }

  it('initialize establishes a session identified by a server-issued mcp-session-id', async () => {
    const { client, transport } = await connectWithTransport(serverUrl);
    expect(transport.sessionId).toMatch(SESSION_ID_RE);
    await client.close();
  });

  it('lists all eight tools', async () => {
    const client = await connect(serverUrl);
    const result = await client.listTools();
    expect(result.tools.map((t) => t.name).sort()).toEqual(
      [
        'diagrammar_create',
        'diagrammar_describe',
        'diagrammar_edit',
        'diagrammar_icons',
        'diagrammar_list',
        'diagrammar_render',
        'diagrammar_schema',
        'diagrammar_validate',
      ].sort(),
    );
    await client.close();
  });

  it('diagrammar_list finds the seeded example', async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({ name: 'diagrammar_list', arguments: {} });
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      files: string[];
    };
    expect(parsed.files).toContain('order.yaml');
    await client.close();
  });

  it('diagrammar_describe by path reports valid: true', async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { path: 'order.yaml' },
    });
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      valid: boolean;
    };
    expect(parsed.valid).toBe(true);
    await client.close();
  });

  it('diagrammar_validate by source reports ok: true', async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({
      name: 'diagrammar_validate',
      arguments: { source: FLOWCHART },
    });
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as { ok: boolean };
    expect(parsed.ok).toBe(true);
    await client.close();
  });

  it("diagrammar_create writes a new file under root with the caller's own elements", async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({
      name: 'diagrammar_create',
      arguments: {
        path: 'created.yaml',
        type: 'flowchart',
        title: 'New',
        nodes: [
          { id: 'x', label: 'X' },
          { id: 'y', label: 'Y' },
        ],
        edges: [{ from: 'x', to: 'y' }],
      },
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as {
      path: string;
      describe: { elements: { kind: string; id?: string; from?: string; to?: string }[] };
    };
    expect(parsed.describe.elements.some((el) => el.kind === 'node' && el.id === 'x')).toBe(true);
    expect(parsed.describe.elements.some((el) => el.kind === 'node' && el.id === 'y')).toBe(true);
    expect(
      parsed.describe.elements.some((el) => el.kind === 'edge' && el.from === 'x' && el.to === 'y'),
    ).toBe(true);

    const onDisk = await readFile(join(root, 'created.yaml'), 'utf8');
    expect(onDisk).toContain('id: x');
    expect(onDisk).toContain('id: y');
    expect(onDisk).not.toContain('id: start'); // the seed placeholder must be stripped
    await client.close();
  });

  it('diagrammar_edit by path applies an op and diagrammar_describe reflects it', async () => {
    const client = await connect(serverUrl);
    const editResult = await client.callTool({
      name: 'diagrammar_edit',
      arguments: {
        path: 'order.yaml',
        ops: [{ op: 'addNode', node: { id: 'archived', label: 'Archived' } }],
      },
    });
    expect(editResult.isError).toBeFalsy();
    const describeResult = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { path: 'order.yaml' },
    });
    const parsed = JSON.parse((describeResult.content as { text: string }[])[0]!.text) as {
      elements: { id?: string }[];
    };
    expect(parsed.elements.some((el) => el.id === 'archived')).toBe(true);
    await client.close();
  });

  it('diagrammar_edit reports a conflict on hash mismatch', async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({
      name: 'diagrammar_edit',
      arguments: {
        path: 'order.yaml',
        ops: [{ op: 'addNode', node: { id: 'x' } }],
        expectedHash: 'wrong-hash',
      },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as { code: string };
    expect(parsed.code).toBe('conflict');
    await client.close();
  });

  it('diagrammar_render returns a PNG image block with a valid PNG signature', async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({
      name: 'diagrammar_render',
      arguments: { path: 'order.yaml' },
    });
    const content = result.content as { type: string; mimeType?: string; data?: string }[];
    expect(content[0]!.type).toBe('image');
    expect(content[0]!.mimeType).toBe('image/png');
    const bytes = Buffer.from(content[0]!.data!, 'base64');
    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    await client.close();
  }, 15_000);

  it('diagrammar_schema returns the JSON Schema and guide as two content blocks', async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({ name: 'diagrammar_schema', arguments: {} });
    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(2);

    expect(content[0]!.type).toBe('text');
    const schema = JSON.parse(content[0]!.text) as { $schema?: string };
    expect(schema.$schema).toContain('json-schema.org');

    expect(content[1]!.type).toBe('text');
    expect(content[1]!.text).toContain('Diagrammar authoring guide');
    await client.close();
  });

  it('lists all resources', async () => {
    const client = await connect(serverUrl);
    const result = await client.listResources();
    expect(result.resources.map((r) => r.uri).sort()).toEqual([
      'diagrammar://guide',
      'diagrammar://schema/theme-v1',
      'diagrammar://schema/v1',
    ]);
    await client.close();
  });

  it('reads the schema resource over HTTP as JSON Schema', async () => {
    const client = await connect(serverUrl);
    const result = await client.readResource({ uri: 'diagrammar://schema/v1' });
    const content = result.contents[0] as { text: string; mimeType?: string };
    expect(content.mimeType).toBe('application/json');
    const schema = JSON.parse(content.text) as { $schema?: string };
    expect(schema.$schema).toContain('json-schema.org');
    await client.close();
  });

  it('reads the guide resource over HTTP as Markdown', async () => {
    const client = await connect(serverUrl);
    const result = await client.readResource({ uri: 'diagrammar://guide' });
    const content = result.contents[0] as { text: string };
    expect(content.text).toContain('Diagrammar authoring guide');
    await client.close();
  });

  it('rejects a source/path XOR violation as a tool error', async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { source: FLOWCHART, path: 'order.yaml' },
    });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('rejects a path escaping root as a tool error', async () => {
    const client = await connect(serverUrl);
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { path: '../../etc/passwd' },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as { code: string };
    expect(parsed.code).toBe('path_outside_root');
    await client.close();
  });

  it('a --no-fs server exposes exactly six tools and does not offer a path argument at all', async () => {
    const client = await connect(noFsUrl);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(
      [
        'diagrammar_describe',
        'diagrammar_edit',
        'diagrammar_icons',
        'diagrammar_render',
        'diagrammar_schema',
        'diagrammar_validate',
      ].sort(),
    );
    const describeTool = tools.tools.find((t) => t.name === 'diagrammar_describe');
    if (describeTool === undefined) throw new Error('diagrammar_describe not found');
    const properties = (describeTool.inputSchema as { properties?: Record<string, unknown> })
      .properties;
    expect(properties).toBeDefined();
    // Agent-ergonomics ruling: under --no-fs, "path" is dropped from the
    // schema entirely (never offered), rather than left in place to fail
    // with "fs_disabled" every time it's used — a client that sends it
    // anyway just has it silently stripped, falling back to the same
    // "provide exactly one of source or path" validation error as sending
    // neither.
    expect(Object.keys(properties!)).not.toContain('path');
    const result = await client.callTool({
      name: 'diagrammar_describe',
      arguments: { path: 'order.yaml' },
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content as { text: string }[])[0]!.text) as { code: string };
    expect(parsed.code).toBe('validation');
    await client.close();
  });

  it('rejects a non-local Origin header with 403 over raw fetch', async () => {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        origin: 'http://evil.example',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'x', version: '0.0.0' },
        },
      }),
    });
    expect(res.status).toBe(403);
    await res.text();
  });

  it('allows a localhost Origin header over raw fetch', async () => {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        origin: `http://localhost:${served.port}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'x', version: '0.0.0' },
        },
      }),
    });
    expect(res.status).not.toBe(403);
    await res.text();
  });

  it('allows a request with no Origin header over raw fetch', async () => {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'x', version: '0.0.0' },
        },
      }),
    });
    expect(res.status).toBe(200);
    await res.text();
  });

  it('an unknown mcp-session-id still gets a real answer (fall-through), not a rejection', async () => {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': 'this-session-id-was-never-issued-by-this-process',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(200);
    const body = (await readJsonRpcResponse(res)) as { result?: { tools: unknown[] } };
    expect(Array.isArray(body.result?.tools)).toBe(true);
  });

  it('a non-initialize POST without a session id is rejected with 400', async () => {
    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain('not initialized');
  });

  it('DELETE /mcp then reusing the session id falls through instead of erroring', async () => {
    const { client, transport } = await connectWithTransport(serverUrl);
    const sessionId = transport.sessionId;
    expect(sessionId).toMatch(SESSION_ID_RE);
    await transport.terminateSession();
    await client.close();

    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId!,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(200);
    const body = (await readJsonRpcResponse(res)) as { result?: { tools: unknown[] } };
    expect(Array.isArray(body.result?.tools)).toBe(true);
  });

  it('/healthz responds 200 with {ok: true}', async () => {
    const res = await fetch(healthzUrl);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
