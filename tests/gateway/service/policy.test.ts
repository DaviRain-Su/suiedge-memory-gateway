/**
 * Service test: share + revoke + getPolicy + listPolicies.
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
import { share, revoke, getPolicy, listPolicies } from '@/lib/service/policy';

let path: string;

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), 'suiedge-pol-')), 'test.db');
  process.env.DB_PATH = path;
  resetConfigForTest();
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
  setSuiClient(new MockSuiClient());
  setWalrus(new MemoryWalrusPublisher());
});

describe('share', () => {
  it('owner can share; non-owner is FORBIDDEN', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    const pol = await share({
      spaceId: space.id,
      caller: '0x' + 'a'.repeat(64),
      subject: '0x' + 'b'.repeat(64),
      canRead: true,
      canWrite: true,
      canShare: false,
    });
    expect(pol.subject).toBe('0x' + 'b'.repeat(64));
    expect(pol.canRead).toBe(true);
    expect(pol.revoked).toBe(false);
    const got = getPolicy({ spaceId: space.id, subject: '0x' + 'b'.repeat(64) });
    expect(got?.id).toBe(pol.id);
    await expect(
      share({
        spaceId: space.id,
        caller: '0x' + 'c'.repeat(64),
        subject: '0x' + 'b'.repeat(64),
        canRead: true,
        canWrite: false,
        canShare: false,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects bad subject', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    await expect(
      share({
        spaceId: space.id,
        caller: '0x' + 'a'.repeat(64),
        subject: 'bad',
        canRead: true,
        canWrite: false,
        canShare: false,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('revoke', () => {
  it('flips revoked in cache and chain', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    const pol = await share({
      spaceId: space.id,
      caller: '0x' + 'a'.repeat(64),
      subject: '0x' + 'b'.repeat(64),
      canRead: true,
      canWrite: true,
      canShare: false,
    });
    const after = await revoke({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), policyId: pol.id });
    expect(after.revoked).toBe(true);
    expect(getPolicy({ spaceId: space.id, subject: '0x' + 'b'.repeat(64) })?.revoked).toBe(true);
  });

  it('rejects double-revoke with CONFLICT', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    const pol = await share({
      spaceId: space.id,
      caller: '0x' + 'a'.repeat(64),
      subject: '0x' + 'b'.repeat(64),
      canRead: true,
      canWrite: true,
      canShare: false,
    });
    await revoke({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), policyId: pol.id });
    await expect(
      revoke({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), policyId: pol.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('non-owner revoke is FORBIDDEN', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    const pol = await share({
      spaceId: space.id,
      caller: '0x' + 'a'.repeat(64),
      subject: '0x' + 'b'.repeat(64),
      canRead: true,
      canWrite: true,
      canShare: false,
    });
    await expect(
      revoke({ spaceId: space.id, caller: '0x' + 'c'.repeat(64), policyId: pol.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('listPolicies', () => {
  it('returns all policies for a space', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    await share({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), subject: '0x' + 'b'.repeat(64), canRead: true, canWrite: false, canShare: false });
    await share({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), subject: '0x' + 'c'.repeat(64), canRead: true, canWrite: true, canShare: false });
    const list = listPolicies({ spaceId: space.id });
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.subject).sort()).toEqual(['0x' + 'b'.repeat(64), '0x' + 'c'.repeat(64)]);
  });
});
