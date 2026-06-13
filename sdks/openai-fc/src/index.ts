/**
 * @suiedge/openai-fc — OpenAI "function calling" raw JSON Schema adapter.
 *
 * Use this when you don't have an OpenAI SDK in your stack but you want
 * to plug the gateway into an OpenAI-compatible HTTP endpoint
 * (OpenAI, Azure OpenAI, vLLM, llama.cpp, ollama, etc.).
 *
 * The adapter:
 *   1. Renders the 9 gateway ops as `functions: [{ name, description, parameters: JSONSchema }]`
 *      for the request payload.
 *   2. Sends the request to a user-supplied `openai: OpenAILike` or
 *      a plain `fetch` against the Chat Completions endpoint.
 *   3. Parses the response `choices[0].message.function_call` and
 *      routes it to the matching `SuiEdgeClient` method.
 *   4. Loops the conversation until the model returns a normal text
 *      message (or until `maxTurns`).
 *
 * Usage:
 *   import { SuiEdgeClient } from '@suiedge/client-sdk';
 *   import { runOpenAIAgent } from '@suiedge/openai-fc';
 *
 *   const client = new SuiEdgeClient({ baseUrl, signer });
 *
 *   await runOpenAIAgent({
 *     client,
 *     openai,
 *     model: 'gpt-4o',
 *     prompt: 'Create a space named "agent-1" and remember "I prefer concise answers."',
 *   });
 */
import { z } from 'zod';
import { SuiEdgeClient, type MemoryKind } from '../../client-sdk/src/index.ts';

/** Minimal OpenAI Chat Completions surface we use. */
export interface OpenAILike {
  chat: {
    create: (req: OpenAIRequest) => Promise<OpenAIResponse>;
  };
}

export interface OpenAIFunctionSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface OpenAIRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'function'; name?: string; content: string }>;
  functions?: OpenAIFunctionSpec[];
  function_call?: 'auto' | 'none' | { name: string };
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAIFunctionCall {
  name: string;
  /** OpenAI returns a JSON-encoded STRING here, not an object. */
  arguments: string;
}

export interface OpenAIResponse {
  choices: Array<{
    finish_reason: 'stop' | 'function_call' | 'length' | string;
    message: {
      role: 'assistant';
      content: string | null;
      function_call?: OpenAIFunctionCall;
    };
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
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
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: (schema as unknown as { options: readonly string[] }).options };
  if (schema instanceof z.ZodOptional) return zodToJsonSchema((schema as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType);
  return {};
}

const memoryKindSchema = z.enum(['summary', 'decision', 'context', 'note']);
const spaceIdShape = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const ownerShape = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const policyIdShape = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export interface ToolRegistryEntry {
  description: string;
  inputSchema: z.ZodTypeAny;
  execute: (client: SuiEdgeClient, args: unknown) => Promise<unknown>;
}

export const TOOL_REGISTRY: Record<string, ToolRegistryEntry> = {
  space_create: {
    description: 'Create a new AgentSpace owned by the calling Sui address. Returns the new space id.',
    inputSchema: z.object({ name: z.string().min(1).max(64) }),
    execute: (c, a) => c.createSpace((a as { name: string }).name),
  },
  space_list: {
    description: 'List AgentSpaces owned by the given Sui address.',
    inputSchema: z.object({ owner: ownerShape }),
    execute: (c, a) => c.listSpaces((a as { owner: string }).owner),
  },
  memory_write: {
    description: 'Write a memory to a space. Persists the body to Walrus and anchors a pointer on Sui.',
    inputSchema: z.object({ spaceId: spaceIdShape.optional(), kind: memoryKindSchema, payload: z.string().min(1).max(1_000_000) }),
    execute: async (c, a) => {
      const { spaceId, kind, payload } = a as { spaceId?: string; kind: MemoryKind; payload: string };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required (or set defaultSpaceId)');
      return c.writeMemory(sid, kind, payload);
    },
  },
  memory_search: {
    description: 'Search memories in a space by substring match. Returns bodies fetched from Walrus.',
    inputSchema: z.object({ spaceId: spaceIdShape.optional(), query: z.string().min(1).max(256), limit: z.number().int().min(1).max(200).optional() }),
    execute: async (c, a) => {
      const { spaceId, query, limit = 20 } = a as { spaceId?: string; query: string; limit?: number };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.searchMemories(sid, query, limit);
    },
  },
  context_load: {
    description: 'Load the most recent memories for a space, with bodies fetched from Walrus. Use this to restore agent context at the start of a session.',
    inputSchema: z.object({ spaceId: spaceIdShape.optional(), maxItems: z.number().int().min(1).max(200).optional() }),
    execute: async (c, a) => {
      const { spaceId, maxItems = 50 } = a as { spaceId?: string; maxItems?: number };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.loadContext(sid, maxItems);
    },
  },
  artifact_save: {
    description: 'Save an artifact (binary or text) to a space. Provide base64-encoded bytes.',
    inputSchema: z.object({ spaceId: spaceIdShape.optional(), name: z.string().min(1).max(128), mimeType: z.string().min(1).max(128), contentBase64: z.string().min(1) }),
    execute: async (c, a) => {
      const { spaceId, name, mimeType, contentBase64 } = a as { spaceId?: string; name: string; mimeType: string; contentBase64: string };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      const bytes = new Uint8Array(Buffer.from(contentBase64, 'base64'));
      return c.writeArtifact(sid, name, mimeType, bytes);
    },
  },
  trace_log: {
    description: 'Log a proof entry to a space. input/output hashes go on chain, bodies on Walrus.',
    inputSchema: z.object({ spaceId: spaceIdShape.optional(), runId: z.string().min(1).max(128), agentId: z.string().min(1).max(128), input: z.string().min(1).max(1_000_000), output: z.string().min(1).max(1_000_000) }),
    execute: async (c, a) => {
      const { spaceId, runId, agentId, input, output } = a as { spaceId?: string; runId: string; agentId: string; input: string; output: string };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.writeProofLog(sid, runId, agentId, input, output);
    },
  },
  policy_share: {
    description: 'Share a space with another Sui address. Owner-only.',
    inputSchema: z.object({ spaceId: spaceIdShape.optional(), subject: ownerShape, canRead: z.boolean(), canWrite: z.boolean(), canShare: z.boolean() }),
    execute: async (c, a) => {
      const { spaceId, subject, canRead, canWrite, canShare } = a as { spaceId?: string; subject: string; canRead: boolean; canWrite: boolean; canShare: boolean };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.sharePolicy(sid, subject, canRead, canWrite, canShare);
    },
  },
  policy_revoke: {
    description: 'Revoke a previously-shared policy. Owner-only.',
    inputSchema: z.object({ spaceId: spaceIdShape.optional(), policyId: policyIdShape }),
    execute: async (c, a) => {
      const { spaceId, policyId } = a as { spaceId?: string; policyId: string };
      const sid = spaceId ?? defaultSpaceId;
      if (!sid) throw new Error('spaceId is required');
      return c.revokePolicy(sid, policyId);
    },
  },
};

/** Convert registry to OpenAI function spec list. */
export function toOpenAIFunctions(): OpenAIFunctionSpec[] {
  return Object.entries(TOOL_REGISTRY).map(([name, entry]) => ({
    name,
    description: entry.description,
    parameters: zodToJsonSchema(entry.inputSchema),
  }));
}

let defaultSpaceId: string | undefined;

export interface RunOpenAIAgentOptions {
  client: SuiEdgeClient;
  openai: OpenAILike;
  model: string;
  prompt: string;
  system?: string;
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  defaultSpaceId?: string;
}

export interface RunOpenAIAgentResult {
  finishReason: string;
  finalText: string;
  toolCalls: Array<{ name: string; input: unknown; output: unknown; rawArguments: string }>;
  turns: number;
}

export async function runOpenAIAgent(opts: RunOpenAIAgentOptions): Promise<RunOpenAIAgentResult> {
  defaultSpaceId = opts.defaultSpaceId;
  try {
    const maxTurns = opts.maxTurns ?? 6;
    const messages: OpenAIRequest['messages'] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: opts.prompt });
    const functions = toOpenAIFunctions();
    const toolCalls: RunOpenAIAgentResult['toolCalls'] = [];
    let finalText = '';
    let finishReason = 'stop';

    for (let turn = 0; turn < maxTurns; turn++) {
      const resp = await opts.openai.chat.create({
        model: opts.model,
        messages,
        functions,
        function_call: 'auto',
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.2,
      });
      const choice = resp.choices[0];
      if (!choice) return { finishReason: 'no_choices', finalText, toolCalls, turns: turn + 1 };
      finishReason = choice.finish_reason;
      const fc = choice.message.function_call;
      const text = choice.message.content ?? '';
      if (text) finalText = text;
      if (!fc) {
        return { finishReason, finalText, toolCalls, turns: turn + 1 };
      }
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(fc.arguments);
      } catch {
        toolCalls.push({ name: fc.name, input: null, output: null, rawArguments: fc.arguments });
        messages.push({ role: 'function', name: fc.name, content: 'invalid JSON in arguments' });
        continue;
      }
      const entry = TOOL_REGISTRY[fc.name];
      if (!entry) {
        toolCalls.push({ name: fc.name, input: parsedArgs, output: null, rawArguments: fc.arguments });
        messages.push({ role: 'function', name: fc.name, content: `unknown function: ${fc.name}` });
        continue;
      }
      let output: unknown;
      let resultText: string;
      try {
        const parsed = entry.inputSchema.safeParse(parsedArgs);
        if (!parsed.success) throw new Error('input validation: ' + parsed.error.message);
        output = await entry.execute(opts.client, parsed.data);
        resultText = JSON.stringify(output);
      } catch (err) {
        resultText = err instanceof Error ? err.message : String(err);
        output = null;
      }
      toolCalls.push({ name: fc.name, input: parsedArgs, output, rawArguments: fc.arguments });
      messages.push({ role: 'function', name: fc.name, content: resultText });
    }
    return { finishReason, finalText, toolCalls, turns: maxTurns };
  } finally {
    defaultSpaceId = undefined;
  }
}
