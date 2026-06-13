/**
 * SQLite store wrapper. Singleton Database with migration runner.
 * Use openStore() everywhere; tests pass a temp path.
 */
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config';

let _db: Database.Database | null = null;

export function openStore(overridePath?: string): Database.Database {
  if (_db) return _db;
  const path = overridePath ?? config().dbPath;
  _db = new Database(path);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  runMigrations(_db);
  return _db;
}

export function closeStore(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY,
    applied_at  INTEGER NOT NULL
  )`);
  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_version').all() as Array<{ version: number }>).map(
      (r) => r.version,
    ),
  );
  const migrationsDir = resolve(process.cwd(), 'migrations');
  let files: string[];
  try {
    files = readdirSync(migrationsDir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  } catch {
    return; // No migrations dir (e.g. test envs that pre-create schema)
  }
  const now = Math.floor(Date.now() / 1000);
  for (const f of files) {
    const m = f.match(/^(\d{4})_/);
    if (!m) continue;
    const version = Number(m[1]);
    if (applied.has(version)) continue;
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)').run(
        version,
        now,
      );
    })();
  }
}

/** Drop and recreate the store. Tests only. */
export function resetStoreForTest(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
