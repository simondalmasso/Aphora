import { readFile, writeFile, appendFile } from 'node:fs/promises';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const sessionKey = process.env.SESSION_SIGNING_KEY;
if (!accountId || !token) throw new Error('Cloudflare Actions credentials are required.');
if (!googleClientId || !sessionKey || sessionKey.length < 32) throw new Error('Protected Google/session configuration is required before deployment.');

const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(`Cloudflare API failed for ${path}: ${response.status}`);
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
const databaseId = await ensureD1(databaseName);
await ensureR2(bucketName);

const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
config.vars = {
  ...(config.vars ?? {}),
  PRIVATE_MESSAGING_ENABLED: 'true',
  GOOGLE_CLIENT_ID: googleClientId,
  SOS_SF_OPERATOR_EMAILS: process.env.SOS_SF_OPERATOR_EMAILS ?? '',
  MESSAGE_BLOCKLIST: process.env.MESSAGE_BLOCKLIST ?? '',
  REPORT_RETENTION_DAYS: process.env.REPORT_RETENTION_DAYS ?? '30',
  INA_WATERML_PARANA_URL: process.env.INA_WATERML_PARANA_URL ?? '',
  INA_WATERML_SALADO_URL: process.env.INA_WATERML_SALADO_URL ?? '',
  PORTS_HYDROMETER_JSON_URL: process.env.PORTS_HYDROMETER_JSON_URL ?? '',
  SMN_OBSERVATIONS_JSON_URL: process.env.SMN_OBSERVATIONS_JSON_URL ?? '',
  SMN_ALERTS_JSON_URL: process.env.SMN_ALERTS_JSON_URL ?? '',
};
config.d1_databases = [{ binding: 'MESSAGES_DB', database_name: databaseName, database_id: databaseId, migrations_dir: 'migrations' }];
config.r2_buckets = [{ binding: 'REPORTS_BUCKET', bucket_name: bucketName }];
await writeFile('wrangler.generated.jsonc', `${JSON.stringify(config, null, 2)}\n`);
await writeFile('.worker-secrets.json', `${JSON.stringify({ SESSION_SIGNING_KEY: sessionKey })}\n`, { mode: 0o600 });
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `d1_database_id=${databaseId}\nr2_bucket=${bucketName}\nconfig=wrangler.generated.jsonc\n`);
