PRAGMA foreign_keys = ON;

ALTER TABLE report_photos
  ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'KV'
  CHECK (storage_backend = 'KV');

CREATE INDEX IF NOT EXISTS report_photos_expiry_idx
  ON report_photos(expires_at, id);
