#!/usr/bin/env node
/**
 * SuiEdge Memory Gateway — MCP server.
 * Stdio transport. Spawn one server per agent.
 *
 * Usage:
 *   SUI_OWNER_ADDRESS=0x... pnpm run mcp
 *
 * The server is read by MCP-aware clients (e.g. Claude Desktop) via
 * stdio. It exposes 9 tools that map 1:1 onto the gateway's REST
 * surface, but bypasses the X-Sui-Address / X-Sui-Signature auth
 * headers (the dev-wallet signer Day 6 wires uses SUI_OWNER_ADDRESS
 * directly as the calling identity).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types';
import { toolDefinitions } from './tools/index';

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
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('suiedge MCP server started');
