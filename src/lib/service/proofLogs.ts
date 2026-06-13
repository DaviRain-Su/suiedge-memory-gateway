/**
 * Service: ProofLog records. kind=3; stores run_id/agent_id/input_hash/output_hash
 * alongside the blob.
 */
import { openStore } from '../store.js';
import { GatewayError } from '../errors.js';
import { getSuiClient } from '../sui.js';
import { getWalrus } from '../walrus.js';
import { sha256Hex } from '../hash.js';
import type { ProofLog } from '../types.js';
import { getSpace } from './spaces.js';
import { getPolicy } from './policy.js';

interface WriteProofLogInput {
  spaceId: string;
  caller: string;
  runId: string;
  agentId: string;
  input: string;
  output: string;
}

export async function writeProofLog(input: WriteProofLogInput): Promise<ProofLog> {
  const { spaceId, caller, runId, agentId, input: inputText, output } = input;
  if (runId.length === 0 || runId.length > 128) {
    throw new GatewayError('BAD_REQUEST', 'runId must be 1..128 chars');
  }
  if (agentId.length === 0 || agentId.length > 128) {
    throw new GatewayError('BAD_REQUEST', 'agentId must be 1..128 chars');
  }
  if (inputText.length === 0 || inputText.length > 1_000_000) {
    throw new GatewayError('BAD_REQUEST', 'input must be 1..1_000_000 chars');
  }
  if (output.length === 0 || output.length > 1_000_000) {
    throw new GatewayError('BAD_REQUEST', 'output must be 1..1_000_000 chars');
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
  const inputHash = sha256Hex(inputText);
  const outputHash = sha256Hex(output);
  const blobBody = Buffer.from(JSON.stringify({ runId, agentId, input: inputText, output }), 'utf8');
  const walrus = getWalrus();
  const { blobId } = await walrus.put({ key: `proof-logs/${spaceId}/${runId}`, data: blobBody });
  const contentHash = sha256Hex(blobBody);
  const sui = getSuiClient();
  let pointerId: string;
  let version: number;
  try {
    const r = await sui.addMemoryPointer({
      spaceId,
      kind: 3,
      walrusBlobId: blobId,
      contentHash,
      sender: caller,
    });
    pointerId = r.pointerId;
    version = r.version;
  } catch (err) {
    console.error(`[proofLogs.write] Sui failed; orphan walrus blobId=${blobId}`, err);
    throw err instanceof GatewayError ? err : new GatewayError('SUI_TX_FAILED', String(err));
  }
  const db = openStore();
  db.prepare(
    `INSERT OR REPLACE INTO blobs (
      blob_id, space_id, object_id, kind, version, content_hash,
      mime_type, name, run_id, agent_id, input_hash, output_hash, created_at
     ) VALUES (?, ?, ?, 3, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
  ).run(
    blobId,
    spaceId,
    pointerId,
    version,
    contentHash,
    runId,
    agentId,
    inputHash,
    outputHash,
    Math.floor(Date.now() / 1000),
  );
  db.prepare('UPDATE spaces SET latest_version = MAX(latest_version, ?) WHERE space_id = ?').run(
    version,
    spaceId,
  );
  return {
    id: pointerId,
    spaceId,
    runId,
    agentId,
    inputHash,
    outputHash,
    walrusBlobId: blobId,
    createdAt: new Date().toISOString(),
  };
}

export function listProofLogs(input: { spaceId: string; caller: string }): ProofLog[] {
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
      `SELECT object_id, space_id, run_id, agent_id, input_hash, output_hash, blob_id, created_at
         FROM blobs
        WHERE space_id = ? AND kind = 3
        ORDER BY version DESC`,
    )
    .all(spaceId) as Array<{
      object_id: string; space_id: string; run_id: string; agent_id: string;
      input_hash: string; output_hash: string; blob_id: string; created_at: number;
    }>;
  return rows.map((r) => ({
    id: r.object_id,
    spaceId: r.space_id,
    runId: r.run_id,
    agentId: r.agent_id,
    inputHash: r.input_hash,
    outputHash: r.output_hash,
    walrusBlobId: r.blob_id,
    createdAt: new Date(r.created_at * 1000).toISOString(),
  }));
}
