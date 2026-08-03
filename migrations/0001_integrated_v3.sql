PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_sub TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED')),
  unread_user INTEGER NOT NULL DEFAULT 0,
  unread_operator INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_open_user_idx ON conversations(user_sub) WHERE status != 'CLOSED';
CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 280),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority BETWEEN 0 AND 3),
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  commitment TEXT,
  provenance TEXT NOT NULL,
  failure_reason TEXT,
  verified_operator INTEGER NOT NULL DEFAULT 0 CHECK (verified_operator IN (0,1)),
  UNIQUE(conversation_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS messages_expiry_idx ON messages(expires_at);

CREATE TABLE IF NOT EXISTS rate_events (
  actor_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_events_actor_idx ON rate_events(actor_id,at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  at TEXT NOT NULL,
  detail_json TEXT
);
CREATE INDEX IF NOT EXISTS audit_events_at_idx ON audit_events(at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_sub TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 500),
  location_label TEXT,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  location_captured_at TEXT,
  exact_location_consent INTEGER NOT NULL DEFAULT 0 CHECK (exact_location_consent IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('NEW','UNDER_REVIEW','REJECTED','ESCALATION_READY','FORWARDED','CLOSED')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  forwarded_destination TEXT,
  forwarded_reference TEXT,
  forwarded_at TEXT,
  forwarded_by TEXT,
  UNIQUE(reporter_sub,idempotency_key)
);
CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports(status,created_at DESC);
CREATE INDEX IF NOT EXISTS reports_owner_idx ON reports(reporter_sub,created_at DESC);
CREATE INDEX IF NOT EXISTS reports_expiry_idx ON reports(expires_at);

CREATE TABLE IF NOT EXISTS report_photos (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 4194304),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS report_photos_report_idx ON report_photos(report_id);

CREATE TABLE IF NOT EXISTS report_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  actor_sub TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS report_events_report_idx ON report_events(report_id,created_at);
