import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = (process.argv[2] ?? process.env.DEPLOYMENT_URL ?? '').replace(/\/$/, '');
const expectPrivateFeatures = process.env.EXPECT_PRIVATE_FEATURES === 'true';
const verificationNonce = `${process.env.GITHUB_SHA ?? Date.now()}-${Date.now()}`;
if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(baseUrl)) {
  console.error(JSON.stringify({ event: 'remote_verification_failed', reason: 'WORKERS_DEV_URL_REQUIRED' }));
  process.exit(2);
}

async function request(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const separator = path.includes('?') ? '&' : '?';
      const url = `${baseUrl}${path}${separator}arq_verify=${encodeURIComponent(verificationNonce)}&attempt=${attempt}`;
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(25_000),
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', ...(options.headers ?? {}) },
        ...options,
      });
      const body = await response.text();
      return { path, status: response.status, contentType: response.headers.get('content-type') ?? '', cacheControl: response.headers.get('cache-control') ?? '', permissionsPolicy: response.headers.get('permissions-policy') ?? '', csp: response.headers.get('content-security-policy') ?? '', nosniff: response.headers.get('x-content-type-options') === 'nosniff', body };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

const checks = await Promise.all([
  request('/'), request('/lite'), request('/api/health'), request('/api/snapshot'), request('/api/sources'), request('/api/auth/config'), request('/api/essential-contacts'), request('/api/session'), request('/api/private/reports'), request('/manifest.webmanifest'), request('/service-worker.js'),
]);

function payload(item) {
  try {
    const parsed = JSON.parse(item.body);
    return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
  } catch { return null; }
}

const results = checks.map((item) => {
  const security = item.nosniff && item.csp.includes("default-src 'self'");
  let semantic = false;
  let detail = '';
  if (item.path === '/') {
    semantic = item.status === 200 && item.contentType.includes('text/html') && item.permissionsPolicy.includes('geolocation=(self)') && item.permissionsPolicy.includes('camera=()') && item.body.includes('<title>SOS Santa Fe') && !item.body.includes('DEMO / NO OFICIAL');
    detail = 'shell + same-origin geolocation policy';
  } else if (item.path === '/lite') {
    semantic = item.status === 200 && item.contentType.includes('text/html') && item.body.includes('Estado hídrico de Santa Fe') && item.body.includes('Teléfonos esenciales') && item.body.includes('no constituye una orden oficial');
    detail = 'lite + quality/threshold disclaimer';
  } else if (item.path === '/api/health') {
    const data = payload(item);
    const privateState = expectPrivateFeatures ? data?.privateMessaging === 'ENABLED' && data?.reporting === 'ENABLED' : data?.privateMessaging === 'FEATURE_DISABLED' && data?.reporting === 'FEATURE_DISABLED';
    semantic = item.status === 200 && data?.status === 'healthy' && data?.dataMode === 'LIVE_AGGREGATION' && privateState && Array.isArray(data?.providers) && data.providers.length >= 3 && data.providers.every((provider) => typeof provider.id === 'string' && ['FRESH', 'STALE', 'UNAVAILABLE'].includes(provider.status));
    detail = expectPrivateFeatures ? 'provider health + private activation' : 'provider health + private fail-closed state';
  } else if (item.path === '/api/snapshot') {
    const data = payload(item);
    const systems = Array.isArray(data?.systems) ? data.systems : [];
    semantic = item.status === 200 && ['LIVE', 'STALE', 'UNAVAILABLE', 'OFFLINE'].includes(data?.dataStatus) && systems.some((system) => system.id === 'parana-santa-fe') && systems.some((system) => system.id === 'salado-santo-tome') && data?.state !== 'EVACUACION_OFICIAL' && !item.body.includes('DEMO_FIXTURE') && !item.body.includes('DEMO / NO OFICIAL');
    detail = 'non-synthetic separated-system snapshot';
  } else if (item.path === '/api/sources') {
    const data = payload(item);
    const systems = Array.isArray(data?.systems) ? data.systems : [];
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    semantic = item.status === 200 && systems.some((system) => system.id === 'parana-santa-fe') && systems.some((system) => system.id === 'salado-santo-tome') && sources.length >= 2 && sources.every((source) => typeof source.id === 'string' && ['FRESH', 'STALE', 'UNAVAILABLE'].includes(source.status) && typeof source.contribution === 'string' && typeof source.official === 'boolean');
    detail = 'station separation + explicit provenance state';
  } else if (item.path === '/api/auth/config') {
    const data = payload(item);
    semantic = item.status === 200 && (expectPrivateFeatures
      ? data?.enabled === true && data?.reportingEnabled === true && typeof data?.googleClientId === 'string' && data.googleClientId.length > 10 && data?.activationState === 'ACTIVE'
      : data?.enabled === false && data?.reportingEnabled === false && data?.googleClientId === null && typeof data?.activationState === 'string' && data.activationState.startsWith('REQUIRES_PROTECTED_'));
    detail = expectPrivateFeatures ? 'protected auth/report configuration' : 'auth/report fail-closed configuration';
  } else if (item.path === '/api/essential-contacts') {
    const data = payload(item);
    semantic = item.status === 200 && Array.isArray(data?.contacts) && ['911','103','107','100','106','0800-777-5000'].every((number) => data.contacts.some((contact) => contact.number === number && String(contact.href).startsWith('tel:')));
    detail = 'essential contacts';
  } else if (item.path === '/api/session') {
    const data = payload(item);
    semantic = item.status === 200 && data?.enabled === expectPrivateFeatures && data?.authenticated === false && item.cacheControl.includes('private') && item.cacheControl.includes('no-store');
    detail = expectPrivateFeatures ? 'anonymous private session negative' : 'disabled private session negative';
  } else if (item.path === '/api/private/reports') {
    semantic = item.status === (expectPrivateFeatures ? 401 : 503) && item.cacheControl.includes('private') && item.cacheControl.includes('no-store');
    detail = expectPrivateFeatures ? 'private report authorization negative' : 'private report fail-closed negative';
  } else if (item.path === '/manifest.webmanifest') {
    semantic = item.status === 200 && item.contentType.includes('application/manifest+json') && item.body.includes('"name": "SOS Santa Fe');
    detail = 'PWA manifest';
  } else if (item.path === '/service-worker.js') {
    semantic = item.status === 200 && item.body.includes('PUBLIC_API_ALLOWLIST') && item.body.includes('privateApiNetworkOnly') && item.body.includes("directive.includes('private')") && item.body.includes("directive.includes('no-store')") && !item.body.includes("pathname.startsWith('/api/') { event.respondWith(apiNetworkFirst");
    detail = 'private-cache prohibition';
  }
  return { path: item.path, status: item.status, contentType: item.contentType, cacheControl: item.cacheControl, security, semantic, detail, pass: security && semantic };
});

const pass = results.every((result) => result.pass);
const proof = { schemaVersion: '1.0', worker_name: 'sos-sf', workers_dev_url: baseUrl, deployed_at_utc: new Date().toISOString(), remote_status: pass ? 'PASS' : 'FAIL', private_features_expected: expectPrivateFeatures, verified_paths: results, source_commit: process.env.GITHUB_SHA ?? 'unknown', cloudflare_account_identity: 'GitHub Actions protected configuration; no secret readback' };
if (process.env.WRITE_PROOF === '1') {
  const artifactDir = join(process.cwd(), process.env.EVIDENCE_DIR ?? 'artifacts/current-run');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'deployment-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
}
console.log(JSON.stringify(proof));
if (!pass) process.exitCode = 1;
