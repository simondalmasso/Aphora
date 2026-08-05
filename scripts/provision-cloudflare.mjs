import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN ?? '').trim();
const googleClientId = String(process.env.GOOGLE_CLIENT_ID ?? '').trim();
const sessionKey = String(process.env.SESSION_SIGNING_KEY ?? '');
const sessionKeyPresent = sessionKey.length >= 32 || process.env.SESSION_SIGNING_KEY_PRESENT === 'true';
const operatorEmails = String(process.env.SOS_SF_OPERATOR_EMAILS ?? '').trim();
const messageBlocklist = process.env.MESSAGE_BLOCKLIST ?? '';
if (!accountId || !token) throw new Error('Cloudflare Actions credentials are required.');

const parsedOperatorEmails = operatorEmails.split(',').map((value) => value.trim()).filter(Boolean);
const operatorEmailsValid = parsedOperatorEmails.length > 0 && parsedOperatorEmails.every((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
const privateConfigurationReady = Boolean(googleClientId && sessionKeyPresent && operatorEmailsValid);

const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const details = Array.isArray(payload.errors)
      ? payload.errors.map((item) => ({ code: item?.code ?? null, message: String(item?.message ?? '').slice(0, 240) }))
      : [];
    const error = new Error(`Cloudflare API failed for ${path}: ${response.status}`);
    error.status = response.status;
    error.details = details;
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

async function ensureKV(name) {
  const result = await api('/storage/kv/namespaces?per_page=100');
  const namespaces = Array.isArray(result) ? result : [];
  const existing = namespaces.find((item) => item?.title === name);
  if (existing?.id) return existing.id;
  const created = await api('/storage/kv/namespaces', {
    method: 'POST',
    body: JSON.stringify({ title: name }),
  });
  if (!created?.id) throw new Error('KV namespace creation returned no ID.');
  return created.id;
}

const databaseName = 'sos-sf-private';
const namespaceName = 'sos-sf-private-reports';
let databaseId = '';
let namespaceId = '';
let resourcesReady = false;
let storageApiState;
let storageApiError = null;
try {
  databaseId = await ensureD1(databaseName);
  namespaceId = await ensureKV(namespaceName);
  resourcesReady = true;
  storageApiState = 'READY_D1_KV_FREE';
} catch (error) {
  if (error?.status !== 401 && error?.status !== 403) throw error;
  storageApiState = `UNAUTHORIZED_${error.status}`;
  storageApiError = { status: error.status, details: error.details ?? [] };
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
if (effectivePrivateReady) config.secrets = { required: ['SESSION_SIGNING_KEY', 'SOS_SF_OPERATOR_EMAILS'] };
else delete config.secrets;
if (resourcesReady) {
  config.d1_databases = [{
    binding: 'MESSAGES_DB',
    database_name: databaseName,
    database_id: databaseId,
    migrations_dir: 'migrations',
  }];
  config.kv_namespaces = [{ binding: 'REPORTS_KV', id: namespaceId }];
} else {
  delete config.d1_databases;
  delete config.kv_namespaces;
}
await writeFile('wrangler.generated.jsonc', `${JSON.stringify(config, null, 2)}\n`);

const workerSecrets = effectivePrivateReady
  ? {
      ...(sessionKey.length >= 32 ? { SESSION_SIGNING_KEY: sessionKey } : {}),
      SOS_SF_OPERATOR_EMAILS: operatorEmails,
      ...(messageBlocklist ? { MESSAGE_BLOCKLIST: messageBlocklist } : {}),
    }
  : {};
await writeFile('.worker-secrets.json', `${JSON.stringify(workerSecrets)}\n`, { mode: 0o600 });

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/current-run';
await mkdir(evidenceDir, { recursive: true });
await writeFile(join(evidenceDir, 'deployment-mode.json'), `${JSON.stringify({
  schemaVersion: '2.0',
  publicRuntime: 'ACTIVE',
  privateRuntime: effectivePrivateReady ? 'ACTIVE' : 'FAIL_CLOSED_PENDING_PROTECTED_CONFIGURATION_OR_STORAGE_AUTHORITY',
  photoStorage: 'WORKERS_KV_FREE',
  photoStorageNamespaceName: namespaceName,
  resourcesReady,
  storageApiState,
  storageApiError,
  protectedConfigurationNamesPresent: {
    GOOGLE_CLIENT_ID: Boolean(googleClientId),
    SESSION_SIGNING_KEY: sessionKeyPresent,
    SOS_SF_OPERATOR_EMAILS: operatorEmailsValid,
  },
  valuesExposed: false,
  generatedAt: new Date().toISOString(),
}, null, 2)}\n`);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `d1_database_id=${databaseId}\nkv_namespace_id=${resourcesReady ? namespaceId : ''}\nconfig=wrangler.generated.jsonc\nprivate_ready=${effectivePrivateReady ? 'true' : 'false'}\nresources_ready=${resourcesReady ? 'true' : 'false'}\n`,
  );
}
