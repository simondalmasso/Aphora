import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';

const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020b-final-corrective';
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const baselineD1 = '64f70d4b-a65f-4902-8bc7-10480f483284';
const baselineKv = '1acad376c6a74ef4a4cea4fd95ace79a';
if (!accountId || !token) throw new Error('CLOUDFLARE_CREDENTIALS_REQUIRED');
await mkdir(EVIDENCE, { recursive: true });

async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(40_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(`CLOUDFLARE_GET_FAILED:${path}:${response.status}:${JSON.stringify(payload.errors || [])}`);
  return payload.result;
}
function list(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}
function nonBlank(value) {
  const text = String(value || '').trim();
  return text || undefined;
}

const base = `/accounts/${encodeURIComponent(accountId)}`;
const [d1Raw, kvRaw, settings, versionsRaw] = await Promise.all([
  cf(`${base}/d1/database?per_page=100`),
  cf(`${base}/storage/kv/namespaces?per_page=100`),
  cf(`${base}/workers/scripts/sos-sf/settings`),
  cf(`${base}/workers/scripts/sos-sf/versions?per_page=20`),
]);
const d1 = list(d1Raw).find((item) => item?.name === 'sos-sf-private');
const kv = list(kvRaw).find((item) => item?.title === 'sos-sf-private-reports');
const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
if (d1?.uuid !== baselineD1) throw new Error(`D1_BASELINE_DRIFT:${d1?.uuid || 'missing'}`);
if (kv?.id !== baselineKv) throw new Error(`KV_BASELINE_DRIFT:${kv?.id || 'missing'}`);
if (bindings.some((item) => /r2/i.test(String(item?.type || '')) || /R2/i.test(String(item?.name || '')))) throw new Error('R2_PRESENT_BEFORE_DEPLOY');
const beforeVersionIds = new Set(list(versionsRaw).map((item) => item?.id || item?.version_id).filter(Boolean));

const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
const vars = { PRIVATE_MESSAGING_ENABLED: 'true' };
for (const [name, value] of Object.entries({
  GOOGLE_CLIENT_ID: nonBlank(process.env.GOOGLE_CLIENT_ID),
  REPORT_RETENTION_DAYS: nonBlank(process.env.REPORT_RETENTION_DAYS),
  INA_WATERML_PARANA_URL: nonBlank(process.env.INA_WATERML_PARANA_URL),
  INA_WATERML_SALADO_URL: nonBlank(process.env.INA_WATERML_SALADO_URL),
  PORTS_HYDROMETER_JSON_URL: nonBlank(process.env.PORTS_HYDROMETER_JSON_URL),
  SMN_OBSERVATIONS_JSON_URL: nonBlank(process.env.SMN_OBSERVATIONS_JSON_URL),
  SMN_ALERTS_JSON_URL: nonBlank(process.env.SMN_ALERTS_JSON_URL),
})) {
  if (value !== undefined) vars[name] = value;
}
config.vars = vars;
config.d1_databases = [{ binding: 'MESSAGES_DB', database_name: 'sos-sf-private', database_id: baselineD1, migrations_dir: 'migrations' }];
config.kv_namespaces = [{ binding: 'REPORTS_KV', id: baselineKv }];
delete config.r2_buckets;
await writeFile('.wrangler.corrective.jsonc', `${JSON.stringify(config, null, 2)}\n`);
await writeFile(`${EVIDENCE}/deploy-preflight.json`, `${JSON.stringify({
  d1DatabaseId: d1.uuid,
  kvNamespaceId: kv.id,
  r2Present: false,
  configuredPlainVarNames: Object.keys(vars).sort(),
  blankOptionalVarsSerialized: Object.entries(vars).some(([name, value]) => /_URL$/.test(name) && String(value).trim() === ''),
  existingBindingTypes: bindings.map((item) => ({ name: item?.name || null, type: item?.type || null })),
}, null, 2)}\n`);
if (Object.entries(vars).some(([name, value]) => /_URL$/.test(name) && String(value).trim() === '')) throw new Error('BLANK_OPTIONAL_URL_VAR_WOULD_BE_SERIALIZED');

const deployed = spawnSync('npx', ['wrangler', 'deploy', '--config', '.wrangler.corrective.jsonc'], { encoding: 'utf8', env: process.env });
const combined = `${deployed.stdout || ''}\n${deployed.stderr || ''}`;
await writeFile(`${EVIDENCE}/corrective-deploy.log`, combined);
await rm('.wrangler.corrective.jsonc', { force: true });
if (deployed.status !== 0) throw new Error(`CORRECTIVE_DEPLOY_FAILED:${deployed.status}`);

let versionId = combined.match(/(?:Current\s+)?Version ID:\s*([0-9a-f-]{36})/i)?.[1] || null;
for (let attempt = 1; attempt <= 8 && !versionId; attempt += 1) {
  const versions = list(await cf(`${base}/workers/scripts/sos-sf/versions?per_page=20`));
  const candidate = versions.find((item) => {
    const id = item?.id || item?.version_id;
    return id && !beforeVersionIds.has(id);
  });
  versionId = candidate?.id || candidate?.version_id || null;
  if (!versionId) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
}
if (!versionId) throw new Error('CORRECTIVE_DEPLOYMENT_VERSION_ID_UNRESOLVED');
await writeFile(`${EVIDENCE}/corrective-deployment.json`, `${JSON.stringify({
  deployCommandCount: 1,
  cloudflareMutationCount: 1,
  deploymentVersionId: versionId,
  d1DatabaseId: baselineD1,
  kvNamespaceId: baselineKv,
  r2State: 'ABSENT',
}, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `deployment_version_id=${versionId}\n`, { flag: 'a' });
