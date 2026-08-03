PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('AUTHENTICATED_USER','VERIFIED_OPERATOR','ADMIN')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  rotated_from TEXT
);
CREATE INDEX IF NOT EXISTS auth_sessions_sub_idx ON auth_sessions(sub,expires_at DESC);
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx ON auth_sessions(id,expires_at,revoked_at);

CREATE TABLE IF NOT EXISTS rate_windows (
  actor_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(actor_id,scope,window_start)
);
CREATE INDEX IF NOT EXISTS rate_windows_cleanup_idx ON rate_windows(updated_at);

ALTER TABLE reports ADD COLUMN moderation_flags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE reports ADD COLUMN operator_note TEXT;
ALTER TABLE reports ADD COLUMN redacted_description TEXT;
ALTER TABLE reports ADD COLUMN last_reviewed_by TEXT;
ALTER TABLE reports ADD COLUMN last_reviewed_at TEXT;

ALTER TABLE report_photos ADD COLUMN review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','APPROVED','REDACTED','REJECTED'));
ALTER TABLE report_photos ADD COLUMN review_note TEXT;
ALTER TABLE report_photos ADD COLUMN reviewed_by TEXT;
ALTER TABLE report_photos ADD COLUMN reviewed_at TEXT;

CREATE TABLE IF NOT EXISTS report_redactions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_sub TEXT NOT NULL,
  field TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS report_redactions_report_idx ON report_redactions(report_id,created_at);
