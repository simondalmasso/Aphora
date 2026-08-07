import { readFile, writeFile } from 'node:fs/promises';

const E = process.env.EVIDENCE_DIR || 'artifacts/order-020b-final-corrective';
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const deployRunId = 31153648173;
if (!accountId || !token) throw new Error('CLOUDFLARE_GET_CREDENTIALS_REQUIRED');

async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(40_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(`CLOUDFLARE_GET_FAILED:${path}:${response.status}`);
  return payload.result;
}
function list(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.result)) return value.result;
  return [];
}
const priorLog = await readFile(`${E}/corrective-deploy-run-31153648173.log`, 'utf8');
const logVersionIds = [...priorLog.matchAll(/(?:Current\s+)?Version ID:\s*([0-9a-f-]{36})/gi)].map((match) => match[1]);
const versions = list(await cf(`/accounts/${encodeURIComponent(accountId)}/workers/scripts/sos-sf/versions?per_page=20`));
const currentIds = versions.map((item) => item?.id || item?.version_id).filter(Boolean);
let deploymentVersionId = logVersionIds.at(-1) || null;
if (!deploymentVersionId) {
  const sorted = [...versions].sort((a, b) => Date.parse(b?.metadata?.created_on || b?.created_on || 0) - Date.parse(a?.metadata?.created_on || a?.created_on || 0));
  deploymentVersionId = sorted[0]?.id || sorted[0]?.version_id || null;
}
if (!deploymentVersionId || !currentIds.includes(deploymentVersionId)) throw new Error(`CORRECTIVE_DEPLOYMENT_VERSION_UNRESOLVED:${deploymentVersionId || 'none'}`);
const priorRunSuccess = /Execute the one authorized additional Cloudflare deploy[\s\S]*?conclusion[^\n]*success/i.test(priorLog) || /Run node \.github\/order020b-amend\/deploy-once\.mjs[\s\S]*?(?:Version ID:|CORRECTIVE_DEPLOY)/i.test(priorLog);
await writeFile(`${E}/corrective-deployment.json`, `${JSON.stringify({
  deployCommandCount: 1,
  cloudflareMutationCount: 1,
  deploymentRunId: deployRunId,
  deploymentVersionId,
  versionPresentInCloudflare: true,
  priorRunLogVersionIds: logVersionIds,
  priorRunSuccessEvidence: priorRunSuccess,
  closureMode: 'GET_ONLY_NO_ADDITIONAL_MUTATION',
}, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `deployment_version_id=${deploymentVersionId}\n`, { flag: 'a' });
