/**
 * Service: Memory records. Order is: Walrus first, then Sui, then SQLite.
 * If Sui fails after Walrus succeeded, we log the orphan and return
 * SUI_TX_FAILED. The blob is invisible to the API (no SQLite row), but
 * Walrus retains the bytes — they can be GC'd in a future migration.
 */
import type Database from 'better-sqlite3';
import { openStore } from '../store';
import { GatewayError } from '../errors';
import { getSuiClient } from '../sui';
import { getWalrus } from '../walrus';
import { sha256Hex } from '../hash';
import type { MemoryRecord } from '../types';
import { getSpace } from './spaces';
import { getPolicy } from './policy';

interface WriteMemoryInput {
  spaceId: string;
  caller: string;
  kind: 'summary' | 'decision' | 'context' | 'note';
  payload: string;
}

export async function writeMemory(input: WriteMemoryInput): Promise<MemoryRecord> {
  const { spaceId, caller, kind, payload } = input;
  if (payload.length === 0 || payload.length > 1_000_000) {
    throw new GatewayError('BAD_REQUEST', 'payload must be 1..1_000_000 chars');
  }
  const space = getSpace(spaceId);
  if (!space) {
    throw new GatewayError('NOT_FOUND', `space ${spaceId} not found`);
  }
  if (space.owner !== caller) {
    const pol = getPolicy({ spaceId, subject: caller });
    if (!pol || !pol.canWrite || pol.revoked) {
      throw new GatewayError('FORBIDDEN', 'no write policy for caller');
    }
  }

  // 1. Walrus first
  const data = Buffer.from(payload, 'utf8');
  const versionHint = space.version + 1;
  const walrus = getWalrus();
  const { blobId } = await walrus.put({
    key: `memories/${spaceId}/${versionHint}`,
    data,
  });
  const contentHash = sha256Hex(data);

  // 2. Sui Move call
  const sui = getSuiClient();
  let pointerId: string;
  let version: number;
  let digest: string;
  try {
    const r = await sui.addMemoryPointer({
      spaceId,
      kind: 1,
      walrusBlobId: blobId,
      contentHash,
      sender: caller,
    });
    pointerId = r.pointerId;
    version = r.version;
    digest = r.digest;
  } catch (err) {
    // Log orphan blob id; the bytes are still in Walrus but invisible here.
    console.error(`[memories.write] Sui failed; orphan walrus blobId=${blobId}`, err);
    throw err instanceof GatewayError ? err : new GatewayError('SUI_TX_FAILED', String(err));
  }

  // 3. SQLite
  const db = openStore();
  insertBlob(db, {
    blobId,
    spaceId,
    objectId: pointerId,
    kind: 1,
    version,
    contentHash,
    mimeType: null,
    name: null,
    runId: null,
    agentId: null,
    inputHash: null,
    outputHash: null,
    createdAt: Math.floor(Date.now() / 1000),
  });
  updateSpaceVersion(db, spaceId, version);

  return {
    id: pointerId,
    spaceId,
    kind,
    walrusBlobId: blobId,
    contentHash,
    version,
    createdAt: new Date().toISOString(),
  };
}

export function listMemories(input: { spaceId: string; caller: string; limit?: number }): MemoryRecord[] {
  const { spaceId, caller, limit = 50 } = input;
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
  const cap = Math.min(Math.max(limit, 1), 200);
  const db = openStore();
  const rows = db
    .prepare(
      `SELECT object_id, space_id, kind, blob_id, content_hash, version, created_at
         FROM blobs
        WHERE space_id = ? AND kind = 1
        ORDER BY version DESC
        LIMIT ?`,
    )
    .all(spaceId, cap) as Array<{
      object_id: string; space_id: string; kind: number; blob_id: string;
      content_hash: string; version: number; created_at: number;
    }>;
  return rows.map((r) => ({
    id: r.object_id,
    spaceId: r.space_id,
    kind: 'note', // we lost the textual kind in SQLite; round-trip with content
    walrusBlobId: r.blob_id,
    contentHash: r.content_hash,
    version: r.version,
    createdAt: new Date(r.created_at * 1000).toISOString(),
  }));
}

function insertBlob(
  db: Database.Database,
  row: {
    blobId: string; spaceId: string; objectId: string; kind: number; version: number;
    contentHash: string; mimeType: string | null; name: string | null;
    runId: string | null; agentId: string | null; inputHash: string | null;
    outputHash: string | null; createdAt: number;
  },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO blobs (
      blob_id, space_id, object_id, kind, version, content_hash,
      mime_type, name, run_id, agent_id, input_hash, output_hash, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.blobId, row.spaceId, row.objectId, row.kind, row.version, row.contentHash,
    row.mimeType, row.name, row.runId, row.agentId, row.inputHash, row.outputHash, row.createdAt,
  );
}

function updateSpaceVersion(db: Database.Database, spaceId: string, version: number): void {
  db.prepare('UPDATE spaces SET latest_version = MAX(latest_version, ?) WHERE space_id = ?').run(
    version,
    spaceId,
  );
}
