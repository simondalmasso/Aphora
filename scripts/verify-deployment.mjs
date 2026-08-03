import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = (process.argv[2] ?? process.env.DEPLOYMENT_URL ?? '').replace(/\/$/, '');
if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(baseUrl)) {
  console.error(JSON.stringify({ event: 'remote_verification_failed', reason: 'WORKERS_DEV_URL_REQUIRED' }));
  process.exit(2);
}

async function fetchCheck(path, expectedType) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'error', signal: AbortSignal.timeout(25_000), cache: 'no-store' });
  const body = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const headersOk = response.headers.get('x-content-type-options') === 'nosniff' && response.headers.get('content-security-policy')?.includes("default-src 'self'");
  return { path, status: response.status, contentType, headersOk, body, basePass: response.ok && contentType.includes(expectedType) && headersOk };
}

const raw = await Promise.all([
  fetchCheck('/api/health', 'application/json'),
  fetchCheck('/', 'text/html'),
  fetchCheck('/lite', 'text/html'),
  fetchCheck('/api/snapshot', 'application/json'),
  fetchCheck('/api/sources', 'application/json'),
  fetchCheck('/api/auth/config', 'application/json'),
  fetchCheck('/api/essential-contacts', 'application/json'),
  fetchCheck('/manifest.webmanifest', 'application/manifest+json'),
]);

const results = raw.map((item) => {
  let semantic = true;
  try {
    if (item.path === '/api/health') {
      const data = JSON.parse(item.body).data;
      semantic = data?.status === 'healthy' && data?.dataMode === 'LIVE_AGGREGATION' && data?.privateMessaging === 'ENABLED' && data?.reporting === 'ENABLED';
    } else if (item.path === '/api/snapshot') {
      const data = JSON.parse(item.body).data;
      semantic = ['LIVE', 'UNAVAILABLE'].includes(data?.mode) && data?.mode !== 'DEMO' && Array.isArray(data?.systems) && data.systems.length >= 2 && !item.body.includes('DEMO / NO OFICIAL');
    } else if (item.path === '/api/sources') {
      const data = JSON.parse(item.body).data;
      semantic = Array.isArray(data?.systems) && data.systems.some((system) => system.id === 'parana-santa-fe') && data.systems.some((system) => system.id === 'salado-santo-tome');
    } else if (item.path === '/api/auth/config') {
      const data = JSON.parse(item.body).data;
      semantic = data?.enabled === true && data?.reportingEnabled === true && typeof data?.googleClientId === 'string' && data.googleClientId.length > 10;
    } else if (item.path === '/api/essential-contacts') {
      const data = JSON.parse(item.body).data;
      semantic = Array.isArray(data?.contacts) && ['911','103','107','100','106','0800-777-5000'].every((number) => data.contacts.some((contact) => contact.number === number && String(contact.href).startsWith('tel:')));
    } else if (item.path === '/') {
      semantic = item.body.includes('<title>SOS Santa Fe') && !item.body.includes('DEMO / NO OFICIAL');
    } else if (item.path === '/lite') {
      semantic = item.body.includes('Estado hídrico de Santa Fe') && item.body.includes('Teléfonos esenciales') && !item.body.includes('DEMO / NO OFICIAL');
    } else if (item.path === '/manifest.webmanifest') semantic = item.body.includes('"name": "SOS Santa Fe');
  } catch { semantic = false; }
  return { path: item.path, status: item.status, contentType: item.contentType, headersOk: item.headersOk, semantic, pass: item.basePass && semantic };
});

const pass = results.every((result) => result.pass);
const proof = { schemaVersion: '1.0', worker_name: 'sos-sf', workers_dev_url: baseUrl, deployed_at_utc: new Date().toISOString(), remote_status: pass ? 'PASS' : 'FAIL', verified_paths: results, source_commit: process.env.GITHUB_SHA ?? 'unknown', cloudflare_account_identity: 'GitHub Actions protected configuration; no secret readback' };
if (process.env.WRITE_PROOF === '1') { const artifactDir = join(process.cwd(), 'artifacts', 'v1'); await mkdir(artifactDir, { recursive: true }); await writeFile(join(artifactDir, 'deployment-proof.json'), `${JSON.stringify(proof, null, 2)}\n`); }
console.log(JSON.stringify(proof));
if (!pass) process.exitCode = 1;
