/**
 * MCP tool: artifact.save
 */
import { z } from 'zod';
import { writeArtifact } from '@/lib/service/artifacts';
import { McpTool } from './types';

const Input = z.object({
  spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  name: z.string().min(1).max(128),
  mimeType: z.string().min(1).max(128),
  payload: z.string().min(1).max(10_000_000), // base64
});

export const artifactTools: McpTool[] = [
  {
    name: 'artifact.save',
    description: 'Save an artifact (binary or text) to a space. Payload is base64-encoded.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        name: { type: 'string' },
        mimeType: { type: 'string' },
        payload: { type: 'string', description: 'base64-encoded bytes' },
      },
      required: ['spaceId', 'name', 'mimeType', 'payload'],
    },
    handler: async (args: unknown) => {
      const { spaceId, name, mimeType, payload } = Input.parse(args);
      const caller = requireOwner();
      return await writeArtifact({ spaceId, caller, name, mimeType, payload });
    },
  },
];

function requireOwner(): string {
  const owner = process.env.SUI_OWNER_ADDRESS;
  if (!owner) throw new Error('SUI_OWNER_ADDRESS env var is required');
  return owner;
}
