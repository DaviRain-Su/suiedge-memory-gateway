/**
 * @suiedge/langchain — LangChain adapter.
 *
 * Returns an array of `DynamicTool` definitions that can be passed
 * straight to a LangChain `AgentExecutor`. Each tool wraps a single
 * gateway operation. We don't take a hard dependency on `langchain`
 * itself — the consumer passes in `DynamicTool` from `@langchain/core`
 * so we stay forward-compat across renames.
 *
 * Usage:
 *   import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
 *   import { ChatPromptTemplate } from '@langchain/core/prompts';
 *   import { DynamicTool } from '@langchain/core/tools';
 *   import { ChatOpenAI } from '@langchain/openai';
 *   import { SuiEdgeClient } from '@suiedge/client-sdk';
 *   import { suiedgeLangChainTools } from '@suiedge/langchain';
 *
 *   const client = new SuiEdgeClient({ baseUrl, signer });
 *   const tools = suiedgeLangChainTools({ client, dynamicTool: DynamicTool });
 *
 *   const agent = await createOpenAIFunctionsAgent({ llm, tools, prompt });
 *   const executor = new AgentExecutor({ agent, tools });
 *   const res = await executor.invoke({ input: 'Create a space named agent-1' });
 */
import { z } from 'zod';
import { SuiEdgeClient } from '../../client-sdk/src/index.ts';
import type { MemoryKind } from '../../client-sdk/src/index.ts';

export type DynamicToolFactory = (config: {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  func: (input: unknown) => Promise<unknown>;
}) => unknown;

export interface SuiedgeLangChainToolsOptions {
  client: SuiEdgeClient;
  /** Pass `DynamicTool` from `@langchain/core/tools`. */
  dynamicTool: DynamicToolFactory;
  defaultSpaceId?: string;
}

const memoryKindSchema = z.enum(['summary', 'decision', 'context', 'note']);

export function suiedgeLangChainTools(opts: SuiedgeLangChainToolsOptions): unknown[] {
  const { client, dynamicTool, defaultSpaceId } = opts;
  const resolveSpace = (input: { spaceId?: string }) => {
    const id = input.spaceId ?? defaultSpaceId;
    if (!id) throw new Error('spaceId is required (or set defaultSpaceId)');
    return id;
  };
  return [
    dynamicTool({
      name: 'space_create',
      description: 'Create a new AgentSpace owned by the calling Sui address. Returns the new space id.',
      schema: z.object({ name: z.string().min(1).max(64) }),
      func: async (input) => client.createSpace((input as { name: string }).name),
    }),
    dynamicTool({
      name: 'space_list',
      description: 'List AgentSpaces owned by the given Sui address.',
      schema: z.object({ owner: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }),
      func: async (input) => client.listSpaces((input as { owner: string }).owner),
    }),
    dynamicTool({
      name: 'memory_write',
      description: 'Write a memory to a space. Persists the body to Walrus and anchors a pointer on Sui.',
      schema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        kind: memoryKindSchema,
        payload: z.string().min(1).max(1_000_000),
      }),
      func: async (input) => {
        const { spaceId, kind, payload } = input as { spaceId?: string; kind: MemoryKind; payload: string };
        return client.writeMemory(resolveSpace({ spaceId }), kind, payload);
      },
    }),
    dynamicTool({
      name: 'memory_search',
      description: 'Search memories in a space by substring match. Returns bodies fetched from Walrus.',
      schema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        query: z.string().min(1).max(256),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      func: async (input) => {
        const { spaceId, query, limit = 20 } = input as { spaceId?: string; query: string; limit?: number };
        return client.searchMemories(resolveSpace({ spaceId }), query, limit);
      },
    }),
    dynamicTool({
      name: 'context_load',
      description: 'Load the most recent memories for a space, with bodies fetched from Walrus.',
      schema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        maxItems: z.number().int().min(1).max(200).optional(),
      }),
      func: async (input) => {
        const { spaceId, maxItems = 50 } = input as { spaceId?: string; maxItems?: number };
        return client.loadContext(resolveSpace({ spaceId }), maxItems);
      },
    }),
    dynamicTool({
      name: 'artifact_save',
      description: 'Save an artifact to a space. contentBase64 must be base64-encoded bytes.',
      schema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        name: z.string().min(1).max(128),
        mimeType: z.string().min(1).max(128),
        contentBase64: z.string().min(1),
      }),
      func: async (input) => {
        const { spaceId, name, mimeType, contentBase64 } = input as {
          spaceId?: string; name: string; mimeType: string; contentBase64: string;
        };
        const bytes = new Uint8Array(Buffer.from(contentBase64, 'base64'));
        return client.writeArtifact(resolveSpace({ spaceId }), name, mimeType, bytes);
      },
    }),
    dynamicTool({
      name: 'trace_log',
      description: 'Log a proof entry to a space. input/output hashes go on chain, bodies on Walrus.',
      schema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        runId: z.string().min(1).max(128),
        agentId: z.string().min(1).max(128),
        input: z.string().min(1).max(1_000_000),
        output: z.string().min(1).max(1_000_000),
      }),
      func: async (input) => {
        const { spaceId, runId, agentId, input: inStr, output: outStr } = input as {
          spaceId?: string; runId: string; agentId: string; input: string; output: string;
        };
        return client.writeProofLog(resolveSpace({ spaceId }), runId, agentId, inStr, outStr);
      },
    }),
    dynamicTool({
      name: 'policy_share',
      description: 'Share a space with another Sui address. Owner-only.',
      schema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        subject: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
        canRead: z.boolean(),
        canWrite: z.boolean(),
        canShare: z.boolean(),
      }),
      func: async (input) => {
        const { spaceId, subject, canRead, canWrite, canShare } = input as {
          spaceId?: string; subject: string; canRead: boolean; canWrite: boolean; canShare: boolean;
        };
        return client.sharePolicy(resolveSpace({ spaceId }), subject, canRead, canWrite, canShare);
      },
    }),
    dynamicTool({
      name: 'policy_revoke',
      description: 'Revoke a previously-shared policy. Owner-only.',
      schema: z.object({
        spaceId: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
        policyId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      }),
      func: async (input) => {
        const { spaceId, policyId } = input as { spaceId?: string; policyId: string };
        return client.revokePolicy(resolveSpace({ spaceId }), policyId);
      },
    }),
  ];
}
