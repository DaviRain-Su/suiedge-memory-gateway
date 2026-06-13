# SuiEdge Memory Gateway — SDKs

Five adapters, all built on the same `SuiEdgeClient` HTTP client.

## Layout

```
sdks/
  client-sdk/      # plain HTTP client. No AI deps. Use anywhere.
  ai-sdk/          # Vercel AI SDK adapter (9 tool() definitions)
  langchain/       # LangChain adapter (9 DynamicTool definitions)
  anthropic-sdk/   # Anthropic Claude tool use adapter
                   #   (9 tools + runAgent() helper that drives tool_use)
  openai-fc/       # OpenAI "function calling" raw JSON Schema adapter
                   #   (9 functions + runOpenAIAgent() helper)
```

All five sign the canonical `${method}\n${path}\nsha256(body)` string
with the Sui wallet, so the gateway's `verifyPersonalMessageSignature`
verifies it on every request.

The AI adapters are decoupled-DI: the `tool()` (AI SDK), `DynamicTool`
(LangChain), `anthropic: AnthropicLike` and `openai: OpenAILike` are
all passed in by the consumer. We never `import 'ai'` /
`'@langchain/core'` / `'@anthropic-ai/sdk'` / `'openai'` from the
adapter — the consumer picks their model and SDK version.

## Install (consumer)

```bash
npm install @suiedge/client-sdk
# optional, pick one or more:
npm install @suiedge/ai-sdk       ai                zod
npm install @suiedge/langchain    @langchain/core   zod
npm install @suiedge/anthropic-sdk @anthropic-ai/sdk zod
npm install @suiedge/openai-fc                          zod
```

None of the SDKs is published to npm yet; this monorepo uses pnpm
workspaces. Publish is the post-hackathon step.

## Quick start (Vercel AI SDK)

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { tool } from 'ai';
import { SuiEdgeClient } from '@suiedge/client-sdk';
import { suiedgeTools } from '@suiedge/ai-sdk';

const client = new SuiEdgeClient({
  baseUrl: process.env.SUIEDGE_BASE_URL!,
  signer: yourSuiSigner,  // see sdks/client-sdk/README.md
});

const result = await generateText({
  model: openai('gpt-4o'),
  tools: suiedgeTools({ client, tool, defaultSpaceId: spaceId }),
  prompt: 'Create a space named "agent-1" and write a summary of SuiEdge',
});
```

## Quick start (LangChain)

```ts
import { DynamicTool } from '@langchain/core/tools';
import { SuiEdgeClient } from '@suiedge/client-sdk';
import { suiedgeLangChainTools } from '@suiedge/langchain';

const client = new SuiEdgeClient({ baseUrl, signer });
const tools = suiedgeLangChainTools({ client, dynamicTool: DynamicTool, defaultSpaceId: spaceId });
// pass `tools` to your AgentExecutor
```

## Quick start (Anthropic Claude)

```ts
import Anthropic from '@anthropic-ai/sdk';
import { SuiEdgeClient } from '@suiedge/client-sdk';
import { runAgent } from '@suiedge/anthropic-sdk';

const anthropic = new Anthropic();
const client = new SuiEdgeClient({ baseUrl, signer });

const r = await runAgent({
  client,
  anthropic,
  model: 'claude-3-5-sonnet-20241022',
  prompt: 'Create a space named "agent-1" and remember "I prefer concise answers."',
  defaultSpaceId: spaceId,
  maxTurns: 6,
});
```

## Quick start (OpenAI / OpenAI-compatible)

```ts
import OpenAI from 'openai';
import { SuiEdgeClient } from '@suiedge/client-sdk';
import { runOpenAIAgent } from '@suiedge/openai-fc';

const openai = new OpenAI();
const client = new SuiEdgeClient({ baseUrl, signer });

const r = await runOpenAIAgent({
  client,
  openai,    // any object with chat.create()
  model: 'gpt-4o',
  prompt: 'Create a space named "agent-1" and remember "I prefer concise answers."',
});
```

## Quick start (raw HTTP / curl / serverless)

```ts
import { SuiEdgeClient } from '@suiedge/client-sdk';

const client = new SuiEdgeClient({ baseUrl, signer });
const space = await client.createSpace('my-agent');
await client.writeMemory(space.id, 'summary', 'first memory');
```

## Example: end-to-end agent

`examples/agent-rewrite/index.ts` runs the full loop:

1. Restore context from a space.
2. Pretend to "rewrite" a target file using a guardrail drawn from
   prior decisions in memory.
3. Write the new memory, save the file as an artifact, log the run
   as a proof entry.

Run it:

```bash
pnpm dev:live          # in one terminal
SUI_OWNER=0x... node --experimental-strip-types examples/agent-rewrite/index.ts
```

## Tests

```bash
pnpm test:sdk
```

Runs all 5 SDK test files (23 tests total) on Node 22+ with
`--experimental-strip-types`. No build step.

## Tool surface

All 5 SDKs expose the same 9 ops mapped to their framework's idioms:

| SuiEdge op | Vercel AI SDK | LangChain | Anthropic | OpenAI FC | Raw HTTP |
|---|---|---|---|---|---|
| `space_create` | `space_create` | `suiedge_space_create` | `space_create` | `space_create` | `client.createSpace()` |
| `space_list` | `space_list` | `suiedge_space_list` | `space_list` | `space_list` | `client.listSpaces()` |
| `memory_write` | `memory_write` | `suiedge_memory_write` | `memory_write` | `memory_write` | `client.writeMemory()` |
| `memory_search` | `memory_search` | `suiedge_memory_search` | `memory_search` | `memory_search` | `client.searchMemories()` |
| `context_load` | `context_load` | `suiedge_context_load` | `context_load` | `context_load` | `client.loadContext()` |
| `artifact_save` | `artifact_save` | `suiedge_artifact_save` | `artifact_save` | `artifact_save` | `client.writeArtifact()` |
| `trace_log` | `trace_log` | `suiedge_trace_log` | `trace_log` | `trace_log` | `client.writeProofLog()` |
| `policy_share` | `policy_share` | `suiedge_policy_share` | `policy_share` | `policy_share` | `client.sharePolicy()` |
| `policy_revoke` | `policy_revoke` | `suiedge_policy_revoke` | `policy_revoke` | `policy_revoke` | `client.revokePolicy()` |
