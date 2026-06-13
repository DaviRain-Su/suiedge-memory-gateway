PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spaces (
  space_id       TEXT PRIMARY KEY,
  owner          TEXT NOT NULL,
  name           TEXT NOT NULL,
  latest_version INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  CHECK (length(space_id) > 0),
  CHECK (length(owner) > 0)
);

CREATE TABLE IF NOT EXISTS blobs (
  blob_id       TEXT PRIMARY KEY,
  space_id      TEXT NOT NULL,
  object_id     TEXT NOT NULL,
  kind          INTEGER NOT NULL,
  version       INTEGER NOT NULL,
  content_hash  TEXT NOT NULL,
  mime_type     TEXT,
  name          TEXT,
  run_id        TEXT,
  agent_id      TEXT,
  input_hash    TEXT,
  output_hash   TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  CHECK (kind IN (1, 2, 3)),
  CHECK (version >= 0)
);

CREATE INDEX IF NOT EXISTS blobs_by_space        ON blobs(space_id, version);
CREATE INDEX IF NOT EXISTS blobs_by_space_kind   ON blobs(space_id, kind, version);
CREATE INDEX IF NOT EXISTS blobs_by_blob         ON blobs(blob_id);
CREATE UNIQUE INDEX IF NOT EXISTS blobs_uniq_version ON blobs(space_id, kind, version);

CREATE TABLE IF NOT EXISTS policy_cache (
  policy_id    TEXT PRIMARY KEY,
  space_id     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  can_read     INTEGER NOT NULL,
  can_write    INTEGER NOT NULL,
  can_share    INTEGER NOT NULL,
  revoked      INTEGER NOT NULL,
  fetched_at   INTEGER NOT NULL,
  UNIQUE (space_id, subject),
  FOREIGN KEY (space_id) REFERENCES spaces(space_id) ON DELETE CASCADE,
  CHECK (can_read IN (0, 1)),
  CHECK (can_write IN (0, 1)),
  CHECK (can_share IN (0, 1)),
  CHECK (revoked IN (0, 1))
);

CREATE INDEX IF NOT EXISTS policy_cache_by_space ON policy_cache(space_id);

INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, strftime('%s', 'now'));
