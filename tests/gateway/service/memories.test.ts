/**
 * Service test: writeMemory, listMemories, loadContext — with mocks.
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
import { writeMemory, listMemories } from '@/lib/service/memories';
import { loadContext } from '@/lib/service/context';

let path: string;

beforeEach(() => {
  path = join(mkdtempSync(join(tmpdir(), 'suiedge-mem-')), 'test.db');
  process.env.DB_PATH = path;
  resetConfigForTest();
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
  setSuiClient(new MockSuiClient());
  setWalrus(new MemoryWalrusPublisher());
});

describe('writeMemory', () => {
  it('writes Walrus, Sui, and SQLite in order', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    const rec = await writeMemory({
      spaceId: space.id,
      caller: '0x' + 'a'.repeat(64),
      kind: 'summary',
      payload: 'hello world',
    });
    expect(rec.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(rec.walrusBlobId).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.version).toBe(1);
    const db = openStore();
    const row = db.prepare('SELECT blob_id, space_id, kind, version FROM blobs').get() as {
      blob_id: string; space_id: string; kind: number; version: number;
    };
    expect(row.kind).toBe(1);
    expect(row.version).toBe(1);
    expect(row.space_id).toBe(space.id);
  });

  it('rejects oversized payload', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    await expect(
      writeMemory({
        spaceId: space.id,
        caller: '0x' + 'a'.repeat(64),
        kind: 'note',
        payload: 'x'.repeat(1_000_001),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects empty payload', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    await expect(
      writeMemory({
        spaceId: space.id,
        caller: '0x' + 'a'.repeat(64),
        kind: 'note',
        payload: '',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('listMemories', () => {
  it('returns written memories in version order', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    await writeMemory({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), kind: 'summary', payload: 'one' });
    await writeMemory({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), kind: 'decision', payload: 'two' });
    const out = listMemories({ spaceId: space.id, caller: '0x' + 'a'.repeat(64) });
    expect(out).toHaveLength(2);
    expect(out[0].version).toBe(2);
    expect(out[1].version).toBe(1);
  });

  it('respects limit', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    for (let i = 0; i < 5; i++) {
      await writeMemory({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), kind: 'note', payload: `m${i}` });
    }
    const out = listMemories({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), limit: 3 });
    expect(out).toHaveLength(3);
  });
});

describe('loadContext', () => {
  it('returns a bundle with content fetched from Walrus', async () => {
    const space = await createSpace({ owner: '0x' + 'a'.repeat(64), name: 'demo' });
    await writeMemory({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), kind: 'summary', payload: 'one' });
    await writeMemory({ spaceId: space.id, caller: '0x' + 'a'.repeat(64), kind: 'summary', payload: 'two' });
    const bundle = await loadContext({ spaceId: space.id, caller: '0x' + 'a'.repeat(64) });
    expect(bundle.spaceId).toBe(space.id);
    expect(bundle.items).toHaveLength(2);
    const texts = bundle.items.map((i) => i.content).sort();
    expect(texts).toEqual(['one', 'two']);
  });

  it('throws NOT_FOUND for unknown space', async () => {
    await expect(
      loadContext({ spaceId: '0x' + 'f'.repeat(64), caller: '0x' + 'a'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
