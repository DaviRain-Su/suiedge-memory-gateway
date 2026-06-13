#!/usr/bin/env node
/**
 * SuiEdge Memory Gateway — MCP server (Streamable HTTP transport).
 *
 * Usage:
 *   pnpm mcp:http           # listens on http://0.0.0.0:7000/mcp
 *   PORT=8080 pnpm mcp:http
 *
 * Endpoints:
 *   POST /mcp   — JSON-RPC 2.0 (initialize / tools/list / tools/call)
 *   GET  /mcp   — SSE stream for server-initiated events
 *   DELETE /mcp — session teardown
 *   GET  /healthz — liveness
 *
 * Stateless transport (one per request) so any HTTP client can hit
 * it without prior `initialize` ceremony. The gateway's
 * requireAuth header checks (X-Sui-Address / X-Sui-Signature) are
 * NOT enforced here — the MCP server is a trusted sidecar that
 * uses SUI_OWNER_ADDRESS directly.
 */
import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toolDefinitions } from './tools/index';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const port = Number(process.env.PORT ?? 7000);
const host = process.env.HOST ?? '0.0.0.0';

function makeServer() {
  const server = new Server(
    { name: 'suiedge-memory-gateway', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
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
  });
  return server;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end('no url');
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: 'suiedge-mcp', transport: 'streamable-http' }));
    return;
  }

  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found', pathname: url.pathname }));
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const server = makeServer();
  await server.connect(transport);
  await transport.handleRequest(req, res);
  await transport.close();
});

httpServer.listen(port, host, () => {
  console.error(`suiedge MCP (streamable-http) listening on http://${host}:${port}/mcp`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.error(`\nsuiedge MCP shutting down (${sig})`);
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000).unref();
  });
}
