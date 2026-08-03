CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_sub TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED','UNKNOWN')),
  unread_user INTEGER NOT NULL DEFAULT 0,
  unread_operator INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_open_user ON conversations(user_sub) WHERE status != 'CLOSED';
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 800),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 3),
  status TEXT NOT NULL CHECK (status IN ('SENT','DELIVERED_TO_SERVICE','READ_BY_OPERATOR','FAILED','UNKNOWN')),
  idempotency_key TEXT NOT NULL,
  commitment TEXT,
  provenance TEXT NOT NULL,
  failure_reason TEXT,
  verified_operator INTEGER NOT NULL DEFAULT 0,
  UNIQUE(conversation_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_expiry ON messages(expires_at);

CREATE TABLE IF NOT EXISTS rate_events (actor_id TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_rate_events_actor_time ON rate_events(actor_id, at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events(at DESC);
