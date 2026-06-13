/**
 * MCP tool interface. The Server wires toolDefinitions from each
 * tools/*.ts file.
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}
