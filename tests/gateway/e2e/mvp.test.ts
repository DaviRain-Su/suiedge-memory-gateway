/**
 * End-to-end test of the 7-step MVP flow from docs/MVP.md.
 * Walks the same path the demo script exercises, but in-process.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetConfigForTest } from '@/lib/config';
import { resetStoreForTest, openStore } from '@/lib/store';
import { resetSuiClientForTest, setSuiClient, MockSuiClient } from '@/lib/sui';
import { resetWalrusForTest, setWalrus, MemoryWalrusPublisher } from '@/lib/walrus';
import { createSpace } from '@/lib/service/spaces';
import { writeMemory } from '@/lib/service/memories';
import { loadContext } from '@/lib/service/context';
import { writeArtifact } from '@/lib/service/artifacts';
import { share, revoke } from '@/lib/service/policy';
import { writeProofLog } from '@/lib/service/proofLogs';

let path: string;
const OWNER = '0x' + 'a'.repeat(64);
const REVIEWER = '0x' + 'b'.repeat(64);

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), 'suiedge-e2e-')), 'test.db');
  process.env.DB_PATH = path;
  resetConfigForTest();
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
  setSuiClient(new MockSuiClient());
  setWalrus(new MemoryWalrusPublisher());
});

describe('MVP 7-step flow', () => {
  it('runs the full flow end to end', async () => {
    // 1) Connect wallet — implicit; we use OWNER as caller.
    // 2) Create AgentSpace
    const space = await createSpace({ owner: OWNER, name: 'sui-overflow-2026' });
    expect(space.id).toMatch(/^0x[0-9a-f]{64}$/);

    // 3) Research agent writes project context
    const ctxMem = await writeMemory({
      spaceId: space.id, caller: OWNER, kind: 'context',
      payload: 'Sui Overflow project: walrus-backed agent memory.',
    });
    expect(ctxMem.version).toBe(1);

    // 4) Builder agent loads context and writes an artifact
    const bundle = await loadContext({ spaceId: space.id, caller: OWNER });
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0].content).toContain('walrus-backed');
    const buf = Buffer.from('# Builder Plan\n').toString('base64');
    const art = await writeArtifact({
      spaceId: space.id, caller: OWNER, name: 'plan.md', mimeType: 'text/markdown', payload: buf,
    });
    expect(art.version).toBeGreaterThan(1);

    // 5) Reviewer writes a ProofLog (after owner shares)
    const policy = await share({
      spaceId: space.id, caller: OWNER, subject: REVIEWER,
      canRead: true, canWrite: true, canShare: false,
    });
    const proof = await writeProofLog({
      spaceId: space.id, caller: REVIEWER, runId: 'r1', agentId: 'reviewer',
      input: 'check plan', output: 'lgtm',
    });
    expect(proof.id).toMatch(/^0x[0-9a-f]{64}$/);

    // 6) Owner revokes reviewer access
    const after = await revoke({ spaceId: space.id, caller: OWNER, policyId: policy.id });
    expect(after.revoked).toBe(true);

    // 7) Final state — space has 1 memory + 1 artifact + 1 proof + 1 revoked policy
    const db = openStore();
    const counts = db.prepare(
      `SELECT kind, COUNT(*) AS n FROM blobs WHERE space_id = ? GROUP BY kind`,
    ).all(space.id) as Array<{ kind: number; n: number }>;
    const byKind: Record<number, number> = {};
    for (const c of counts) byKind[c.kind] = c.n;
    expect(byKind[1]).toBe(1); // memory
    expect(byKind[2]).toBe(1); // artifact
    expect(byKind[3]).toBe(1); // proof log
    const pol = db.prepare('SELECT revoked FROM policy_cache WHERE policy_id = ?').get(policy.id) as { revoked: number };
    expect(pol.revoked).toBe(1);
  });
});
