/**
 * Service: ContextBundle. Reads the most recent memory blobs for a space,
 * fetches the bodies from Walrus, and returns them in version order.
 */
import { openStore } from '../store';
import { GatewayError } from '../errors';
import { getWalrus } from '../walrus';
import { getSpace } from './spaces';
import { getPolicy } from './policy';
import type { ContextBundle } from '../types';

export async function loadContext(input: {
  spaceId: string;
  caller: string;
  maxItems?: number;
}): Promise<ContextBundle> {
  const { spaceId, caller, maxItems = 50 } = input;
  const cap = Math.min(Math.max(maxItems, 1), 200);
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
  const rows = db
    .prepare(
      `SELECT blob_id, kind, version, content_hash
         FROM blobs
        WHERE space_id = ? AND kind = 1
        ORDER BY version DESC
        LIMIT ?`,
    )
    .all(spaceId, cap) as Array<{ blob_id: string; kind: number; version: number; content_hash: string }>;
  const walrus = getWalrus();
  const items: ContextBundle['items'] = [];
  for (const r of rows) {
    let content = '';
    try {
      const buf = await walrus.get({ blobId: r.blob_id });
      content = buf.toString('utf8');
    } catch (err) {
      console.error(`[context.load] Walrus get failed for ${r.blob_id}`, err);
    }
    items.push({
      kind: 'note', // we don't store textual kind in SQLite; default
      version: r.version,
      contentHash: r.content_hash,
      content,
    });
  }
  return { spaceId, items };
}
