/**
 * Service: Artifact records. Artifacts are blobs (kind=2) with a name + mime type.
 * Same Walrus-then-Sui-then-SQLite ordering as memories.
 */
import type Database from 'better-sqlite3';
import { openStore } from '../store.js';
import { GatewayError } from '../errors.js';
import { getSuiClient } from '../sui.js';
import { getWalrus } from '../walrus.js';
import { sha256Hex } from '../hash.js';
import type { ArtifactRecord } from '../types.js';
import { getSpace } from './spaces.js';
import { getPolicy } from './policy.js';

interface WriteArtifactInput {
  spaceId: string;
  caller: string;
  name: string;
  mimeType: string;
  payload: string; // base64
}

export async function writeArtifact(input: WriteArtifactInput): Promise<ArtifactRecord> {
  const { spaceId, caller, name, mimeType, payload } = input;
  if (name.length === 0 || name.length > 128) {
    throw new GatewayError('BAD_REQUEST', 'name must be 1..128 chars');
  }
  if (mimeType.length === 0 || mimeType.length > 128) {
    throw new GatewayError('BAD_REQUEST', 'mimeType must be 1..128 chars');
  }
  if (payload.length === 0 || payload.length > 10_000_000) {
    throw new GatewayError('BAD_REQUEST', 'payload must be 1..10_000_000 base64 chars');
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
  const data = Buffer.from(payload, 'base64');
  const versionHint = space.version + 1;
  const walrus = getWalrus();
  const { blobId } = await walrus.put({ key: `artifacts/${spaceId}/${versionHint}`, data });
  const contentHash = sha256Hex(data);
  const sui = getSuiClient();
  let pointerId: string;
  let version: number;
  try {
    const r = await sui.addMemoryPointer({
      spaceId,
      kind: 2,
      walrusBlobId: blobId,
      contentHash,
      sender: caller,
    });
    pointerId = r.pointerId;
    version = r.version;
  } catch (err) {
    console.error(`[artifacts.write] Sui failed; orphan walrus blobId=${blobId}`, err);
    throw err instanceof GatewayError ? err : new GatewayError('SUI_TX_FAILED', String(err));
  }
  const db = openStore();
  db.prepare(
    `INSERT OR REPLACE INTO blobs (
      blob_id, space_id, object_id, kind, version, content_hash,
      mime_type, name, run_id, agent_id, input_hash, output_hash, created_at
     ) VALUES (?, ?, ?, 2, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
  ).run(
    blobId,
    spaceId,
    pointerId,
    version,
    contentHash,
    mimeType,
    name,
    Math.floor(Date.now() / 1000),
  );
  db.prepare('UPDATE spaces SET latest_version = MAX(latest_version, ?) WHERE space_id = ?').run(
    version,
    spaceId,
  );
  return {
    id: pointerId,
    spaceId,
    name,
    mimeType,
    walrusBlobId: blobId,
    contentHash,
    version,
  };
}

export function listArtifacts(input: { spaceId: string; caller: string }): ArtifactRecord[] {
  const { spaceId, caller } = input;
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
      `SELECT object_id, space_id, name, mime_type, blob_id, content_hash, version
         FROM blobs
        WHERE space_id = ? AND kind = 2
        ORDER BY version DESC`,
    )
    .all(spaceId) as Array<{
      object_id: string; space_id: string; name: string | null; mime_type: string | null;
      blob_id: string; content_hash: string; version: number;
    }>;
  return rows.map((r) => ({
    id: r.object_id,
    spaceId: r.space_id,
    name: r.name ?? '',
    mimeType: r.mime_type ?? '',
    walrusBlobId: r.blob_id,
    contentHash: r.content_hash,
    version: r.version,
  }));
}
