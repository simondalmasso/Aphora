PRAGMA foreign_keys = ON;

ALTER TABLE auth_sessions ADD COLUMN csrf_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE auth_sessions ADD COLUMN last_seen_at TEXT;

CREATE TABLE IF NOT EXISTS report_photo_access_grants (
  token_hash TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES report_photos(id) ON DELETE CASCADE,
  operator_sub TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS report_photo_access_grants_expiry_idx
  ON report_photo_access_grants(expires_at, used_at);
CREATE INDEX IF NOT EXISTS report_photo_access_grants_operator_idx
  ON report_photo_access_grants(operator_sub, created_at DESC);
