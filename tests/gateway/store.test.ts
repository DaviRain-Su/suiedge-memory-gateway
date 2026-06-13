import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, closeStore, resetStoreForTest } from '../../src/lib/store';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'suiedge-store-'));
  path = join(dir, 'test.db');
  resetStoreForTest();
});

describe('migrations', () => {
  it('applies 0001_init on first open', () => {
    const db = openStore(path);
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as Array<{ name: string }>).map(
      (r) => r.name,
    );
    expect(tables).toContain('schema_version');
    expect(tables).toContain('spaces');
    expect(tables).toContain('blobs');
    expect(tables).toContain('policy_cache');
    const v = (db.prepare('SELECT version FROM schema_version').get() as { version: number }).version;
    expect(v).toBe(1);
  });

  it('is idempotent — reopens do not re-apply', () => {
    openStore(path);
    closeStore();
    openStore(path);
    const db = openStore(path);
    const versions = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number };
    expect(versions.n).toBe(1);
  });

  it('FKs enabled', () => {
    const db = openStore(path);
    const fk = db.pragma('foreign_keys', { simple: true });
    expect(fk).toBe(1);
  });
});
