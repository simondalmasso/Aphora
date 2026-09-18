import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtime=fs.readFileSync(new URL('../src/worker/runtime.js',import.meta.url),'utf8');
const ingestion=fs.readFileSync(new URL('../src/worker/ingestion.js',import.meta.url),'utf8');
const national=fs.readFileSync(new URL('../src/worker/national.js',import.meta.url),'utf8');

// Current D1 insights (APHORA-only, sos-sf-hazard) showed this OR predicate scan
// averaging hundreds of rows per cron invocation. The fixed query must expose
// two provider-bounded indexable branches rather than one OR over provider_id.
test('REBUILD_EVENTS_USES_PROVIDER_BOUNDED_INDEXABLE_READS',()=>{
  assert.doesNotMatch(runtime,/WHERE \(expires_at IS NULL OR expires_at>\?\) AND \(\(provider_id='smn-cap' AND fetched_at>=\?\) OR \(provider_id!='smn-cap' AND fetched_at>=\?\)\)/);
  assert.match(runtime,/provider_id='smn-cap'/);
  assert.match(runtime,/provider_id IN \('ina','inpres','usgs-earthquake','nasa-eonet','nasa-gpm'\)/);
});

test('HAZARD_RECORD_PROVIDER_TIME_INDEX_EXISTS',()=>{
  const migrations=fs.readdirSync(new URL('../migrations/',import.meta.url)).sort().map(f=>fs.readFileSync(new URL(`../migrations/${f}`,import.meta.url),'utf8')).join('\n');
  assert.match(migrations,/CREATE INDEX IF NOT EXISTS hazard_records_provider_fetched ON hazard_records\(provider_id,fetched_at\)/);
});

// Retention ran every cron cycle and repeatedly scanned the old provider_jobs
// tail even when nothing was deletable. Cleanup must be due-gated from durable
// runtime state so normal cycles do not repeat the same retention scans.
test('RETENTION_IS_DUE_GATED_NOT_EVERY_CRON',()=>{
  assert.match(ingestion,/cleanup:retention/);
  assert.match(ingestion,/RETENTION_INTERVAL_MS/);
});

// Health already intentionally avoids COUNT(*) in the active national handler.
// Lock that in because COUNT telemetry was a historical scan amplifier.
test('HEALTH_REMAINS_BOUNDED_NO_FULL_TABLE_COUNTS',()=>{
  const health=national.slice(national.indexOf('export async function enhancedHealth'));
  assert.doesNotMatch(health,/COUNT\s*\(\s*\*\s*\)/i);
  assert.match(health,/countTelemetryMode:'BOUNDED_NO_FULL_TABLE_COUNTS'/);
});

// Overview/events reads must remain bounded and indexed by lifecycle+last_changed_at.
test('PUBLIC_EVENT_READS_REMAIN_BOUNDED',()=>{
  assert.match(national,/WHERE lifecycle='ACTIVE' ORDER BY last_changed_at DESC LIMIT 500/);
  assert.match(national,/WHERE event_id=\? LIMIT 1/);
});

test('REBUILD_SPLIT_QUERY_PRESERVES_GLOBAL_TOP_500_SEMANTICS',()=>{
  assert.match(runtime,/SELECT payload_json,fetched_at FROM hazard_records WHERE provider_id='smn-cap'/);
  assert.match(runtime,/SELECT payload_json,fetched_at FROM hazard_records WHERE provider_id IN/);
  assert.match(runtime,/\[\.\.\.smnRows,\.\.\.otherRows\]\.sort\([^\n]+\)\.slice\(0,500\)/);
});
