/**
 * Service: BM25-lite keyword search over memory payloads.
 *
 * Trade-offs:
 * - No external vector DB. We fetch candidate bodies from Walrus
 *   and rank them in-process. Cap at 200 candidates so a single
 *   search does not pay for 1000+ Walrus GETs.
 * - Tokenization: lowercase + split on /\W+/, drop empty + drop a
 *   short stopword set.
 * - Score: tf × log((N+1)/(df+1)) per term, summed, plus a recency
 *   multiplier (newer version => closer to 1.0).
 * - No persistence — every call refetches from Walrus. For a
 *   hackathon this is fine; production would add an in-process
 *   LRU of decoded bodies and eventually an embeddings index.
 */
import { openStore } from '../store';
import { GatewayError } from '../errors';
import { getWalrus } from '../walrus';
import { getSpace } from './spaces';
import { getPolicy } from './policy';
import type { MemoryRecord } from '../types';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'this', 'these',
  'those', 'but', 'not', 'if', 'so', 'do', 'does', 'did', 'been',
]);

const CANDIDATE_CAP = 200;
const RECENCY_DECAY = 0.05; // weight = exp(-decay * (maxVersion - thisVersion))

export interface SearchHit {
  id: string;
  version: number;
  kind: MemoryRecord['kind'];
  score: number;
  excerpt: string;
  body: string;
  contentHash: string;
  walrusBlobId: string;
  createdAt: string;
}

export async function searchMemories(input: {
  spaceId: string;
  caller: string;
  query: string;
  limit?: number;
  kind?: MemoryRecord['kind'];
}): Promise<SearchHit[]> {
  const { spaceId, caller, query } = input;
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

  if (query.length === 0 || query.length > 256) {
    throw new GatewayError('BAD_REQUEST', 'query must be 1..256 chars');
  }
  const space = getSpace(spaceId);
  if (!space) {
    throw new GatewayError('NOT_FOUND', `space ${spaceId} not found`);
  }
  if (space.owner !== caller) {
    const pol = getPolicy({ spaceId, subject: caller });
    if (!pol || !pol.canRead || pol.revoked) {
      throw new GatewayError('FORBIDDEN', 'no read policy for caller');
    }
  }

  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }

  // Pull candidates from the SQLite index — kind=1 (memory), capped.
  const db = openStore();
  const candidates = db
    .prepare(
      `SELECT blob_id, kind, version, content_hash, created_at, object_id
         FROM blobs
        WHERE space_id = ? AND kind = 1
        ORDER BY version DESC
        LIMIT ?`,
    )
    .all(spaceId, CANDIDATE_CAP) as Array<{
      blob_id: string;
      kind: number;
      version: number;
      content_hash: string;
      created_at: number;
      object_id: string;
    }>;

  if (candidates.length === 0) return [];

  // Fetch bodies, build term-frequency map.
  const walrus = getWalrus();
  type Doc = { body: string; tf: Map<string, number>; length: number };
  const docs: Doc[] = [];
  const objectIds: string[] = [];
  const versions: number[] = [];
  const contentHashes: string[] = [];
  const blobIds: string[] = [];
  const createdAts: number[] = [];

  for (const c of candidates) {
    let body = '';
    try {
      const buf = await walrus.get({ blobId: c.blob_id });
      body = buf.toString('utf8');
    } catch {
      continue; // skip unreadable blobs
    }
    docs.push({ body, tf: termFreq(body), length: body.length });
    objectIds.push(c.object_id);
    versions.push(c.version);
    contentHashes.push(c.content_hash);
    blobIds.push(c.blob_id);
    createdAts.push(c.created_at);
  }
  if (docs.length === 0) return [];

  // Document frequency across candidates.
  const N = docs.length;
  const df = new Map<string, number>();
  for (const term of terms) {
    let n = 0;
    for (const d of docs) {
      if (d.tf.has(term)) n++;
    }
    df.set(term, n);
  }

  // Score every doc.
  const maxVersion = Math.max(...versions);
  const scored: Array<{ idx: number; score: number }> = [];
  for (let i = 0; i < docs.length; i++) {
    let score = 0;
    const d = docs[i]!;
    for (const term of terms) {
      const tf = d.tf.get(term) ?? 0;
      if (tf === 0) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log((N + 1) / (n + 1)) + 1;
      score += (tf / Math.sqrt(d.length + 1)) * idf;
    }
    if (score > 0) {
      const recency = Math.exp(-RECENCY_DECAY * (maxVersion - (versions[i] ?? 0)));
      scored.push({ idx: i, score: score * (0.5 + 0.5 * recency) });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => {
    const d = docs[s.idx]!;
    return {
      id: objectIds[s.idx]!,
      version: versions[s.idx]!,
      kind: 'note', // we don't store textual kind in SQLite; default
      score: round(s.score, 4),
      excerpt: makeExcerpt(d.body, terms),
      body: d.body,
      contentHash: contentHashes[s.idx]!,
      walrusBlobId: blobIds[s.idx]!,
      createdAt: new Date((createdAts[s.idx] ?? 0) * 1000).toISOString(),
    };
  });
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function termFreq(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokenize(s)) {
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

function makeExcerpt(body: string, terms: string[], radius = 80): string {
  const lc = body.toLowerCase();
  let bestIdx = -1;
  for (const t of terms) {
    const i = lc.indexOf(t);
    if (i >= 0 && (bestIdx < 0 || i < bestIdx)) bestIdx = i;
  }
  if (bestIdx < 0) return body.slice(0, radius * 2).trim();
  const start = Math.max(0, bestIdx - radius);
  const end = Math.min(body.length, bestIdx + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return prefix + body.slice(start, end).trim() + suffix;
}

function round(n: number, places: number): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}
