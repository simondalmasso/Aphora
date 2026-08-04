import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const googleClientId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
const sessionKey = String(process.env.SESSION_SIGNING_KEY ?? '');
const operatorEmails = String(process.env.SOS_SF_OPERATOR_EMAILS ?? '').trim();
const messageBlocklist = process.env.MESSAGE_BLOCKLIST ?? '';
if (!accountId || !token) throw new Error('Cloudflare Actions credentials are required.');

const parsedOperatorEmails = operatorEmails.split(',').map((value) => value.trim()).filter(Boolean);
const operatorEmailsValid = parsedOperatorEmails.length > 0 && parsedOperatorEmails.every((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
const privateConfigurationReady = Boolean(googleClientId && sessionKey.length >= 32 && operatorEmailsValid);

const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(`Cloudflare API failed for ${path}: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

async function ensureD1(name) {
  const result = await api('/d1/database?per_page=100');
  const databases = Array.isArray(result) ? result : [];
  const existing = databases.find((item) => item?.name === name);
  if (existing?.uuid) return existing.uuid;
  const created = await api('/d1/database', { method: 'POST', body: JSON.stringify({ name }) });
  if (!created?.uuid) throw new Error('D1 creation returned no UUID.');
  return created.uuid;
}

async function ensureR2(name) {
  const result = await api('/r2/buckets');
  const buckets = Array.isArray(result) ? result : Array.isArray(result?.buckets) ? result.buckets : [];
  if (buckets.some((item) => item?.name === name)) return name;
  await api(`/r2/buckets/${encodeURIComponent(name)}`, { method: 'PUT', body: '{}' });
  return name;
}

const databaseName = 'sos-sf-private';
const bucketName = 'sos-sf-private-reports';
let databaseId = '';
let resourcesReady = false;
let storageApiState = 'NOT_ATTEMPTED';
try {
  databaseId = await ensureD1(databaseName);
  await ensureR2(bucketName);
  resourcesReady = true;
  storageApiState = 'READY';
} catch (error) {
  if (error?.status !== 401 && error?.status !== 403) throw error;
  storageApiState = `UNAUTHORIZED_${error.status}`;
}

const effectivePrivateReady = privateConfigurationReady && resourcesReady;
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.vars = {
  ...(config.vars ?? {}),
  PRIVATE_MESSAGING_ENABLED: effectivePrivateReady ? 'true' : 'false',
  REPORT_RETENTION_DAYS: process.env.REPORT_RETENTION_DAYS || '30',
  INA_WATERML_PARANA_URL: process.env.INA_WATERML_PARANA_URL ?? '',
  INA_WATERML_SALADO_URL: process.env.INA_WATERML_SALADO_URL ?? '',
  PORTS_HYDROMETER_JSON_URL: process.env.PORTS_HYDROMETER_JSON_URL ?? '',
  SMN_OBSERVATIONS_JSON_URL: process.env.SMN_OBSERVATIONS_JSON_URL ?? '',
  SMN_ALERTS_JSON_URL: process.env.SMN_ALERTS_JSON_URL ?? '',
};
if (effectivePrivateReady) config.vars.GOOGLE_CLIENT_ID = googleClientId;
else delete config.vars.GOOGLE_CLIENT_ID;
if (resourcesReady) {
  config.d1_databases = [{ binding: 'MESSAGES_DB', database_name: databaseName, database_id: databaseId, migrations_dir: 'migrations' }];
  config.r2_buckets = [{ binding: 'REPORTS_BUCKET', bucket_name: bucketName }];
} else {
  delete config.d1_databases;
  delete config.r2_buckets;
}
await writeFile('wrangler.generated.jsonc', `${JSON.stringify(config, null, 2)}\n`);

const workerSecrets = effectivePrivateReady
  ? { SESSION_SIGNING_KEY: sessionKey, SOS_SF_OPERATOR_EMAILS: operatorEmails, MESSAGE_BLOCKLIST: messageBlocklist }
  : {};
await writeFile('.worker-secrets.json', `${JSON.stringify(workerSecrets)}\n`, { mode: 0o600 });

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/current-run';
await mkdir(evidenceDir, { recursive: true });
await writeFile(join(evidenceDir, 'deployment-mode.json'), `${JSON.stringify({
  schemaVersion: '1.0',
  publicRuntime: 'ACTIVE',
  privateRuntime: effectivePrivateReady ? 'ACTIVE' : 'FAIL_CLOSED_PENDING_PROTECTED_CONFIGURATION_OR_STORAGE_AUTHORITY',
  resourcesReady,
  storageApiState,
  protectedConfigurationNamesPresent: {
    GOOGLE_CLIENT_ID: Boolean(googleClientId),
    SESSION_SIGNING_KEY: sessionKey.length >= 32,
    SOS_SF_OPERATOR_EMAILS: operatorEmailsValid,
  },
  valuesExposed: false,
  generatedAt: new Date().toISOString(),
}, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `d1_database_id=${databaseId}\nr2_bucket=${resourcesReady ? bucketName : ''}\nconfig=wrangler.generated.jsonc\nprivate_ready=${effectivePrivateReady ? 'true' : 'false'}\nresources_ready=${resourcesReady ? 'true' : 'false'}\n`);
