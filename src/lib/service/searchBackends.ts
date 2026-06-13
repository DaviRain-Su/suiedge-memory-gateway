/**
 * Search backends. Pluggable scoring over candidate documents.
 *
 * A backend takes:
 *   - the query string
 *   - an ordered list of { body, length, version } documents
 *   - and returns a non-negative score per document (0 = no match).
 *
 * The caller is responsible for:
 *   - fetching bodies from Walrus
 *   - applying recency weighting
 *   - truncating to a limit
 *
 * Three implementations are provided:
 *   - Bm25LiteBackend:   tokenized TF-IDF (default, fast + deterministic)
 *   - TrigramBackend:    character 3-gram Jaccard — robust to typos and stems
 *   - createEmbeddingBackend: vector cosine similarity; pluggable embedder
 *
 * Pick via env SUIEDGE_SEARCH_BACKEND = bm25 | trigram | embedding (default bm25).
 * Adding a new backend is a single function: rank(query, docs) -> Promise<number[]>.
 */

export interface Doc {
  body: string;
  length: number;
  version: number;
}

export interface SearchBackend {
  name: string;
  rank(query: string, docs: Doc[]): Promise<number[]>;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'this', 'these',
  'those', 'but', 'not', 'if', 'so', 'do', 'does', 'did', 'been',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function termFreq(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokenize(s)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

// ---- BM25-lite

export const Bm25LiteBackend: SearchBackend = {
  name: 'bm25',
  async rank(query: string, docs: Doc[]): Promise<number[]> {
    const terms = tokenize(query);
    if (terms.length === 0) return docs.map(() => 0);
    const N = docs.length;
    const df = new Map<string, number>();
    const tfs: Map<string, number>[] = docs.map((d) => termFreq(d.body));
    for (const term of terms) {
      let n = 0;
      for (const tf of tfs) if (tf.has(term)) n++;
      df.set(term, n);
    }
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      const d = docs[i]!;
      const tf = tfs[i]!;
      let s = 0;
      for (const term of terms) {
        const c = tf.get(term) ?? 0;
        if (c === 0) continue;
        const n = df.get(term) ?? 0;
        const idf = Math.log((N + 1) / (n + 1)) + 1;
        s += (c / Math.sqrt(d.length + 1)) * idf;
      }
      out.push(s);
    }
    return out;
  },
};

// ---- Character trigram Jaccard (zero-dep, handles stems/typos)

function trigrams(s: string): Set<string> {
  const t = s.toLowerCase();
  if (t.length < 3) return new Set([t]);
  const out = new Set<string>();
  for (let i = 0; i <= t.length - 3; i++) out.add(t.slice(i, i + 3));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export const TrigramBackend: SearchBackend = {
  name: 'trigram',
  async rank(query: string, docs: Doc[]): Promise<number[]> {
    const q = trigrams(query);
    if (q.size === 0) return docs.map(() => 0);
    return docs.map((d) => jaccard(q, trigrams(d.body)));
  },
};

// ---- Embedding (vector cosine). The consumer provides an embedder.

export type Embedder = (texts: string[]) => Promise<Float32Array[]>;

export function createEmbeddingBackend(embedder: Embedder): SearchBackend {
  return {
    name: 'embedding',
    async rank(query: string, docs: Doc[]): Promise<number[]> {
      if (docs.length === 0) return [];
      const vecs = await embedder([query, ...docs.map((d) => d.body)]);
      const qv = vecs[0];
      if (!qv) return docs.map(() => 0);
      const out: number[] = [];
      for (let i = 0; i < docs.length; i++) {
        const dv = vecs[i + 1];
        out.push(dv ? cosine(qv, dv) : 0);
      }
      return out;
    },
  };
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ---- Registry / selector

let _active: SearchBackend = Bm25LiteBackend;
let _explicit = false;

export function getSearchBackend(): SearchBackend {
  if (_explicit) return _active;
  const choice = (process.env.SUIEDGE_SEARCH_BACKEND ?? 'bm25').toLowerCase();
  switch (choice) {
    case 'trigram': _active = TrigramBackend; break;
    case 'embedding': _active = Bm25LiteBackend; break; // embedder wiring is consumer's job
    case 'bm25':
    default: _active = Bm25LiteBackend; break;
  }
  _explicit = true;
  return _active;
}

export function setSearchBackend(b: SearchBackend): void {
  _active = b;
  _explicit = true;
}

export function resetSearchBackendForTest(): void {
  _active = Bm25LiteBackend;
  _explicit = false;
}
