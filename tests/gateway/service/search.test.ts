/**
 * Service test: searchMemories + loadContext(query=...) — with mocks.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetConfigForTest } from '@/lib/config';
import { resetStoreForTest } from '@/lib/store';
import { resetSuiClientForTest, setSuiClient, MockSuiClient } from '@/lib/sui';
import { resetWalrusForTest, setWalrus, MemoryWalrusPublisher } from '@/lib/walrus';
import { createSpace } from '@/lib/service/spaces';
import { writeMemory } from '@/lib/service/memories';
import { searchMemories } from '@/lib/service/search';
import { loadContext } from '@/lib/service/context';

const OWNER = '0x' + 'a'.repeat(64);

let dbPath: string;

beforeEach(() => {
  dbPath = join(mkdtempSync(join(tmpdir(), 'suiedge-search-')), 'test.db');
  process.env.DB_PATH = dbPath;
  resetConfigForTest();
  resetStoreForTest();
  resetSuiClientForTest();
  resetWalrusForTest();
  setSuiClient(new MockSuiClient());
  setWalrus(new MemoryWalrusPublisher());
});

describe('searchMemories', () => {
  it('ranks docs by BM25-lite, with the most recent match on top', async () => {
    const s = await createSpace({ owner: OWNER, name: 'search-test' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'the quick brown fox jumps over the lazy dog' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'a quick fox runs through the forest' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'a totally unrelated memory about shipping a product' });

    const hits = await searchMemories({ spaceId: s.id, caller: OWNER, query: 'fox' });
    expect(hits.length).toBe(2);
    // Newer memory should outrank the older one thanks to the recency boost.
    expect(hits[0]!.version).toBeGreaterThan(hits[1]!.version);
    for (const h of hits) {
      expect(h.body.toLowerCase()).toContain('fox');
      expect(h.score).toBeGreaterThan(0);
      expect(typeof h.excerpt).toBe('string');
    }
  });

  it('returns [] for a query that matches nothing', async () => {
    const s = await createSpace({ owner: OWNER, name: 'no-match' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'no relevant content here' });
    const hits = await searchMemories({ spaceId: s.id, caller: OWNER, query: 'cryptographic hyperdrive' });
    expect(hits).toEqual([]);
  });

  it('rejects empty / oversized query', async () => {
    const s = await createSpace({ owner: OWNER, name: 'q-reject' });
    await expect(searchMemories({ spaceId: s.id, caller: OWNER, query: '' })).rejects.toThrow(/1\.\.256/);
    await expect(searchMemories({ spaceId: s.id, caller: OWNER, query: 'x'.repeat(300) })).rejects.toThrow(/1\.\.256/);
  });

  it('rejects when caller is not owner and has no read policy', async () => {
    const s = await createSpace({ owner: OWNER, name: 'forbidden' });
    const other = '0x' + 'b'.repeat(64);
    await expect(searchMemories({ spaceId: s.id, caller: other, query: 'anything' })).rejects.toThrow(/read policy/);
  });
});

describe('loadContext(query=...)', () => {
  it('returns ranked items with score and excerpt when query is provided', async () => {
    const s = await createSpace({ owner: OWNER, name: 'ranked' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'sui edge memory gateway design notes' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'sui move contract anchors ownership and access policy' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'walrus stores the bytes; sui stores the pointers' });

    const bundle = await loadContext({ spaceId: s.id, caller: OWNER, query: 'sui ownership', maxItems: 5 });
    expect(bundle.query).toBe('sui ownership');
    expect(bundle.items.length).toBeGreaterThan(0);
    for (const item of bundle.items) {
      expect(typeof item.score).toBe('number');
      expect(typeof item.excerpt).toBe('string');
    }
  });

  it('returns version-DESC items when no query', async () => {
    const s = await createSpace({ owner: OWNER, name: 'no-q' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'first' });
    await writeMemory({ spaceId: s.id, caller: OWNER, kind: 'context', payload: 'second' });
    const bundle = await loadContext({ spaceId: s.id, caller: OWNER, maxItems: 5 });
    expect(bundle.query).toBeUndefined();
    expect(bundle.items[0]!.version).toBeGreaterThan(bundle.items[1]!.version);
  });
});
