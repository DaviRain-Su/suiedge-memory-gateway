/**
 * Service: memory search over Walrus-backed bodies.
 *
 * Pluggable backend (see ./searchBackends.ts): default BM25-lite.
 * Cap at 200 candidates so a single search does not pay for
 * 1000+ Walrus GETs.
 *
 * Score path: backend ranks raw relevance, then we apply a
 * recency multiplier exp(-0.05 * (maxVersion - thisVersion)).
 *
 * Excerpt is built from the tokenized query (best matching offset).
 */
import { openStore } from '../store';
import { GatewayError } from '../errors';
import { getWalrus } from '../walrus';
import { getSpace } from './spaces';
import { getPolicy } from './policy';
import { getSearchBackend, type Doc as BackendDoc } from './searchBackends';
import type { MemoryRecord } from '../types';

const CANDIDATE_CAP = 200;
const RECENCY_DECAY = 0.05;

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
  backend?: string;
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

  const walrus = getWalrus();
  const docs: BackendDoc[] = [];
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
      continue;
    }
    docs.push({ body, length: body.length, version: c.version });
    objectIds.push(c.object_id);
    versions.push(c.version);
    contentHashes.push(c.content_hash);
    blobIds.push(c.blob_id);
    createdAts.push(c.created_at);
  }
  if (docs.length === 0) return [];

  const backend = getSearchBackend();
  const rawScores = await backend.rank(query, docs);
  const maxVersion = Math.max(...versions);
  const scored: Array<{ idx: number; score: number }> = [];
  for (let i = 0; i < docs.length; i++) {
    const score = rawScores[i] ?? 0;
    if (score > 0) {
      const recency = Math.exp(-RECENCY_DECAY * (maxVersion - versions[i]!));
      scored.push({ idx: i, score: score * (0.5 + 0.5 * recency) });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  const terms = query.toLowerCase().split(/[^a-z0-9_]+/g).filter(Boolean);

  return scored.slice(0, limit).map((s) => {
    const idx = s.idx;
    return {
      id: objectIds[idx]!,
      version: versions[idx]!,
      kind: 'note',
      score: round(s.score, 4),
      excerpt: makeExcerpt(docs[idx]!.body, terms),
      body: docs[idx]!.body,
      contentHash: contentHashes[idx]!,
      walrusBlobId: blobIds[idx]!,
      createdAt: new Date((createdAts[idx] ?? 0) * 1000).toISOString(),
      backend: backend.name,
    };
  });
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
