/**
 * @suiedge/ai-sdk — Vercel AI SDK adapter.
 *
 * Maps every gateway operation to a `tool()` definition that can be
 * passed straight to `generateText` / `streamText` from the `ai`
 * package. The agent framework picks the right tool based on the
 * model's intent; we sign the request using the supplied Signer.
 *
 * Usage:
 *   import { generateText } from 'ai';
 *   import { openai } from '@ai-sdk/openai';
 *   import { suiedgeTools } from '@suiedge/ai-sdk';
 *   import { SuiEdgeClient } from '@suiedge/client-sdk';
 *
 *   const client = new SuiEdgeClient({ baseUrl, signer });
 *   const tools = suiedgeTools({ client });
 *
 *   await generateText({
 *     model: openai('gpt-4o'),
 *     tools,
 *     prompt: 'Create a space named "agent-1" and write a summary about SuiEdge.',
 *   });
 */
import { z } from 'zod';
import { SuiEdgeClient } from '../../client-sdk/src/index.ts';
import type { MemoryKind } from '../../client-sdk/src/index.ts';

// `tool()` is a peer dependency on the `ai` package. We accept the
// function as a parameter to avoid hard-coding the import path
// (different `ai` versions name it the same; this stays forward-compat).
export type ToolFactory = (config: {
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (args: unknown) => Promise<unknown>;
}) => unknown;

export interface SuiedgeToolsOptions {
  client: SuiEdgeClient;
  /** Pass `tool` from the `ai` package. */
  tool: ToolFactory;
  /** Override the space the tools operate on. */
  defaultSpaceId?: string;
}

const memoryKindSchema = z.enum(['summary', 'decision', 'context', 'note']);

export function suiedgeTools(opts: SuiedgeToolsOptions) {
  const { client, tool, defaultSpaceId } = opts;
  return {
    space_create: tool({
      description: 'Create a new AgentSpace owned by the calling Sui address. Returns the new space id.',
      inputSchema: z.object({ name: z.string().min(1).max(64) }),
      execute: async (args) => {
        const { name } = args as { name: string };
        return client.createSpace(name);
      },
    }),

    space_list: tool({
      description: 'List AgentSpaces owned by the given Sui address.',
      inputSchema: z.object({ owner: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }),
      execute: async (args) => {
        const { owner } = args as { owner: string };
        return client.listSpaces(owner);
      },
    }),

    memory_write: tool({
      description: 'Write a memory to a space. Persists the body to Walrus and anchors a pointer on Sui.',
      inputSchema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        kind: memoryKindSchema,
        payload: z.string().min(1).max(1_000_000),
      }),
      execute: async (args) => {
        const { spaceId = defaultSpaceId, kind, payload } = args as { spaceId?: string; kind: MemoryKind; payload: string };
        if (!spaceId) throw new Error('spaceId is required (or set defaultSpaceId in suiedgeTools)');
        return client.writeMemory(spaceId, kind, payload);
      },
    }),

    memory_search: tool({
      description: 'Search memories in a space by substring match. Returns bodies fetched from Walrus.',
      inputSchema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        query: z.string().min(1).max(256),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      execute: async (args) => {
        const { spaceId = defaultSpaceId, query, limit = 20 } = args as { spaceId?: string; query: string; limit?: number };
        if (!spaceId) throw new Error('spaceId is required');
        return client.searchMemories(spaceId, query, limit);
      },
    }),

    context_load: tool({
      description: 'Load the most recent memories for a space, with bodies fetched from Walrus. Use this to restore agent context at the start of a session.',
      inputSchema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        maxItems: z.number().int().min(1).max(200).optional(),
      }),
      execute: async (args) => {
        const { spaceId = defaultSpaceId, maxItems = 50 } = args as { spaceId?: string; maxItems?: number };
        if (!spaceId) throw new Error('spaceId is required');
        return client.loadContext(spaceId, maxItems);
      },
    }),

    artifact_save: tool({
      description: 'Save an artifact (binary or text) to a space. Provide base64-encoded bytes.',
      inputSchema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        name: z.string().min(1).max(128),
        mimeType: z.string().min(1).max(128),
        contentBase64: z.string().min(1),
      }),
      execute: async (args) => {
        const { spaceId = defaultSpaceId, name, mimeType, contentBase64 } = args as {
          spaceId?: string; name: string; mimeType: string; contentBase64: string;
        };
        if (!spaceId) throw new Error('spaceId is required');
        const bytes = new Uint8Array(Buffer.from(contentBase64, 'base64'));
        return client.writeArtifact(spaceId, name, mimeType, bytes);
      },
    }),

    trace_log: tool({
      description: 'Log a proof entry to a space. input/output hashes go on chain, bodies on Walrus.',
      inputSchema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        runId: z.string().min(1).max(128),
        agentId: z.string().min(1).max(128),
        input: z.string().min(1).max(1_000_000),
        output: z.string().min(1).max(1_000_000),
      }),
      execute: async (args) => {
        const { spaceId = defaultSpaceId, runId, agentId, input, output } = args as {
          spaceId?: string; runId: string; agentId: string; input: string; output: string;
        };
        if (!spaceId) throw new Error('spaceId is required');
        return client.writeProofLog(spaceId, runId, agentId, input, output);
      },
    }),

    policy_share: tool({
      description: 'Share a space with another Sui address. Owner-only.',
      inputSchema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        subject: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
        canRead: z.boolean(),
        canWrite: z.boolean(),
        canShare: z.boolean(),
      }),
      execute: async (args) => {
        const { spaceId = defaultSpaceId, subject, canRead, canWrite, canShare } = args as {
          spaceId?: string; subject: string; canRead: boolean; canWrite: boolean; canShare: boolean;
        };
        if (!spaceId) throw new Error('spaceId is required');
        return client.sharePolicy(spaceId, subject, canRead, canWrite, canShare);
      },
    }),

    policy_revoke: tool({
      description: 'Revoke a previously-shared policy. Owner-only.',
      inputSchema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        policyId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      }),
      execute: async (args) => {
        const { spaceId = defaultSpaceId, policyId } = args as { spaceId?: string; policyId: string };
        if (!spaceId) throw new Error('spaceId is required');
        return client.revokePolicy(spaceId, policyId);
      },
    }),
  };
}
