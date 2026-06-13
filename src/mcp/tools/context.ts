/**
 * MCP tool: context.load
 */
import { z } from 'zod';
import { loadContext } from '@/lib/service/context';
import { McpTool } from './types';

const Input = z.object({
  spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  maxItems: z.number().int().min(1).max(200).optional(),
});

export const contextTools: McpTool[] = [
  {
    name: 'context.load',
    description: 'Load the most recent memories for a space, with bodies fetched from Walrus.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        maxItems: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['spaceId'],
    },
    handler: async (args: unknown) => {
      const { spaceId, maxItems = 50 } = Input.parse(args);
      const caller = requireOwner();
      return await loadContext({ spaceId, caller, maxItems });
    },
  },
];

function requireOwner(): string {
  const owner = process.env.SUI_OWNER_ADDRESS;
  if (!owner) throw new Error('SUI_OWNER_ADDRESS env var is required');
  return owner;
}
