import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = (process.argv[2] ?? process.env.DEPLOYMENT_URL ?? '').replace(/\/$/, '');
const expectPrivateFeatures = process.env.EXPECT_PRIVATE_FEATURES === 'true';
const verificationNonce = `${process.env.GITHUB_SHA ?? Date.now()}-${Date.now()}`;
if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(baseUrl)) process.exit(2);

async function request(path, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const separator = path.includes('?') ? '&' : '?';
      const response = await fetch(`${baseUrl}${path}${separator}verify=${encodeURIComponent(verificationNonce)}&attempt=${attempt}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(40_000),
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', ...(options.headers ?? {}) },
        ...options,
      });
      const body = await response.text();
      return {
        path,
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        cacheControl: response.headers.get('cache-control') ?? '',
        permissionsPolicy: response.headers.get('permissions-policy') ?? '',
        csp: response.headers.get('content-security-policy') ?? '',
        nosniff: response.headers.get('x-content-type-options') === 'nosniff',
        body,
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

function payload(item) {
  try {
    const parsed = JSON.parse(item.body);
    return parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed;
  } catch { return null; }
}

const checks = await Promise.all([
  request('/'), request('/lite'), request('/api/health'), request('/api/snapshot'), request('/api/sources'), request('/api/auth/config'), request('/api/essential-contacts'), request('/api/session'), request('/api/private/reports'), request('/manifest.webmanifest'), request('/service-worker.js'), request('/source-provenance.json'),
]);

const results = checks.map((item) => {
  const security = item.nosniff && item.csp.includes("default-src 'self'");
  let semantic = false;
  let detail = '';
  if (item.path === '/') {
    semantic = item.status === 200
      && item.contentType.includes('text/html')
      && item.permissionsPolicy.includes('geolocation=(self)')
      && item.permissionsPolicy.includes('camera=()')
      && item.body.includes('SOS Santa Fe')
      && !/DEMO \/ NO OFICIAL|Estado hídrico de Santa Fe|three/i.test(item.body);
    detail = 'institutional shell and security policy';
  } else if (item.path === '/lite') {
    semantic = item.status === 200
      && item.contentType.includes('text/html')
      && item.body.includes('Información pública para emergencias')
      && item.body.includes('Alertas oficiales')
      && item.body.includes('Situación hidrométrica')
      && item.body.includes('Qué hacer ahora')
      && item.body.includes('Fuentes y actualización')
      && item.body.includes('Reportar una situación no inicia un despacho')
      && !/Datos en vivo|Sistema Paraná|Sistema Salado|Evolución prevista|DEMO_FIXTURE/.test(item.body);
    detail = 'lite public-safety semantics';
  } else if (item.path === '/api/health') {
    const data = payload(item);
    const privateState = expectPrivateFeatures ? data?.privateMessaging === 'ENABLED' && data?.reporting === 'ENABLED' : data?.privateMessaging === 'FEATURE_DISABLED' && data?.reporting === 'FEATURE_DISABLED';
    semantic = item.status === 200 && data?.status === 'healthy' && data?.dataMode === 'LIVE_AGGREGATION' && privateState && data?.snapshot?.alertStatus && data?.snapshot?.freshness;
    detail = 'technical health separated from data freshness';
  } else if (item.path === '/api/snapshot') {
    const data = payload(item);
    const systems = Array.isArray(data?.systems) ? data.systems : [];
    const parana = systems.find((system) => system.id === 'parana-santa-fe');
    const salado = systems.find((system) => system.id === 'salado-santo-tome');
    const validAlertStatus = ['ALERTA_OFICIAL_ACTIVA','SIN_ALERTAS_OFICIALES_DETECTADAS','VERIFICACION_DE_ALERTAS_DEGRADADA','FUENTES_DE_ALERTAS_NO_DISPONIBLES'].includes(data?.alertStatus);
    semantic = item.status === 200
      && data?.mode === 'LIVE'
      && validAlertStatus
      && ['ACTUALIZADO','ACTUALIZACION_DEMORADA','DESACTUALIZADO','NO_DISPONIBLE'].includes(data?.freshness)
      && parana?.label === 'Río Paraná — Santa Fe'
      && salado?.label === 'Río Salado — Santo Tomé'
      && Number.isFinite(Date.parse(parana?.observedAt))
      && Number.isFinite(Date.parse(parana?.fetchedAt))
      && Number.isFinite(Date.parse(parana?.validUntil))
      && data?.state !== 'EVACUACION_OFICIAL'
      && !/DEMO_FIXTURE|Sistema Paraná|Sistema Salado/.test(item.body);
    detail = 'CAP state, real station names, distinct timestamps and no false evacuation';
  } else if (item.path === '/api/sources') {
    const data = payload(item);
    const sources = Array.isArray(data?.sources) ? data.sources : [];
    const organizations = Array.isArray(data?.sourceOrganizations) ? data.sourceOrganizations : [];
    const ids = new Set(sources.map((source) => source.id));
    const required = ['ina-rest-30','ina-rest-3044','ina-waterml-parana','ina-waterml-salado','smn-alerts','smn-observations','nasa-gpm-imerg-early','ports-hydrometers','province-early-warning-page','cobem-public-page'];
    const connected = sources.filter((source) => source.connected);
    const nasa = sources.find((source) => source.id === 'nasa-gpm-imerg-early');
    const blocked = sources.filter((source) => ['BLOCKED_CREDENTIAL','BLOCKED_NO_MACHINE_ENDPOINT'].includes(source.classification));
    semantic = item.status === 200
      && required.every((id) => ids.has(id))
      && organizations.length >= 6
      && sources.every((source) => typeof source.organizationId === 'string' && typeof source.feedName === 'string' && typeof source.classification === 'string' && typeof source.determinesPrimaryState === 'boolean')
      && sources.find((source) => source.id === 'ina-rest-30')?.connected === true
      && sources.find((source) => source.id === 'smn-alerts')?.connected === true
      && blocked.every((source) => source.connected === false)
      && (nasa?.connected === true ? /mm\/h/.test(nasa.contribution) : nasa?.classification === 'SUPPLEMENTARY' && !/Muestra satelital válida/.test(nasa.contribution))
      && connected.filter((source) => source.organizationId === 'ina').length >= 2;
    detail = 'organization/feed matrix, blocked feeds excluded, NASA conditional sample';
  } else if (item.path === '/api/auth/config') {
    const data = payload(item);
    semantic = item.status === 200 && (expectPrivateFeatures
      ? data?.enabled === true && data?.reportingEnabled === true && typeof data?.googleClientId === 'string' && data?.activationState === 'ACTIVE'
      : data?.enabled === false && data?.reportingEnabled === false);
    detail = 'protected auth and reporting configuration';
  } else if (item.path === '/api/essential-contacts') {
    const data = payload(item);
    semantic = item.status === 200 && Array.isArray(data?.contacts) && ['911','103','107','100','106'].every((number) => data.contacts.some((contact) => contact.number === number && String(contact.href).startsWith('tel:')));
    detail = 'essential calls separated from citizen reporting';
  } else if (item.path === '/api/session') {
    const data = payload(item);
    semantic = item.status === 200 && data?.enabled === expectPrivateFeatures && data?.authenticated === false && item.cacheControl.includes('private') && item.cacheControl.includes('no-store');
    detail = 'anonymous private-session negative';
  } else if (item.path === '/api/private/reports') {
    semantic = item.status === (expectPrivateFeatures ? 401 : 503) && item.cacheControl.includes('private') && item.cacheControl.includes('no-store');
    detail = 'private report authorization negative';
  } else if (item.path === '/manifest.webmanifest') {
    semantic = item.status === 200 && item.body.includes('Información pública para emergencias');
    detail = 'PWA manifest';
  } else if (item.path === '/service-worker.js') {
    semantic = item.status === 200 && item.body.includes('PUBLIC_API_ALLOWLIST') && item.body.includes('privateApiNetworkOnly') && item.body.includes('No se puede confirmar la situación ni la ausencia de alertas') && !item.body.includes('sos-sf-v3-live');
    detail = 'offline no-alert claim prohibition and private network-only policy';
  } else if (item.path === '/source-provenance.json') {
    const data = payload(item) ?? JSON.parse(item.body);
    semantic = item.status === 200 && data?.orderId === 'SOS-SF-OWNER-GLOBAL-PUBLIC-SAFETY-REFOUNDATION-015' && typeof data?.productTreeSha256 === 'string';
    detail = 'order 015 product provenance';
  }
  return { path: item.path, status: item.status, contentType: item.contentType, cacheControl: item.cacheControl, security, semantic, detail, pass: security && semantic };
});

const pass = results.every((result) => result.pass);
const proof = {
  schemaVersion: '1.0',
  orderId: 'SOS-SF-OWNER-GLOBAL-PUBLIC-SAFETY-REFOUNDATION-015',
  worker_name: 'sos-sf',
  workers_dev_url: baseUrl,
  deployed_at_utc: new Date().toISOString(),
  remote_status: pass ? 'PASS' : 'FAIL',
  private_features_expected: expectPrivateFeatures,
  verified_paths: results,
  source_commit: process.env.GITHUB_SHA ?? 'unknown',
  cloudflare_account_identity: 'Protected configuration; no secret readback',
};
if (process.env.WRITE_PROOF === '1') {
  const artifactDir = join(process.cwd(), process.env.EVIDENCE_DIR ?? 'artifacts/current-run');
  await mkdir(artifactDir, { recursive: true });
  await writeFile(join(artifactDir, 'deployment-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
}
console.log(JSON.stringify(proof));
if (!pass) process.exitCode = 1;
