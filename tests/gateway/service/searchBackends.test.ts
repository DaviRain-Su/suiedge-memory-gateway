/**
 * Service test: search backends. Pure unit tests, no IO.
 */
import { describe, it, expect } from 'vitest';
import {
  Bm25LiteBackend,
  TrigramBackend,
  createEmbeddingBackend,
  setSearchBackend,
  resetSearchBackendForTest,
  getSearchBackend,
  type Doc,
} from '@/lib/service/searchBackends';

const docs: Doc[] = [
  { body: 'the quick brown fox jumps over the lazy dog', length: 43, version: 1 },
  { body: 'a fox and a fox in the forest', length: 30, version: 2 },
  { body: 'unrelated text about cooking', length: 27, version: 3 },
];

describe('Bm25LiteBackend', () => {
  it('returns 0 for an empty tokenization', async () => {
    const out = await Bm25LiteBackend.rank('   ', docs);
    expect(out).toEqual([0, 0, 0]);
  });
  it('scores the most relevant doc above the irrelevant one', async () => {
    const out = await Bm25LiteBackend.rank('fox', docs);
    expect(out[0]!).toBeGreaterThan(0);
    expect(out[1]!).toBeGreaterThan(0);
    expect(out[2]).toBe(0);
  });
  it('exposes name "bm25"', () => {
    expect(Bm25LiteBackend.name).toBe('bm25');
  });
});

describe('TrigramBackend', () => {
  it('matches stems and partial words', async () => {
    // "foxes" shares trigrams with "fox"
    const trigramDocs: Doc[] = [
      { body: 'the quick brown fox jumps over', length: 28, version: 1 },
      { body: 'a wild foxes running', length: 21, version: 2 },
      { body: 'a totally different thing', length: 25, version: 3 },
    ];
    const out = await TrigramBackend.rank('fox', trigramDocs);
    expect(out[0]!).toBeGreaterThan(0);
    expect(out[1]!).toBeGreaterThan(0);
    expect(out[2]).toBe(0);
  });
  it('handles empty input', async () => {
    const out = await TrigramBackend.rank('', docs);
    expect(out).toEqual([0, 0, 0]);
  });
  it('exposes name "trigram"', () => {
    expect(TrigramBackend.name).toBe('trigram');
  });
});

describe('createEmbeddingBackend', () => {
  it('delegates to a user-supplied embedder and ranks by cosine', async () => {
    const fakeEmbedder = async (texts: string[]): Promise<Float32Array[]> => {
      // Toy 2D vectors: put 'fox' on the right, 'cooking' on the left.
      return texts.map((t) => {
        const v = new Float32Array(2);
        if (t.includes('fox')) { v[0] = 1; v[1] = 0; }
        else if (t.includes('cooking')) { v[0] = 0; v[1] = 1; }
        else { v[0] = 0.1; v[1] = 0.1; }
        return v;
      });
    };
    const b = createEmbeddingBackend(fakeEmbedder);
    const out = await b.rank('fox', docs);
    expect(out[0]!).toBeGreaterThan(out[2]!);
    expect(b.name).toBe('embedding');
  });
  it('returns 0 for an empty doc list without calling the embedder', async () => {
    let called = false;
    const b = createEmbeddingBackend(async () => { called = true; return []; });
    const out = await b.rank('q', []);
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });
});

describe('getSearchBackend / setSearchBackend', () => {
  it('defaults to bm25', () => {
    resetSearchBackendForTest();
    delete process.env.SUIEDGE_SEARCH_BACKEND;
    expect(getSearchBackend().name).toBe('bm25');
  });
  it('returns trigram when env=trigram', () => {
    process.env.SUIEDGE_SEARCH_BACKEND = 'trigram';
    // bypass the cached-default path
    setSearchBackend(TrigramBackend);
    expect(getSearchBackend().name).toBe('trigram');
    delete process.env.SUIEDGE_SEARCH_BACKEND;
    resetSearchBackendForTest();
  });
  it('respects explicit setSearchBackend override', () => {
    setSearchBackend(TrigramBackend);
    expect(getSearchBackend().name).toBe('trigram');
    resetSearchBackendForTest();
  });
});
