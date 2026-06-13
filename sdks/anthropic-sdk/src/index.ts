/**
 * @suiedge/anthropic-sdk — Anthropic Claude tool use adapter.
 *
 * Maps every gateway operation to a Claude `tool` definition (name +
 * description + input_schema as JSON Schema) and provides a helper
 * that drives `client.messages.create` with the gateway tools and
 * loops on `tool_use` blocks, executing the corresponding client
 * method and feeding the `tool_result` back to the model.
 *
 * The Anthropic client is passed in by the consumer — we never
 * `import '@anthropic-ai/sdk'` ourselves. This keeps the adapter
 * zero-dep at install time (and tests run without a real key).
 *
 * Usage:
 *   import Anthropic from '@anthropic-ai/sdk';
 *   import { SuiEdgeClient } from '@suiedge/client-sdk';
 *   import { runAgent } from '@suiedge/anthropic-sdk';
 *
 *   const anthropic = new Anthropic();                  // peer dep
 *   const client = new SuiEdgeClient({ baseUrl, signer });
 *
 *   await runAgent({
 *     client,
 *     anthropic,
 *     model: 'claude-3-5-sonnet-20241022',
 *     prompt: 'Create a space named "agent-1" and remember "I prefer concise answers."',
 *     maxTurns: 4,
 *   });
 */
import { z } from 'zod';
import { SuiEdgeClient, type MemoryKind } from '../../client-sdk/src/index.ts';

/** Minimal shape of the Anthropic client surface we use. */
export interface AnthropicLike {
  messages: {
    create: (req: AnthropicRequest) => Promise<AnthropicResponse>;
  };
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  tools?: AnthropicTool[];
  messages: AnthropicMessage[];
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type AnthropicMessage =
  | { role: 'user'; content: string | AnthropicContentBlock[] }
  | { role: 'assistant'; content: AnthropicContentBlock[] }
  | { role: 'user'; content: Array<{ type: 'tool_result'; tool_use_id: string; content: string | AnthropicContentBlock[]; is_error?: boolean }> };

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

export interface AnthropicResponse {
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
  content: AnthropicContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
}

// ---- Tool registry (decoupled DI: tool name -> execute)

export interface ToolRegistryEntry {
  description: string;
  /** Zod schema describing the input. */
  inputSchema: z.ZodTypeAny;
  /** Validated args -> client call. */
  execute: (client: SuiEdgeClient, args: unknown) => Promise<unknown>;
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Zod v3 / v4 have a stable `.shape` getter on ZodObject.
  if (schema instanceof z.ZodObject) {
    const shape = (schema as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = zodToJsonSchema(v);
      if (!(v instanceof z.ZodOptional)) required.push(k);
    }
    const out: Record<string, unknown> = { type: 'object', properties };
    if (required.length) out.required = required;
    return out;
  }
  if (schema instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: 'string' };
    const min = (schema._def as { minLength?: { value: number } }).minLength;
    const max = (schema._def as { maxLength?: { value: number } }).maxLength;
    if (min && min.value) out.minLength = min.value;
    if (max && max.value) out.maxLength = max.value;
    return out;
  }
  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: (schema as unknown as { options: readonly string[] }).options };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema((schema as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType);
  }
  return {};
}

const memoryKindSchema = z.enum(['summary', 'decision', 'context', 'note']);

const spaceIdShape = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const ownerShape = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const policyIdShape = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

/** Tool registry shared by `toAnthropicTools` and `runAgent`. */
export const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  space_create: {
    description: 'Create a new AgentSpace owned by the calling Sui address. Returns the new space id.',
    inputSchema: z.object({ name: z.string().min(1).max(64) }),
    execute: (c, a) => {
      const { name } = a as { name: string };
      return c.createSpace(name);
    },
  },
  space_list: {
    description: 'List AgentSpaces owned by the given Sui address.',
    inputSchema: z.object({ owner: ownerShape }),
    execute: (c, a) => {
      const { owner } = a as { owner: string };
      return c.listSpaces(owner);
    },
  },
  memory_write: {
    description: 'Write a memory to a space. Persists the body to Walrus and anchors a pointer on Sui.',
    inputSchema: z.object({
      spaceId: spaceIdShape.optional(),
      kind: memoryKindSchema,
      payload: z.string().min(1).max(1_000_000),
    }),
    execute: async (c, a) => {
      const { spaceId, kind, payload } = a as { spaceId?: string; kind: MemoryKind; payload: string };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required (or set defaultSpaceId)');
      return c.writeMemory(sid, kind, payload);
    },
  },
  memory_search: {
    description: 'Search memories in a space by substring match. Returns bodies fetched from Walrus.',
    inputSchema: z.object({
      spaceId: spaceIdShape.optional(),
      query: z.string().min(1).max(256),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    execute: async (c, a) => {
      const { spaceId, query, limit = 20 } = a as { spaceId?: string; query: string; limit?: number };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.searchMemories(sid, query, limit);
    },
  },
  context_load: {
    description: 'Load the most recent memories for a space, with bodies fetched from Walrus. Use this to restore agent context at the start of a session.',
    inputSchema: z.object({
      spaceId: spaceIdShape.optional(),
      maxItems: z.number().int().min(1).max(200).optional(),
    }),
    execute: async (c, a) => {
      const { spaceId, maxItems = 50 } = a as { spaceId?: string; maxItems?: number };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.loadContext(sid, maxItems);
    },
  },
  artifact_save: {
    description: 'Save an artifact (binary or text) to a space. Provide base64-encoded bytes.',
    inputSchema: z.object({
      spaceId: spaceIdShape.optional(),
      name: z.string().min(1).max(128),
      mimeType: z.string().min(1).max(128),
      contentBase64: z.string().min(1),
    }),
    execute: async (c, a) => {
      const { spaceId, name, mimeType, contentBase64 } = a as {
        spaceId?: string; name: string; mimeType: string; contentBase64: string;
      };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      const bytes = new Uint8Array(Buffer.from(contentBase64, 'base64'));
      return c.writeArtifact(sid, name, mimeType, bytes);
    },
  },
  trace_log: {
    description: 'Log a proof entry to a space. input/output hashes go on chain, bodies on Walrus.',
    inputSchema: z.object({
      spaceId: spaceIdShape.optional(),
      runId: z.string().min(1).max(128),
      agentId: z.string().min(1).max(128),
      input: z.string().min(1).max(1_000_000),
      output: z.string().min(1).max(1_000_000),
    }),
    execute: async (c, a) => {
      const { spaceId, runId, agentId, input, output } = a as {
        spaceId?: string; runId: string; agentId: string; input: string; output: string;
      };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.writeProofLog(sid, runId, agentId, input, output);
    },
  },
  policy_share: {
    description: 'Share a space with another Sui address. Owner-only.',
    inputSchema: z.object({
      spaceId: spaceIdShape.optional(),
      subject: ownerShape,
      canRead: z.boolean(),
      canWrite: z.boolean(),
      canShare: z.boolean(),
    }),
    execute: async (c, a) => {
      const { spaceId, subject, canRead, canWrite, canShare } = a as {
        spaceId?: string; subject: string; canRead: boolean; canWrite: boolean; canShare: boolean;
      };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.sharePolicy(sid, subject, canRead, canWrite, canShare);
    },
  },
  policy_revoke: {
    description: 'Revoke a previously-shared policy. Owner-only.',
    inputSchema: z.object({
      spaceId: spaceIdShape.optional(),
      policyId: policyIdShape,
    }),
    execute: async (c, a) => {
      const { spaceId, policyId } = a as { spaceId?: string; policyId: string };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.revokePolicy(sid, policyId);
    },
  },
};

/** Mutable default (set per-run by `runAgent`). */
let defaultSpaceId: string | undefined;

/** Convert the registry to Anthropic tool defs (for `client.messages.create`). */
export function toAnthropicTools(): AnthropicTool[] {
  return Object.entries(TOOL_REGISTRY).map(([name, entry]) => ({
    name,
    description: entry.description,
    input_schema: zodToJsonSchema(entry.inputSchema),
  }));
}

export interface RunAgentOptions {
  client: SuiEdgeClient;
  anthropic: AnthropicLike;
  model: string;
  prompt: string;
  system?: string;
  maxTurns?: number;
  maxTokens?: number;
  defaultSpaceId?: string;
}

export interface RunAgentResult {
  stopReason: string;
  finalText: string;
  toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
  turns: number;
}

/** Drive the Claude client with the gateway tools, looping on tool_use. */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  defaultSpaceId = opts.defaultSpaceId;
  try {
    const maxTurns = opts.maxTurns ?? 6;
    const maxTokens = opts.maxTokens ?? 1024;
    const tools = toAnthropicTools();
    const messages: AnthropicMessage[] = [{ role: 'user', content: opts.prompt }];
    const toolCalls: RunAgentResult['toolCalls'] = [];
    let finalText = '';
    let stopReason = 'end_turn';

    for (let turn = 0; turn < maxTurns; turn++) {
      const resp = await opts.anthropic.messages.create({
        model: opts.model,
        max_tokens: maxTokens,
        system: opts.system,
        tools,
        messages,
      });
      stopReason = resp.stop_reason;

      const toolUseBlocks = resp.content.filter((b) => b.type === 'tool_use') as Array<Extract<AnthropicContentBlock, { type: 'tool_use' }>>;
      const textBlocks = resp.content.filter((b) => b.type === 'text') as Array<Extract<AnthropicContentBlock, { type: 'text' }>>;
      if (textBlocks.length) {
        finalText = textBlocks.map((b) => b.text).join('\n');
      }
      if (resp.stop_reason === 'end_turn' || resp.stop_reason === 'max_tokens' || toolUseBlocks.length === 0) {
        return { stopReason, finalText, toolCalls, turns: turn + 1 };
      }
      messages.push({ role: 'assistant', content: resp.content });

      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }> = [];
      for (const block of toolUseBlocks) {
        const entry = TOOL_REGISTRY[block.name];
        if (!entry) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `unknown tool: ${block.name}`, is_error: true });
          continue;
        }
        let output: unknown;
        try {
          const parsed = entry.inputSchema.safeParse(block.input);
          if (!parsed.success) throw new Error('input validation: ' + parsed.error.message);
          output = await entry.execute(opts.client, parsed.data);
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: err instanceof Error ? err.message : String(err), is_error: true });
          toolCalls.push({ name: block.name, input: block.input, output: null });
          continue;
        }
        toolCalls.push({ name: block.name, input: block.input, output });
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
      }
      messages.push({ role: 'user', content: toolResults });
    }
    return { stopReason, finalText, toolCalls, turns: maxTurns };
  } finally {
    defaultSpaceId = undefined;
  }
}
