/**
 * Service test: writeArtifact + listArtifact + writeProofLog + listProofLogs.
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
import { share } from '@/lib/service/policy';
import { writeArtifact, listArtifacts } from '@/lib/service/artifacts';
import { writeProofLog, listProofLogs } from '@/lib/service/proofLogs';

let path: string;
const OWNER = '0x' + 'a'.repeat(64);
const REVIEWER = '0x' + 'b'.repeat(64);

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), 'suiedge-art-')), 'test.db');
  process.env.DB_PATH = path;
  resetConfigForTest();
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
  setSuiClient(new MockSuiClient());
  setWalrus(new MemoryWalrusPublisher());
});

describe('writeArtifact', () => {
  it('owner writes an artifact and it shows up in the list', async () => {
    const space = await createSpace({ owner: OWNER, name: 'demo' });
    const buf = Buffer.from('hello artifact').toString('base64');
    const rec = await writeArtifact({
      spaceId: space.id,
      caller: OWNER,
      name: 'plan.md',
      mimeType: 'text/markdown',
      payload: buf,
    });
    expect(rec.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(rec.name).toBe('plan.md');
    const list = listArtifacts({ spaceId: space.id, caller: OWNER });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(rec.id);
  });

  it('non-owner without write policy is FORBIDDEN', async () => {
    const space = await createSpace({ owner: OWNER, name: 'demo' });
    const buf = Buffer.from('x').toString('base64');
    await expect(
      writeArtifact({ spaceId: space.id, caller: REVIEWER, name: 'x', mimeType: 'text/plain', payload: buf }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('non-owner WITH write policy can write', async () => {
    const space = await createSpace({ owner: OWNER, name: 'demo' });
    await share({
      spaceId: space.id, caller: OWNER, subject: REVIEWER,
      canRead: true, canWrite: true, canShare: false,
    });
    const buf = Buffer.from('reviewer writes').toString('base64');
    const rec = await writeArtifact({
      spaceId: space.id, caller: REVIEWER, name: 'review.md',
      mimeType: 'text/markdown', payload: buf,
    });
    expect(rec.name).toBe('review.md');
  });
});

describe('writeProofLog', () => {
  it('owner writes a proof log and it shows up in the list', async () => {
    const space = await createSpace({ owner: OWNER, name: 'demo' });
    const rec = await writeProofLog({
      spaceId: space.id, caller: OWNER, runId: 'r1', agentId: 'agent',
      input: 'check plan', output: 'lgtm',
    });
    expect(rec.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(rec.runId).toBe('r1');
    const list = listProofLogs({ spaceId: space.id, caller: OWNER });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(rec.id);
  });

  it('rejects oversized input', async () => {
    const space = await createSpace({ owner: OWNER, name: 'demo' });
    await expect(
      writeProofLog({
        spaceId: space.id, caller: OWNER, runId: 'r1', agentId: 'a',
        input: 'x'.repeat(1_000_001), output: 'y',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
