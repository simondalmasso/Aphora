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
        signal: AbortSignal.timeout(40_000),
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
    const statusLabelIsTruthful = item.body.includes('Datos en vivo') || item.body.includes('Datos desactualizados');
    const observationMatch = item.body.match(/Observación principal:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)/);
    const observationAt = observationMatch ? Date.parse(observationMatch[1]) : Number.NaN;
    semantic = item.status === 200
      && item.contentType.includes('text/html')
      && item.body.includes('Estado hídrico de Santa Fe')
      && item.body.includes('Teléfonos esenciales')
      && item.body.includes('no constituye una orden oficial')
      && statusLabelIsTruthful
      && /3\.\d{2} m/.test(item.body)
      && Number.isFinite(observationAt)
      && Date.now() - observationAt <= 36 * 60 * 60 * 1000
      && item.body.includes('Fuente principal: INA · Sistema de Información Hidrológica')
      && item.body.includes('sin validación definitiva salvo marca expresa')
      && !item.body.includes('1970-01-01');
    detail = 'lite + truthful freshness label + current numeric observation + provenance/quality disclaimer';
  } else if (item.path === '/api/health') {
    const data = payload(item);
    const privateState = expectPrivateFeatures ? data?.privateMessaging === 'ENABLED' && data?.reporting === 'ENABLED' : data?.privateMessaging === 'FEATURE_DISABLED' && data?.reporting === 'FEATURE_DISABLED';
    const providers = Array.isArray(data?.providers) ? data.providers : [];
    const ina = providers.find((provider) => provider.id === 'ina-rest-30');
    semantic = item.status === 200 && data?.status === 'healthy' && data?.dataMode === 'LIVE_AGGREGATION' && privateState && providers.length >= 3 && providers.every((provider) => typeof provider.id === 'string' && ['FRESH', 'STALE', 'UNAVAILABLE'].includes(provider.status) && 'lastSuccessAt' in provider && 'lastObservedAt' in provider && 'errorClass' in provider && 'circuitOpenUntil' in provider) && ['FRESH', 'STALE'].includes(ina?.status) && Number.isFinite(Date.parse(ina?.lastSuccessAt)) && Number.isFinite(Date.parse(ina?.lastObservedAt)) && ina?.errorClass === null && ina?.circuitOpenUntil === null;
    detail = expectPrivateFeatures ? 'live INA provider health + private activation' : 'live INA provider health + private fail-closed state';
  } else if (item.path === '/api/snapshot') {
    const data = payload(item);
    const systems = Array.isArray(data?.systems) ? data.systems : [];
    const santaFe = systems.find((system) => system.id === 'parana-santa-fe' && system.stationCode === '30');
    const observedAt = Date.parse(santaFe?.observedAt);
    semantic = item.status === 200 && data?.mode === 'LIVE' && ['LIVE', 'STALE'].includes(data?.dataStatus) && santaFe?.available === true && Number.isFinite(santaFe?.currentMetres) && Number.isFinite(observedAt) && Date.now() - observedAt <= 36 * 60 * 60 * 1000 && systems.some((system) => system.id === 'salado-santo-tome') && data?.state !== 'EVACUACION_OFICIAL' && !item.body.includes('DEMO_FIXTURE') && !item.body.includes('DEMO / NO OFICIAL');
    detail = 'current numeric Santa Fe observation + separated-system snapshot';
  } else if (item.path === '/api/sources') {
    const data = payload(item);
    const systems = Array.isArray(data?.systems) ? data.systems : [];
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    const inaSource = sources.find((source) => source.id === 'ina:30');
    semantic = item.status === 200 && systems.some((system) => system.id === 'parana-santa-fe') && systems.some((system) => system.id === 'salado-santo-tome') && sources.length >= 2 && sources.every((source) => typeof source.id === 'string' && ['FRESH', 'STALE', 'UNAVAILABLE'].includes(source.status) && typeof source.contribution === 'string' && typeof source.official === 'boolean') && inaSource?.connected === true && ['FRESH', 'STALE'].includes(inaSource?.status) && Number.isFinite(Date.parse(inaSource?.observedAt)) && String(inaSource?.url ?? '').startsWith('https://alerta.ina.gob.ar/a5/getObservaciones?');
    detail = 'station separation + exact live INA provenance';
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

const healthData = payload(checks.find((item) => item.path === '/api/health'));
const sourcesData = payload(checks.find((item) => item.path === '/api/sources'));
const providers = Array.isArray(healthData?.providers) ? healthData.providers : [];
const sources = Array.isArray(sourcesData?.sources) ? sourcesData.sources : [];
const provider = (id) => providers.find((item) => item.id === id);
const source = (id) => sources.find((item) => item.id === id);
const primaryPairs = [
  ['ina-rest-30', 'ina:30'],
  ['ina-rest-3044', 'ina:3044'],
  ['ina-waterml-parana', 'ina-waterml-parana'],
  ['ina-waterml-salado', 'ina-waterml-salado'],
  ['smn-alerts', 'smn-alerts'],
];
const primaryPass = primaryPairs.every(([healthId, sourceId]) => {
  const health = provider(healthId);
  const item = source(sourceId);
  return ['FRESH', 'STALE'].includes(health?.status)
    && health?.errorClass === null
    && health?.circuitOpenUntil === null
    && Number.isFinite(Date.parse(health?.lastSuccessAt))
    && Number.isFinite(Date.parse(health?.lastObservedAt))
    && item?.connected === true
    && ['FRESH', 'STALE'].includes(item?.status)
    && Number.isFinite(Date.parse(item?.observedAt))
    && typeof item?.url === 'string';
});
const blockedPass = [
  ['ports-hydrometers', 'OFFICIAL_MACHINE_ENDPOINT_NOT_AVAILABLE'],
  ['smn-observations', 'CREDENTIAL_REQUIRED'],
].every(([id, errorClass]) => provider(id)?.status === 'UNAVAILABLE'
  && provider(id)?.errorClass === errorClass
  && provider(id)?.circuitOpenUntil === null
  && source(id)?.connected === false
  && source(id)?.status === 'UNAVAILABLE'
  && typeof source(id)?.url === 'string');
const nasaHealth = provider('nasa-gpm-imerg-early');
const nasaSource = source('nasa-gpm-imerg-early');
const nasaConnectedPass = nasaSource?.connected === true
  && ['FRESH', 'STALE'].includes(nasaHealth?.status)
  && nasaHealth?.errorClass === null
  && Number.isFinite(Date.parse(nasaHealth?.lastSuccessAt))
  && Number.isFinite(Date.parse(nasaHealth?.lastObservedAt))
  && Number.isFinite(nasaSource?.latencyMinutes)
  && nasaSource.latencyMinutes >= 0
  && /[-+]?\d+(?:[.,]\d+)? mm\/h/.test(String(nasaSource?.contribution ?? ''))
  && String(nasaSource?.url ?? '').includes('/getSamples?')
  && String(nasaSource?.url ?? '').includes('mosaicRule=');
const nasaUnavailablePass = nasaSource?.connected === false
  && nasaSource?.status === 'UNAVAILABLE'
  && nasaHealth?.status === 'UNAVAILABLE'
  && ['TIMEOUT', 'HTTP', 'PARSE', 'NETWORK', 'CONTENT_TYPE', 'BODY_TOO_LARGE', 'CIRCUIT_OPEN'].includes(nasaHealth?.errorClass)
  && String(nasaSource?.url ?? '').endsWith('/query');
const matrixPass = primaryPass && blockedPass && (nasaConnectedPass || nasaUnavailablePass);
results.push({ path: '/api/source-matrix', status: matrixPass ? 200 : 500, contentType: 'application/json', cacheControl: 'no-store', security: true, semantic: matrixPass, detail: 'ALL-SOURCES-013 primary matrix + conditional real NASA sample', pass: matrixPass });

const pass = results.every((result) => result.pass);
const proof = { schemaVersion: '1.0', worker_name: 'sos-sf', workers_dev_url: baseUrl, deployed_at_utc: new Date().toISOString(), remote_status: pass ? 'PASS' : 'FAIL', private_features_expected: expectPrivateFeatures, verified_paths: results, source_commit: process.env.GITHUB_SHA ?? 'unknown', cloudflare_account_identity: 'GitHub Actions protected configuration; no secret readback' };
if (process.env.WRITE_PROOF === '1') {
  const artifactDir = join(process.cwd(), process.env.EVIDENCE_DIR ?? 'artifacts/current-run');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'deployment-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
}
console.log(JSON.stringify(proof));
if (!pass) process.exitCode = 1;
