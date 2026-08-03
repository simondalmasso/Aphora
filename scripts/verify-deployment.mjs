import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = (process.argv[2] ?? process.env.DEPLOYMENT_URL ?? '').replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(baseUrl)) {
  console.error(JSON.stringify({ event: 'remote_verification_failed', reason: 'WORKERS_DEV_URL_REQUIRED' }));
  process.exit(2);
}

const checks = [
  { path: '/api/health', type: 'application/json', contains: '"status":"healthy"' },
  { path: '/', type: 'text/html', contains: '<title>SOS Santa Fe' },
  { path: '/lite', type: 'text/html', contains: 'DEMO / NO OFICIAL' },
  { path: '/api/snapshot', type: 'application/json', contains: '"mode":"DEMO"' },
  { path: '/manifest.webmanifest', type: 'application/manifest+json', contains: '"name": "SOS Santa Fe' },
];
const results = [];
for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  const body = await response.text();
  const headersOk = response.headers.get('x-content-type-options') === 'nosniff' && response.headers.get('content-security-policy')?.includes("default-src 'self'");
  results.push({ path: check.path, status: response.status, contentType: response.headers.get('content-type'), headersOk, bodyMatch: body.includes(check.contains), pass: response.ok && (response.headers.get('content-type') ?? '').includes(check.type) && headersOk && body.includes(check.contains) });
}
const pass = results.every((result) => result.pass);
const proof = {
  schemaVersion: '1.0',
  worker_name: 'sos-sf',
  workers_dev_url: baseUrl,
  deployed_at_utc: new Date().toISOString(),
  remote_status: pass ? 'PASS' : 'FAIL',
  api_health_status: results.find((result) => result.path === '/api/health')?.pass ? 'PASS' : 'FAIL',
  verified_paths: results,
  source_commit_or_precommit_tree_reference: process.env.GITHUB_SHA ?? process.env.SOURCE_REFERENCE ?? 'local-precommit-tree',
  cloudflare_account_identity_redacted_or_non_sensitive: 'GitHub Actions secret-backed; not read back',
};
if (process.env.WRITE_PROOF === '1') {
  const artifactDir = join(process.cwd(), 'artifacts', 'v1');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'deployment-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
}
console.log(JSON.stringify(proof));
if (!pass) process.exitCode = 1;
