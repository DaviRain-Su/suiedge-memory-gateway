/**
 * MCP tool: space.create, space.list
 */
import { z } from 'zod';
import { createSpace, listSpaces } from '@/lib/service/spaces';
import { McpTool } from './types';

const CreateInput = z.object({ name: z.string().min(1).max(64) });
const ListInput = z.object({ owner: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

export const spaceTools: McpTool[] = [
  {
    name: 'space.create',
    description: 'Create a new AgentSpace owned by the calling Sui address.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 64 } },
      required: ['name'],
    },
    handler: async (args: unknown) => {
      const { name } = CreateInput.parse(args);
      const owner = process.env.SUI_OWNER_ADDRESS;
      if (!owner) {
        throw new Error('SUI_OWNER_ADDRESS env var is required to call space.create');
      }
      return await createSpace({ owner, name });
    },
  },
  {
    name: 'space.list',
    description: 'List AgentSpaces owned by the given Sui address.',
    inputSchema: {
      type: 'object',
      properties: { owner: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' } },
      required: ['owner'],
    },
    handler: async (args: unknown) => {
      const { owner } = ListInput.parse(args);
      return listSpaces({ owner });
    },
  },
];
