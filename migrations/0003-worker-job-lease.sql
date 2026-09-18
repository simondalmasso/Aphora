ALTER TABLE provider_jobs ADD COLUMN claimed_at TEXT;
ALTER TABLE provider_jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE provider_jobs ADD COLUMN runtime_recovery_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE provider_jobs ADD COLUMN last_runtime_recovery_at TEXT;
CREATE INDEX IF NOT EXISTS provider_jobs_provider_nonterminal ON provider_jobs(provider_id,status,next_attempt_at);
CREATE INDEX IF NOT EXISTS provider_jobs_running_lease ON provider_jobs(status,lease_expires_at);
UPDATE provider_jobs SET claimed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), lease_expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+2 minutes') WHERE status='RUNNING' AND (claimed_at IS NULL OR lease_expires_at IS NULL);
DROP TABLE IF EXISTS __order031_probe;
