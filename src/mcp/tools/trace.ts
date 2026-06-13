/**
 * MCP tool: trace.log
 */
import { z } from 'zod';
import { writeProofLog } from '@/lib/service/proofLogs';
import { McpTool } from './types';

const Input = z.object({
  spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  runId: z.string().min(1).max(128),
  agentId: z.string().min(1).max(128),
  input: z.string().min(1).max(1_000_000),
  output: z.string().min(1).max(1_000_000),
});

export const traceTools: McpTool[] = [
  {
    name: 'trace.log',
    description: 'Log a proof entry to a space (input/output hashes go on chain; bodies on Walrus).',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        runId: { type: 'string' },
        agentId: { type: 'string' },
        input: { type: 'string' },
        output: { type: 'string' },
      },
      required: ['spaceId', 'runId', 'agentId', 'input', 'output'],
    },
    handler: async (args: unknown) => {
      const { spaceId, runId, agentId, input, output } = Input.parse(args);
      const caller = requireOwner();
      return await writeProofLog({ spaceId, caller, runId, agentId, input, output });
    },
  },
];

function requireOwner(): string {
  const owner = process.env.SUI_OWNER_ADDRESS;
  if (!owner) throw new Error('SUI_OWNER_ADDRESS env var is required');
  return owner;
}
