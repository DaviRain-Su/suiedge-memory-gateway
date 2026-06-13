/**
 * Service: AgentSpace CRUD. createSpace is the only mutating operation
 * in the spaces service.
 */
import type Database from 'better-sqlite3';
import { openStore } from '../store.js';
import { GatewayError } from '../errors.js';
import { getSuiClient } from '../sui.js';
import type { AgentSpace } from '../types.js';

interface CreateSpaceInput {
  owner: string;
  name: string;
}

export async function createSpace(input: CreateSpaceInput): Promise<AgentSpace> {
  const name = (input.name ?? '').trim();
  if (name.length === 0 || name.length > 64) {
    throw new GatewayError('BAD_REQUEST', 'name must be 1..64 chars');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.owner)) {
    throw new GatewayError('BAD_REQUEST', 'owner must be 0x + 64 hex');
  }
  const sui = getSuiClient();
  const { spaceId, digest } = await sui.createSpace({ name, sender: input.owner });
  const now = Math.floor(Date.now() / 1000);
  const db = openStore();
  insertSpace(db, {
    spaceId,
    owner: input.owner,
    name,
    latestVersion: 0,
    createdAt: now,
  });
  return {
    id: spaceId,
    owner: input.owner,
    name,
    version: 0,
    activeMemoryRoot: '',
  };
}

export function listSpaces(input: { owner: string }): AgentSpace[] {
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.owner)) {
    throw new GatewayError('BAD_REQUEST', 'owner must be 0x + 64 hex');
  }
  const db = openStore();
  const rows = db
    .prepare('SELECT space_id, owner, name, latest_version FROM spaces WHERE owner = ? ORDER BY created_at DESC')
    .all(input.owner) as Array<{ space_id: string; owner: string; name: string; latest_version: number }>;
  return rows.map((r) => ({
    id: r.space_id,
    owner: r.owner,
    name: r.name,
    version: r.latest_version,
    activeMemoryRoot: '',
  }));
}

export function getSpace(spaceId: string): AgentSpace | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(spaceId)) {
    return null;
  }
  const db = openStore();
  const row = db
    .prepare('SELECT space_id, owner, name, latest_version FROM spaces WHERE space_id = ?')
    .get(spaceId) as { space_id: string; owner: string; name: string; latest_version: number } | undefined;
  if (!row) return null;
  return {
    id: row.space_id,
    owner: row.owner,
    name: row.name,
    version: row.latest_version,
    activeMemoryRoot: '',
  };
}

function insertSpace(
  db: Database.Database,
  row: { spaceId: string; owner: string; name: string; latestVersion: number; createdAt: number },
): void {
  db.prepare(
    `INSERT INTO spaces (space_id, owner, name, latest_version, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (space_id) DO NOTHING`,
  ).run(row.spaceId, row.owner, row.name, row.latestVersion, row.createdAt);
}
