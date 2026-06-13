/**
 * MCP tool: memory.write, memory.search
 */
import { z } from 'zod';
import { writeMemory, listMemories } from '@/lib/service/memories';
import { getWalrus } from '@/lib/walrus';
import { McpTool } from './types';

const WriteInput = z.object({
  spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  kind: z.enum(['summary', 'decision', 'context', 'note']),
  payload: z.string().min(1).max(1_000_000),
});
const SearchInput = z.object({
  spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  query: z.string().min(1).max(256),
  limit: z.number().int().min(1).max(200).optional(),
});

export const memoryTools: McpTool[] = [
  {
    name: 'memory.write',
    description: 'Write a memory to a space. Returns the MemoryRecord with on-chain pointer id and Walrus blob id.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        kind: { type: 'string', enum: ['summary', 'decision', 'context', 'note'] },
        payload: { type: 'string' },
      },
      required: ['spaceId', 'kind', 'payload'],
    },
    handler: async (args: unknown) => {
      const { spaceId, kind, payload } = WriteInput.parse(args);
      const caller = requireOwner();
      return await writeMemory({ spaceId, caller, kind, payload });
    },
  },
  {
    name: 'memory.search',
    description: 'Search memories by substring match on the body fetched from Walrus.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      required: ['spaceId', 'query'],
    },
    handler: async (args: unknown) => {
      const { spaceId, query, limit = 50 } = SearchInput.parse(args);
      const caller = requireOwner();
      const candidates = listMemories({ spaceId, caller, limit: 200 });
      const walrus = getWalrus();
      const lc = query.toLowerCase();
      const matches: Array<{ id: string; version: number; content: string }> = [];
      for (const c of candidates) {
        let body = '';
        try {
          const buf = await walrus.get({ blobId: c.walrusBlobId });
          body = buf.toString('utf8');
        } catch {
          continue;
        }
        if (body.toLowerCase().includes(lc)) {
          matches.push({ id: c.id, version: c.version, content: body });
          if (matches.length >= limit) break;
        }
      }
      return matches;
    },
  },
];

function requireOwner(): string {
  const owner = process.env.SUI_OWNER_ADDRESS;
  if (!owner) throw new Error('SUI_OWNER_ADDRESS env var is required');
  return owner;
}
