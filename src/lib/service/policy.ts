/**
 * Service: AccessPolicy.
 *  - share: only the space owner may call; creates a new AccessPolicy
 *    on-chain via the Sui client, mirrors it in the SQLite policy_cache.
 *  - revoke: only the space owner may call; flips revoked=1 in the cache
 *    and calls Sui revokePolicy.
 *  - getPolicy: cache-first; on miss, returns null (the chain-fetch is a
 *    Day 6+ follow-up).
 */
import type Database from 'better-sqlite3';
import { openStore } from '../store';
import { GatewayError } from '../errors';
import { getSuiClient } from '../sui';
import type { AccessPolicy } from '../types';
import { getSpace } from './spaces';

export interface GetPolicyInput {
  spaceId: string;
  subject: string;
}

interface CachedPolicy {
  policy_id: string;
  space_id: string;
  subject: string;
  can_read: number;
  can_write: number;
  can_share: number;
  revoked: number;
  fetched_at: number;
}

export function getPolicy(input: GetPolicyInput): AccessPolicy | null {
  const { spaceId, subject } = input;
  const db = openStore();
  const row = db
    .prepare(
      `SELECT policy_id, space_id, subject, can_read, can_write, can_share, revoked, fetched_at
         FROM policy_cache
        WHERE space_id = ? AND subject = ?
        LIMIT 1`,
    )
    .get(spaceId, subject) as CachedPolicy | undefined;
  if (!row) return null;
  return {
    id: row.policy_id,
    spaceId: row.space_id,
    subject: row.subject,
    canRead: row.can_read === 1,
    canWrite: row.can_write === 1,
    canShare: row.can_share === 1,
    revoked: row.revoked === 1,
  };
}

export function listPolicies(input: { spaceId: string }): AccessPolicy[] {
  const { spaceId } = input;
  const db = openStore();
  const rows = db
    .prepare(
      `SELECT policy_id, space_id, subject, can_read, can_write, can_share, revoked, fetched_at
         FROM policy_cache
        WHERE space_id = ?
        ORDER BY subject ASC`,
    )
    .all(spaceId) as CachedPolicy[];
  return rows.map((r) => ({
    id: r.policy_id,
    spaceId: r.space_id,
    subject: r.subject,
    canRead: r.can_read === 1,
    canWrite: r.can_write === 1,
    canShare: r.can_share === 1,
    revoked: r.revoked === 1,
  }));
}

export async function share(input: {
  spaceId: string;
  caller: string;
  subject: string;
  canRead: boolean;
  canWrite: boolean;
  canShare: boolean;
}): Promise<AccessPolicy> {
  const { spaceId, caller, subject, canRead, canWrite, canShare } = input;
  if (!/^0x[0-9a-fA-F]{64}$/.test(subject)) {
    throw new GatewayError('BAD_REQUEST', 'subject must be 0x + 64 hex');
  }
  const space = getSpace(spaceId);
  if (!space) {
    throw new GatewayError('NOT_FOUND', `space ${spaceId} not found`);
  }
  if (space.owner !== caller) {
    throw new GatewayError('FORBIDDEN', 'only the space owner can share');
  }
  // If a policy already exists for this subject, supersede (revoke old + create new).
  const existing = getPolicy({ spaceId, subject });
  const sui = getSuiClient();
  const { policyId } = await sui.sharePolicy({
    spaceId,
    subject,
    canRead,
    canWrite,
    canShare,
    sender: caller,
  });
  const db = openStore();
  upsertPolicy(db, {
    policyId,
    spaceId,
    subject,
    canRead: canRead ? 1 : 0,
    canWrite: canWrite ? 1 : 0,
    canShare: canShare ? 1 : 0,
    revoked: 0,
    fetchedAt: Math.floor(Date.now() / 1000),
  });
  if (existing) {
    // The new policy supersedes the old; mark the old revoked in the cache.
    db.prepare('UPDATE policy_cache SET revoked = 1 WHERE policy_id = ?').run(existing.id);
  }
  return { id: policyId, spaceId, subject, canRead, canWrite, canShare, revoked: false };
}

export async function revoke(input: {
  spaceId: string;
  caller: string;
  policyId: string;
}): Promise<AccessPolicy> {
  const { spaceId, caller, policyId } = input;
  if (!/^0x[0-9a-fA-F]{64}$/.test(policyId)) {
    throw new GatewayError('BAD_REQUEST', 'policyId must be 0x + 64 hex');
  }
  const space = getSpace(spaceId);
  if (!space) {
    throw new GatewayError('NOT_FOUND', `space ${spaceId} not found`);
  }
  if (space.owner !== caller) {
    throw new GatewayError('FORBIDDEN', 'only the space owner can revoke');
  }
  const db = openStore();
  const row = db
    .prepare('SELECT subject FROM policy_cache WHERE policy_id = ?')
    .get(policyId) as { subject: string } | undefined;
  if (!row) {
    throw new GatewayError('NOT_FOUND', `policy ${policyId} not found in cache`);
  }
  const current = getPolicy({ spaceId, subject: row.subject });
  if (!current) {
    throw new GatewayError('NOT_FOUND', 'policy subject missing');
  }
  if (current.id !== policyId) {
    // The current policy for this subject is a different id — refuse to revoke
    // the old one when a newer one has been created.
    throw new GatewayError('CONFLICT', 'policy has been superseded by a newer one');
  }
  if (current.revoked) {
    throw new GatewayError('CONFLICT', 'policy already revoked');
  }
  const sui = getSuiClient();
  await sui.revokePolicy({ spaceId, policyId, sender: caller });
  db.prepare('UPDATE policy_cache SET revoked = 1, fetched_at = ? WHERE policy_id = ?').run(
    Math.floor(Date.now() / 1000),
    policyId,
  );
  return { ...current, revoked: true };
}

function upsertPolicy(
  db: Database.Database,
  row: {
    policyId: string; spaceId: string; subject: string;
    canRead: number; canWrite: number; canShare: number; revoked: number;
    fetchedAt: number;
  },
): void {
  db.prepare(
    `INSERT INTO policy_cache (
        policy_id, space_id, subject, can_read, can_write, can_share, revoked, fetched_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (policy_id) DO UPDATE SET
        can_read = excluded.can_read,
        can_write = excluded.can_write,
        can_share = excluded.can_share,
        revoked = excluded.revoked,
        fetched_at = excluded.fetched_at`,
  ).run(
    row.policyId, row.spaceId, row.subject, row.canRead, row.canWrite, row.canShare,
    row.revoked, row.fetchedAt,
  );
}
