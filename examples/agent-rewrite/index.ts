/**
 * Example agent: rewriter-with-memory.
 *
 * Uses @suiedge/client-sdk + a hand-rolled "agent" loop (we don't
 * pull the `ai` package into the repo to keep deps small) to show
 * the full flow:
 *
 *   1. Restore context from a space.
 *   2. Rewrite a target file with a guardrail drawn from prior
 *      decisions in memory.
 *   3. Write the new memory describing what was done.
 *   4. Save the new file as an artifact.
 *   5. Log the run as a proof entry.
 *
 * Run it:
 *   SUI_OWNER=0x... node --experimental-strip-types examples/agent-rewrite/index.ts
 *
 * It expects a running dev server at $SUIEDGE_BASE_URL (default
 * http://localhost:3000) and either AUTH_STUB_PASS=1 (for demos)
 * or a SuiPrivateKey in the env so the gateway can sign PTBs.
 */
import { SuiEdgeClient, SuiEdgeError } from '../../sdks/client-sdk/src/index.ts';
import { createHash } from 'node:crypto';

const BASE = process.env.SUIEDGE_BASE_URL ?? 'http://localhost:3000';

// The "signer" is the dev-wallet shortcut. Replace with a real Sui
// wallet signer (see sdks/client-sdk/README.md) for production.
const signer = {
  address: required('SUI_OWNER'),
  sign: async (_challenge: string) => 'stub',
};

const client = new SuiEdgeClient({ baseUrl: BASE, signer });

async function main() {
  // 1. Create a new space, or reuse the most recent one.
  const existing = await client.listSpaces(signer.address);
  let spaceId: string;
  if (existing.length > 0) {
    spaceId = existing[0]!.id;
    console.log(`reusing space ${spaceId}`);
  } else {
    const created = await client.createSpace('agent-rewrite');
    spaceId = created.id;
    console.log(`created space ${spaceId}`);
  }

  // 2. Restore context — pull the most recent memories.
  const ctx = await client.loadContext(spaceId, 10);
  const priorDecisions = ctx.memories
    .filter((m) => m.kind === 'decision')
    .map((m) => m.payload)
    .join('\n');
  console.log(`restored ${ctx.memories.length} memories, ${priorDecisions.length} chars of prior decisions`);

  // 3. "Rewrite" a target file. In a real agent this is an LLM call.
  //    For the example, we pretend the agent produced a result.
  const targetFile = 'README.md';
  const newBody = `# ${targetFile}\n\nrewritten by agent-rewrite at ${new Date().toISOString()}\n\nGuardrails from memory:\n${priorDecisions || '(none)'}\n`;
  const fileHash = createHash('sha256').update(newBody).digest('hex');

  // 4. Write the new memory describing the rewrite.
  await client.writeMemory(spaceId, 'context', `rewrote ${targetFile}, sha256=${fileHash}`);

  // 5. Save the file as an artifact.
  const bytes = new TextEncoder().encode(newBody);
  await client.writeArtifact(spaceId, targetFile, 'text/markdown', bytes);

  // 6. Log the run as a proof entry.
  const runId = `run-${Date.now()}`;
  await client.writeProofLog(
    spaceId,
    runId,
    'agent-rewrite',
    JSON.stringify({ action: 'rewrite', targetFile }),
    JSON.stringify({ newBodyLen: newBody.length, fileHash }),
  );

  console.log(`done. runId=${runId} fileHash=${fileHash}`);
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`set ${name} in env`);
  return v;
}

main().catch((err) => {
  if (err instanceof SuiEdgeError) {
    console.error(`SuiEdge ${err.status}: ${err.message}`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
