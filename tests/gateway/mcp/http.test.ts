/**
 * MCP tool definitions test.
 *
 * Validates the 9-tool surface that src/mcp/http.ts (Streamable
 * HTTP transport) and src/mcp/server.ts (stdio transport) both
 * serve. We don't drive the transport in-process because the
 * StreamableHTTPServerTransport depends on an attached HTTP
 * response object — that's covered by the e2e spawn test
 * (CI-only; requires Turbopack-compiled output).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetConfigForTest } from '@/lib/config';
import { resetStoreForTest } from '@/lib/store';
import { resetSuiClientForTest } from '@/lib/sui';
import { resetWalrusForTest } from '@/lib/walrus';
import { toolDefinitions } from '@/mcp/tools';
import { Server } from '@modelcontextprotocol/sdk/server/index';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types';

const OWNER = '0x' + 'a'.repeat(64);
let dbPath: string;

beforeAll(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), 'suiedge-mcp-http-')), 'test.db');
  process.env.DB_PATH = dbPath;
  process.env.SUI_OWNER_ADDRESS = OWNER;
  process.env.AUTH_STUB_PASS = '1';
  resetConfigForTest();
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
});

afterAll(() => {
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
  resetConfigForTest();
});

function makeServer() {
  const server = new Server(
    { name: 'suiedge-memory-gateway', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  // Mirrors the wiring in src/mcp/server.ts and src/mcp/http.ts.
  const listHandler = async () => ({
    tools: toolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  });
  const callHandler = async (req: { params: { name: string; arguments?: unknown } }) => {
    const tool = toolDefinitions.find((t) => t.name === req.params.name);
    if (!tool) {
      return { content: [{ type: 'text', text: `unknown tool: ${req.params.name}` }], isError: true };
    }
    try {
      const result = await tool.handler(req.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true };
    }
  };
  server.setRequestHandler(ListToolsRequestSchema, listHandler as never);
  server.setRequestHandler(CallToolRequestSchema, callHandler as never);
  return { server, listHandler, callHandler };
}

describe('MCP tool surface', () => {
  it('exposes 9 tools with description and inputSchema', () => {
    expect(toolDefinitions.length).toBe(9);
    for (const t of toolDefinitions) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    }
  });
  it('tool names match the gateway REST/MCP contract (dotted form)', () => {
    const expected = new Set([
      'space.create', 'space.list',
      'memory.write', 'memory.search', 'context.load',
      'artifact.save', 'trace.log',
      'policy.share', 'policy.revoke',
    ]);
    const got = new Set(toolDefinitions.map((t) => t.name));
    for (const k of expected) expect(got.has(k), `missing ${k}`).toBe(true);
  });
});

describe('MCP server handlers (unit test, no transport)', () => {
  it('list handler returns the 9-tool list', async () => {
    const { listHandler } = makeServer();
    const out = await listHandler();
    expect(out.tools.length).toBe(9);
  });

  it('call handler routes space.list to the gateway and returns JSON', async () => {
    const { callHandler } = makeServer();
    const out = await callHandler({ params: { name: 'space.list', arguments: { owner: OWNER } } });
    expect(out.isError).toBeFalsy();
    const parsed = JSON.parse(out.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('call handler returns isError=true on unknown tool', async () => {
    const { callHandler } = makeServer();
    const out = await callHandler({ params: { name: 'nope', arguments: {} } });
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toMatch(/unknown tool/);
  });

  it('Server instance constructs with name + capabilities', () => {
    const { server } = makeServer();
    expect(server).toBeDefined();
    // The Server class doesn't expose name directly; ensure the constructor didn't throw.
  });
});
