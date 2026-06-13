/**
 * Service test: createSpace with MockSuiClient + MemoryWalrusPublisher.
 * Verifies SQLite row is created with the deterministic space id.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetStoreForTest, openStore } from '@/lib/store';
import { resetConfigForTest } from '@/lib/config';
import { resetSuiClientForTest, setSuiClient, MockSuiClient } from '@/lib/sui';
import { resetWalrusForTest, setWalrus, MemoryWalrusPublisher } from '@/lib/walrus';
import { createSpace, listSpaces, getSpace } from '@/lib/service/spaces';
let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'suiedge-spaces-'));
  path = join(dir, 'test.db');
  process.env.DB_PATH = path;
  resetConfigForTest();
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
  setSuiClient(new MockSuiClient());
  setWalrus(new MemoryWalrusPublisher());
});

describe('createSpace', () => {
  it('inserts a SQLite row with a deterministic space id', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    expect(space.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(space.owner).toBe('0x' + 'a'.repeat(64));
    expect(space.name).toBe('demo');
    expect(space.version).toBe(0);
    const db = openStore();
    const row = db.prepare('SELECT space_id, owner, name, latest_version FROM spaces').get() as {
      space_id: string; owner: string; name: string; latest_version: number;
    };
    expect(row.space_id).toBe(space.id);
    expect(row.owner).toBe(space.owner);
    expect(row.name).toBe('demo');
    expect(row.latest_version).toBe(0);
  });

  it('rejects empty name', async () => {
    await expect(
      createSpace({ owner: '0x' + 'a'.repeat(64), name: '' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects bad owner', async () => {
    await expect(
      createSpace({ owner: 'not-an-address', name: 'demo' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('listSpaces', () => {
  it('returns only the requested owner', async () => {
    await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'one' });
    await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'two' });
    await createSpace({ owner: '0x' + 'b'.repeat(64), name: 'three' });
    const out = listSpaces({ owner: '0x' + 'a'.repeat(64) });
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.name).sort()).toEqual(['one', 'two']);
  });

  it('rejects bad owner', () => {
    expect(() => listSpaces({ owner: 'bad' })).toThrow();
  });
});

describe('getSpace', () => {
  it('returns null for unknown id', () => {
    expect(getSpace('0x' + 'f'.repeat(64))).toBeNull();
  });

  it('returns the space after createSpace', async () => {
    const s = await createSpace({ owner: '0x' + 'c'.repeat(64), name: 'one' });
    const got = getSpace(s.id);
    expect(got?.id).toBe(s.id);
    expect(got?.name).toBe('one');
  });
});
