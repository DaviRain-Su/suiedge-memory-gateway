/**
 * MCP tools: policy.share, policy.revoke
 */
import { z } from 'zod';
import { share, revoke } from '@/lib/service/policy';
import { McpTool } from './types';

const ShareInput = z.object({
  spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  subject: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canShare: z.boolean(),
});
const RevokeInput = z.object({
  policyId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export const policyTools: McpTool[] = [
  {
    name: 'policy.share',
    description: 'Share a space with another Sui address. Owner-only.',
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string' },
        subject: { type: 'string' },
        canRead: { type: 'boolean' },
        canWrite: { type: 'boolean' },
        canShare: { type: 'boolean' },
      },
      required: ['spaceId', 'subject', 'canRead', 'canWrite', 'canShare'],
    },
    handler: async (args: unknown) => {
      const { spaceId, subject, canRead, canWrite, canShare } = ShareInput.parse(args);
      const caller = requireOwner();
      return await share({ spaceId, caller, subject, canRead, canWrite, canShare });
    },
  },
  {
    name: 'policy.revoke',
    description: 'Revoke a previously-shared policy. Owner-only.',
    inputSchema: {
      type: 'object',
      properties: { policyId: { type: 'string' } },
      required: ['policyId'],
    },
    handler: async (args: unknown, ctx?: { spaceId?: string }) => {
      const { policyId } = RevokeInput.parse(args);
      const caller = requireOwner();
      // The MCP tool needs the spaceId; the policy record knows the subject
      // and from there the space_id is derivable. For simplicity we accept
      // a spaceId as a second argument via _meta in production; here we
      // look it up from the policy_cache.
      const db = (await import('@/lib/store')).openStore();
      const row = db.prepare('SELECT space_id FROM policy_cache WHERE policy_id = ?').get(policyId) as { space_id: string } | undefined;
      if (!row) throw new Error(`policy ${policyId} not found`);
      return await revoke({ spaceId: row.space_id, caller, policyId });
    },
  },
];

function requireOwner(): string {
  const owner = process.env.SUI_OWNER_ADDRESS;
  if (!owner) throw new Error('SUI_OWNER_ADDRESS env var is required');
  return owner;
}
