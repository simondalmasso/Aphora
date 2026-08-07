import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const E = process.env.EVIDENCE_DIR || 'artifacts/order-020b-final-truth';
const URL = (process.env.DEPLOYMENT_URL || 'https://sos-sf.simondalmasso44.workers.dev').replace(/\/$/, '');
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const expectedVersion = 'b1f178bc-be47-4f42-aac4-715a5ac8f7dc';
const baselineD1 = '64f70d4b-a65f-4902-8bc7-10480f483284';
const baselineKv = '1acad376c6a74ef4a4cea4fd95ace79a';
await mkdir(`${E}/screenshots`, { recursive: true });

async function getJson(path) {
  const response = await fetch(`${URL}${path}${path.includes('?') ? '&' : '?'}truth=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache', Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(40_000) });
  if (!response.ok) throw new Error(`PRODUCTION_GET_FAILED:${path}:${response.status}`);
  return response.json();
}
async function cf(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(40_000) });
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
async function productDigest() {
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  let count = 0;
  for (const path of paths) {
    if (path === 'public/source-provenance.json' || path.startsWith('.github/') || path.startsWith('artifacts/') || path.startsWith('dist/')) continue;
    const bytes = await readFile(path);
    hash.update(path); hash.update('\0');
    const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(bytes.length)); hash.update(length); hash.update(bytes); count += 1;
  }
  return { productTreeSha256: hash.digest('hex'), includedFileCount: count };
}

const [snapshotEnvelope, sourcesEnvelope, healthEnvelope, provenanceEnvelope] = await Promise.all([
  getJson('/api/snapshot'), getJson('/api/sources'), getJson('/api/health'), getJson('/source-provenance.json'),
]);
const snapshot = snapshotEnvelope?.data;
if (!snapshot || !Array.isArray(snapshot.systems) || !Array.isArray(snapshot.sources)) throw new Error('SNAPSHOT_SHAPE_INVALID');
const usable = snapshot.systems.filter((system) => system?.available === true && Number.isFinite(system?.currentMetres));
if (!usable.some((system) => system.id === 'parana-santa-fe' || system.id === 'salado-santo-tome')) throw new Error('PRIMARY_HYDROMETRY_NOT_USABLE');
if (snapshot.sources.some((source) => source?.url === '')) throw new Error('EMPTY_SOURCE_URL_SERIALIZED');
if (Array.isArray(snapshot.timeline) && snapshot.timeline.some((event) => event?.url === '')) throw new Error('EMPTY_TIMELINE_URL_SERIALIZED');
const sourceRuntime = snapshot.sources.map((source) => ({ id: source.id, classification: source.classification ?? null, status: source.status, connected: source.connected ?? null, urlPresent: typeof source.url === 'string' && source.url.length > 0, determinesPrimaryState: source.determinesPrimaryState ?? false }));

const viewports = [];
const browser = await chromium.launch({ headless: true });
try {
  const budgets = { 390: 2.4, 768: 1.9, 1440: 1.35 };
  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${URL}/?truth=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByTestId('hydrometric-situation').waitFor({ state: 'visible', timeout: 30_000 });
    const parana = usable.find((system) => system.id === 'parana-santa-fe');
    const salado = usable.find((system) => system.id === 'salado-santo-tome');
    if (parana) {
      await page.getByRole('tab', { name: 'Paraná' }).click();
      const expected = Number(parana.currentMetres).toFixed(2).replace('.', ',');
      await page.waitForFunction(({ expected }) => document.querySelector('[data-testid="hydro-current-level"]')?.textContent?.includes(expected), { expected }, { timeout: 30_000 });
    }
    if (salado && viewport.width === 390) {
      await page.getByRole('tab', { name: 'Salado' }).click();
      const expected = Number(salado.currentMetres).toFixed(2).replace('.', ',');
      await page.waitForFunction(({ expected }) => document.querySelector('[data-testid="hydro-current-level"]')?.textContent?.includes(expected), { expected }, { timeout: 30_000 });
      if (parana) {
        await page.getByRole('tab', { name: 'Paraná' }).click();
        const expectedParana = Number(parana.currentMetres).toFixed(2).replace('.', ',');
        await page.waitForFunction(({ expected }) => document.querySelector('[data-testid="hydro-current-level"]')?.textContent?.includes(expected), { expected: expectedParana }, { timeout: 30_000 });
      }
    }
    if (!(await page.getByTestId('main-hydro-chart').isVisible())) throw new Error(`CHART_NOT_VISIBLE:${viewport.width}`);
    const sourceText = (await page.getByTestId('hydro-source-strip').innerText()).trim();
    if (!/Instituto Nacional del Agua/i.test(sourceText)) throw new Error(`SOURCE_STRIP_NOT_INA:${viewport.width}`);
    const metrics = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      scrollRatio: document.documentElement.scrollHeight / window.innerHeight,
      primarySectionCount: document.querySelectorAll('main > section').length,
      levelText: document.querySelector('[data-testid="hydro-current-level"]')?.textContent?.trim() ?? '',
      sourceText: document.querySelector('[data-testid="hydro-source-strip"]')?.textContent?.trim() ?? '',
    }));
    if (metrics.horizontalOverflow > 1 || metrics.scrollRatio > budgets[viewport.width]) throw new Error(`VIEWPORT_BUDGET_FAILED:${viewport.width}:${JSON.stringify(metrics)}`);
    const path = `${E}/screenshots/production-live-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path, fullPage: true });
    viewports.push({ viewport, ...metrics, maxScrollRatio: budgets[viewport.width], screenshotPath: path });
    await page.close();
  }
} finally { await browser.close(); }

if (!accountId || !token) throw new Error('CLOUDFLARE_GET_CREDENTIALS_REQUIRED');
const base = `/accounts/${encodeURIComponent(accountId)}`;
const [d1Raw, kvRaw, settings, versionsRaw] = await Promise.all([
  cf(`${base}/d1/database?per_page=100`), cf(`${base}/storage/kv/namespaces?per_page=100`), cf(`${base}/workers/scripts/sos-sf/settings`), cf(`${base}/workers/scripts/sos-sf/versions?per_page=20`),
]);
const d1 = list(d1Raw).find((item) => item?.name === 'sos-sf-private');
const kv = list(kvRaw).find((item) => item?.title === 'sos-sf-private-reports');
const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
const versionIds = list(versionsRaw).map((item) => item?.id || item?.version_id).filter(Boolean);
if (d1?.uuid !== baselineD1) throw new Error('D1_DRIFT');
if (kv?.id !== baselineKv) throw new Error('KV_DRIFT');
if (bindings.some((item) => /r2/i.test(String(item?.type || '')) || /R2/i.test(String(item?.name || '')))) throw new Error('R2_PRESENT');
if (!versionIds.includes(expectedVersion)) throw new Error('CORRECTIVE_DEPLOYMENT_VERSION_NOT_PRESENT');
const digest = await productDigest();
const provenance = provenanceEnvelope?.data || provenanceEnvelope;
if (provenance?.productTreeSha256 !== digest.productTreeSha256) throw new Error(`PROVENANCE_DRIFT:${provenance?.productTreeSha256}:${digest.productTreeSha256}`);

await writeFile(`${E}/production-blackbox.json`, `${JSON.stringify({
  productionApiUiConsistency: 'PASS',
  primaryHydrometricSourceE2E: 'PASS',
  snapshotValidation: 'PASS',
  optionalUrlContract: 'PASS',
  correctiveDeploymentVersionId: expectedVersion,
  usableSystems: usable.map((system) => ({ id: system.id, currentMetres: system.currentMetres, observedAt: system.observedAt, sourceId: system.sourceId })),
  sourceRuntime,
  viewports,
  sourcesEndpoint: sourcesEnvelope?.data || sourcesEnvelope,
  health: healthEnvelope?.data || healthEnvelope,
  provenance,
  productDigest: digest,
  cloudflare: { d1DatabaseId: d1.uuid, kvNamespaceId: kv.id, r2State: 'ABSENT', versionPresent: true },
}, null, 2)}\n`);
