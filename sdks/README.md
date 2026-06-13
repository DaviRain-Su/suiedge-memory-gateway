# SuiEdge Memory Gateway — SDKs

Three adapters, all built on the same `SuiEdgeClient` HTTP client.

## Layout

```
sdks/
  client-sdk/   # plain HTTP client. No AI deps. Use anywhere.
  ai-sdk/       # Vercel AI SDK adapter (9 tool() definitions)
  langchain/    # LangChain adapter (9 DynamicTool definitions)
```

All three sign the canonical `${method}\n${path}\nsha256(body)` string
with the Sui wallet, so the gateway's `verifyPersonalMessageSignature`
verifies it on every request.

## Install (consumer)

```bash
npm install @suiedge/client-sdk
# optional:
npm install @suiedge/ai-sdk ai zod
npm install @suiedge/langchain @langchain/core zod
```

The `@suiedge/ai-sdk` and `@suiedge/langchain` packages are not yet
published to npm; for now `pnpm` workspaces into this monorepo. The
gate is to publish after the hackathon.

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

## Quick start (raw HTTP)

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
cd sdks/client-sdk && node --experimental-strip-types --test tests/*.test.ts
cd sdks/ai-sdk      && node --experimental-strip-types --test tests/*.test.ts
cd sdks/langchain   && node --experimental-strip-types --test tests/*.test.ts
```

All three run on Node 22+ with no build step (`--experimental-strip-types`).
