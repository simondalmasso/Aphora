import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN ?? '').trim();
const ownerVisualConfirmation = String(process.env.OWNER_VISUAL_CONFIRMATION ?? '').trim();
const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/current-run';
const workerName = 'sos-sf';
if (!accountId || !token) throw new Error('CLOUDFLARE_ZERO_COST_CREDENTIALS_REQUIRED');
if (ownerVisualConfirmation !== 'WORKERS_FREE_CONFIRMED') {
  throw new Error('OWNER_VISUAL_WORKERS_FREE_CONFIRMATION_REQUIRED');
}

const apiBase = 'https://api.cloudflare.com/client/v4';
async function request(path) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  return {
    path,
    method: 'GET',
    httpStatus: response.status,
    success: response.ok && payload.success !== false,
    result: payload.result ?? null,
    errors: Array.isArray(payload.errors)
      ? payload.errors.map((item) => ({ code: item?.code ?? null, message: String(item?.message ?? '').slice(0, 240) }))
      : [],
  };
}

const tokenState = await request('/user/tokens/verify');
const accountState = await request(`/accounts/${encodeURIComponent(accountId)}`);
const d1State = await request(`/accounts/${encodeURIComponent(accountId)}/d1/database?per_page=1`);
const kvState = await request(`/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces?per_page=100`);
const accountSettings = await request(`/accounts/${encodeURIComponent(accountId)}/workers/account-settings`);
const workerSettings = await request(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/settings`);

const usageModel = String(accountSettings.result?.default_usage_model ?? '').trim().toLowerCase();
const workerUsageModel = workerSettings.httpStatus === 404
  ? ''
  : String(workerSettings.result?.usage_model ?? '').trim().toLowerCase();
const namedNamespaces = Array.isArray(kvState.result)
  ? kvState.result.map((item) => ({ idPresent: Boolean(item?.id), title: String(item?.title ?? '') }))
  : [];

const sourceFiles = [
  'wrangler.jsonc',
  'scripts/provision-cloudflare.mjs',
  'src/worker/reports.ts',
  'src/worker/router.ts',
];
const forbiddenPatterns = [
  ['REPORTS_BUCKET', /REPORTS_BUCKET/],
  ['R2_BINDING', /r2_buckets/],
  ['R2_API', /\/r2\//],
];
const forbiddenSourceMatches = [];
for (const file of sourceFiles) {
  const content = await readFile(file, 'utf8');
  for (const [name, pattern] of forbiddenPatterns) {
    if (pattern.test(content)) forbiddenSourceMatches.push({ file, name });
  }
}

const evaluation = {
  ownerVisualWorkersFreeConfirmed: true,
  tokenActive: tokenState.httpStatus === 200 && tokenState.success && tokenState.result?.status === 'active',
  accountReachable: accountState.httpStatus === 200 && accountState.success,
  d1Authority: d1State.httpStatus === 200 && d1State.success,
  kvAuthority: kvState.httpStatus === 200 && kvState.success,
  noR2OperationalSource: forbiddenSourceMatches.length === 0,
  billingEndpointsQueried: false,
  mutatingRequests: 0,
};
evaluation.zeroCostReady = evaluation.ownerVisualWorkersFreeConfirmed
  && evaluation.tokenActive
  && evaluation.accountReachable
  && evaluation.d1Authority
  && evaluation.kvAuthority
  && evaluation.noR2OperationalSource
  && !evaluation.billingEndpointsQueried
  && evaluation.mutatingRequests === 0;

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  orderId: 'SOS-SF-OWNER-V3-FULL-COMPLETION-014',
  budgetUsd: 0,
  storage: 'WORKERS_KV_FREE',
  ownerVisualConfirmation,
  evaluation,
  namespaceInventory: { count: namedNamespaces.length, namespaces: namedNamespaces },
  forbiddenSourceMatches,
  probes: {
    token: { method: tokenState.method, httpStatus: tokenState.httpStatus, success: tokenState.success, status: tokenState.result?.status ?? null, errors: tokenState.errors },
    account: { method: accountState.method, httpStatus: accountState.httpStatus, success: accountState.success, errors: accountState.errors },
    d1: { method: d1State.method, httpStatus: d1State.httpStatus, success: d1State.success, errors: d1State.errors },
    kv: { method: kvState.method, httpStatus: kvState.httpStatus, success: kvState.success, errors: kvState.errors },
    workersAccountSettingsReferenceOnly: {
      method: accountSettings.method,
      httpStatus: accountSettings.httpStatus,
      success: accountSettings.success,
      defaultUsageModel: usageModel || null,
      usedForAuthorization: false,
      errors: accountSettings.errors,
    },
    workerSettingsReferenceOnly: {
      method: workerSettings.method,
      httpStatus: workerSettings.httpStatus,
      success: workerSettings.success,
      usageModel: workerUsageModel || null,
      usedForAuthorization: false,
      errors: workerSettings.errors,
    },
  },
  billingReadWrite: 'PROHIBITED',
  r2: 'PROHIBITED',
  valuesExposed: false,
};

await mkdir(evidenceDir, { recursive: true });
await writeFile(join(evidenceDir, 'cloudflare-zero-cost-gate.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ evaluation, referenceUsageModels: { account: usageModel || null, worker: workerUsageModel || null }, valuesExposed: false }));
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `zero_cost_ready=${evaluation.zeroCostReady ? 'true' : 'false'}\n`);
}
if (!evaluation.zeroCostReady) {
  const reasons = Object.entries(evaluation)
    .filter(([key, value]) => key !== 'zeroCostReady' && (value === false || (key === 'mutatingRequests' && value !== 0)))
    .map(([key]) => key);
  throw new Error(`ZERO_COST_GATE_FAILED:${reasons.join(',') || 'UNKNOWN'}`);
}
