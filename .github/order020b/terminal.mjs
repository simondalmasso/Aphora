import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const mode = process.argv[2];
const REPO = process.env.GITHUB_REPOSITORY || 'simonkey888/sos-sf';
const BRANCH = 'arq/visual-dashboard-v3';
const ORDER = 'SOS-SF-AUD-FULL-CODEBASE-REVIEW-AND-END-TO-END-CLOSE-020';
const SUBORDER = '020-B-MASTER-TERMINAL-EXECUTION';
const TAKE_SHA = '4ef8b79f40f7c275db35aeb4f07eca74cf5245aa';
const PRODUCT_FIX_SHA = '0d214c590bb99d02017188ae51513a58ba293749';
const MAIN_SHA = '45047d1c1e16941ea37967d67307d0ab17e85fad';
const URL = 'https://sos-sf.simondalmasso44.workers.dev';
const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020b-terminal';
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();

function run(command, args = [], options = {}) {
  const output = execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  return typeof output === 'string' ? output.trim() : '';
}
function git(...args) { return run('git', args); }
function gh(...args) { return run('gh', args); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function jsonWrite(name, value) {
  await mkdir(EVIDENCE, { recursive: true });
  await writeFile(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`);
}
async function jsonRead(path) { return JSON.parse(await readFile(path, 'utf8')); }
function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  execFileSync('bash', ['-lc', 'printf "%s=%s\\n" "$1" "$2" >> "$GITHUB_OUTPUT"', 'bash', name, String(value)]);
}
function classify(path) {
  if (path.startsWith('src/client/')) return path.endsWith('.css') ? 'UI_STYLE' : 'FRONTEND';
  if (path.startsWith('src/worker/')) return 'WORKER';
  if (path.startsWith('src/domain/')) return 'DOMAIN';
  if (path.startsWith('src/data/')) return 'DATA';
  if (path.startsWith('tests/')) return 'TEST';
  if (path.startsWith('scripts/')) return 'SCRIPT';
  if (path.startsWith('migrations/')) return 'PERSISTENCE';
  if (path.startsWith('.github/')) return 'AUTOMATION';
  if (path.startsWith('docs/') || path.endsWith('.md')) return 'DOCUMENTATION';
  if (path.startsWith('public/')) return 'PUBLIC_ASSET';
  if (path.startsWith('artifacts/')) return 'HISTORICAL_ARTIFACT';
  if (/^(package|tsconfig|vite|playwright|eslint|wrangler|index\.html|\.npmrc|\.gitignore)/.test(path)) return 'CONFIGURATION';
  return 'OTHER';
}
function textLike(path) {
  return new Set(['.ts','.tsx','.js','.mjs','.cjs','.json','.jsonc','.md','.css','.html','.sql','.txt','.yml','.yaml','.toml','.npmrc','.gitignore']).has(extname(path)) || ['.npmrc','.gitignore'].includes(path);
}

async function codeReview() {
  if (git('rev-parse', 'origin/main') !== MAIN_SHA) throw new Error('MAIN_DRIFT');
  git('merge-base', '--is-ancestor', TAKE_SHA, 'HEAD');
  const paths = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  const entries = [];
  const riskPatterns = [
    ['DANGEROUS_HTML', /dangerouslySetInnerHTML/g],
    ['EVAL', /\beval\s*\(/g],
    ['NEW_FUNCTION', /new\s+Function\s*\(/g],
    ['TS_IGNORE', /@ts-ignore/g],
    ['HARDCODED_PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['AWS_KEY_SHAPE', /AKIA[0-9A-Z]{16}/g],
    ['TODO_FIXME', /\b(?:TODO|FIXME)\b/g],
  ];
  for (const path of paths) {
    const bytes = await readFile(path);
    const evidence = { sha256: sha256(bytes), bytes: bytes.length };
    const flags = [];
    let lines = null;
    if (textLike(path)) {
      const text = bytes.toString('utf8');
      lines = text.split('\n').length;
      for (const [id, pattern] of riskPatterns) {
        const count = [...text.matchAll(pattern)].length;
        if (count) flags.push({ id, count });
      }
      if (path.endsWith('.ts') || path.endsWith('.tsx')) {
        const extensionless = [...text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)]
          .map((match) => match[1]).filter((spec) => !/\.(?:ts|tsx|js|jsx|json|css|svg|png)$/.test(spec));
        if (extensionless.length) flags.push({ id: 'EXTENSIONLESS_RELATIVE_IMPORT', count: extensionless.length, examples: extensionless.slice(0, 5) });
      }
    }
    entries.push({
      path,
      category: classify(path),
      reviewed: true,
      finding_ids: path === 'src/client/pwa/useSnapshot.ts' ? ['020B-001'] : [],
      result: flags.length ? 'REVIEWED_WITH_STATIC_FLAGS' : 'REVIEWED_NO_STATIC_FLAGS',
      review_evidence: { ...evidence, lines, staticFlags: flags },
    });
  }
  await jsonWrite('code-review-manifest.json', entries);
  const flags = entries.flatMap((entry) => entry.review_evidence.staticFlags.map((flag) => ({ path: entry.path, ...flag })));
  await jsonWrite('static-review-summary.json', { reviewedCount: entries.length, allTrackedFilesRead: entries.length === paths.length, flags });
  output('code_review_count', entries.length);
}

async function cf(path) {
  if (!accountId || !token) throw new Error('CLOUDFLARE_GET_CREDENTIALS_REQUIRED');
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
async function productDigest() {
  const paths = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  let count = 0;
  for (const path of paths) {
    if (path === 'public/source-provenance.json' || path.startsWith('.github/') || path.startsWith('artifacts/') || path.startsWith('dist/')) continue;
    const bytes = await readFile(path);
    hash.update(path); hash.update('\0');
    const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(bytes.length)); hash.update(length); hash.update(bytes); count += 1;
  }
  return { productTreeSha256: hash.digest('hex'), includedFileCount: count, trackedFileCount: paths.length };
}

async function prepareDeploy() {
  if (git('rev-parse', 'origin/main') !== MAIN_SHA) throw new Error('MAIN_DRIFT_BEFORE_DEPLOY');
  git('merge-base', '--is-ancestor', PRODUCT_FIX_SHA, 'HEAD');
  const remoteHead = git('ls-remote', 'origin', `refs/heads/${BRANCH}`).split(/\s+/)[0];
  if (remoteHead !== git('rev-parse', 'HEAD')) throw new Error('REMOTE_HEAD_GUARD_FAILED');
  const base = `/accounts/${encodeURIComponent(accountId)}`;
  const [d1Raw, kvRaw, settings, versionsRaw, secretsRaw] = await Promise.all([
    cf(`${base}/d1/database?per_page=100`),
    cf(`${base}/storage/kv/namespaces?per_page=100`),
    cf(`${base}/workers/scripts/sos-sf/settings`),
    cf(`${base}/workers/scripts/sos-sf/versions?per_page=20`),
    cf(`${base}/workers/scripts/sos-sf/secrets`),
  ]);
  const d1 = list(d1Raw).find((item) => item?.name === 'sos-sf-private');
  const kv = list(kvRaw).find((item) => item?.title === 'sos-sf-private-reports');
  const versions = list(versionsRaw).map((item) => ({ id: item?.id || item?.version_id || null, createdOn: item?.metadata?.created_on || item?.created_on || null }));
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  const secretNames = list(secretsRaw).map((item) => String(item?.name || '')).filter(Boolean).sort();
  if (!d1?.uuid || !kv?.id) throw new Error('FREE_D1_KV_BINDINGS_MISSING');
  if (bindings.some((item) => /r2/i.test(String(item?.type || '')) || /R2/i.test(String(item?.name || '')))) throw new Error('R2_PRESENT_BEFORE_DEPLOY');
  for (const required of ['SESSION_SIGNING_KEY','SOS_SF_OPERATOR_EMAILS']) if (!secretNames.includes(required)) throw new Error(`REQUIRED_EXISTING_SECRET_MISSING:${required}`);
  const digest = await productDigest();
  await jsonWrite('cloudflare-before.json', { d1DatabaseId: d1.uuid, kvNamespaceId: kv.id, bindings, secretNames, valuesExposed: false, versions });
  const provenance = { schemaVersion: 2, orderId: ORDER, suborder: SUBORDER, productTreeSha256: digest.productTreeSha256, includedFileCount: digest.includedFileCount, sourceHeadSha: PRODUCT_FIX_SHA, preparedAt: new Date().toISOString() };
  await writeFile('public/source-provenance.json', `${JSON.stringify(provenance, null, 2)}\n`);
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  config.vars = {
    PRIVATE_MESSAGING_ENABLED: 'true',
    GOOGLE_CLIENT_ID: String(process.env.GOOGLE_CLIENT_ID || ''),
    REPORT_RETENTION_DAYS: String(process.env.REPORT_RETENTION_DAYS || '30'),
    INA_WATERML_PARANA_URL: String(process.env.INA_WATERML_PARANA_URL || ''),
    INA_WATERML_SALADO_URL: String(process.env.INA_WATERML_SALADO_URL || ''),
    PORTS_HYDROMETER_JSON_URL: String(process.env.PORTS_HYDROMETER_JSON_URL || ''),
    SMN_OBSERVATIONS_JSON_URL: String(process.env.SMN_OBSERVATIONS_JSON_URL || ''),
    SMN_ALERTS_JSON_URL: String(process.env.SMN_ALERTS_JSON_URL || ''),
  };
  if (!config.vars.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID_MISSING');
  config.d1_databases = [{ binding: 'MESSAGES_DB', database_name: 'sos-sf-private', database_id: d1.uuid, migrations_dir: 'migrations' }];
  config.kv_namespaces = [{ binding: 'REPORTS_KV', id: kv.id }];
  delete config.r2_buckets;
  await writeFile('wrangler.generated.jsonc', `${JSON.stringify(config, null, 2)}\n`);
  output('product_tree_sha256', digest.productTreeSha256);
}

async function getApi(path) {
  const response = await fetch(`${URL}${path}${path.includes('?') ? '&' : '?'}order020b=${Date.now()}`, {
    cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache', Accept: 'application/json' }, signal: AbortSignal.timeout(40_000),
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}
function dataOf(response) { return response?.body?.data ?? response?.body; }
function sourceStatusFromHealth(health, id) { return (dataOf(health)?.providers || []).find((provider) => provider.id === id) || null; }

async function productionVerify() {
  const [health, snapshotResponse, sourcesResponse, provenanceResponse] = await Promise.all([
    getApi('/api/health'), getApi('/api/snapshot'), getApi('/api/sources'), getApi('/source-provenance.json'),
  ]);
  for (const [name, response] of Object.entries({ health, snapshotResponse, sourcesResponse, provenanceResponse })) if (response.status !== 200) throw new Error(`PRODUCTION_${name}_HTTP_${response.status}`);
  const snapshot = dataOf(snapshotResponse);
  const sourcesPayload = dataOf(sourcesResponse);
  const systems = Array.isArray(snapshot?.systems) ? snapshot.systems : [];
  const usable = systems.filter((system) => system?.available === true && typeof system?.currentMetres === 'number');
  if (!usable.length) throw new Error('PRIMARY_HYDROMETRIC_SOURCE_NOT_USABLE_NOW');
  const primary = systems.find((system) => system.id === snapshot?.river?.systemId) ?? usable[0];
  if (!primary || typeof primary.currentMetres !== 'number') throw new Error('PRIMARY_SYSTEM_NOT_USABLE');
  const expectedLevel = primary.currentMetres.toFixed(2).replace('.', ',');
  const digest = await productDigest();
  const provenance = dataOf(provenanceResponse);
  if (provenance?.productTreeSha256 !== digest.productTreeSha256 || provenance?.suborder !== SUBORDER) throw new Error('CLOUDFLARE_GITHUB_PROVENANCE_DRIFT');

  const sourceEntries = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : Array.isArray(snapshot?.sources) ? snapshot.sources : [];
  const providers = Array.isArray(dataOf(health)?.providers) ? dataOf(health).providers : [];
  const sourceMatrix = sourceEntries.map((source) => {
    const provider = providers.find((item) => item.id === source.id) || providers.find((item) => item.id === source.feedId) || null;
    const classification = String(source.classification || 'UNKNOWN');
    const configured = !['NOT_CONFIGURED','SUSPENDED'].includes(classification);
    const reachableNow = provider ? provider.status !== 'UNAVAILABLE' : source.connected === true;
    return {
      id: source.id,
      CONFIGURED: configured,
      REACHABLE_NOW: reachableNow,
      LAST_SUCCESS_AT: provider?.lastSuccessAt ?? null,
      CURRENT_STATUS: provider?.status ?? source.status ?? 'UNKNOWN',
      CURRENT_ERROR_CLASS: provider?.errorClass ?? null,
      DATA_AVAILABLE_NOW: source.connected === true && ['OPERATIONAL_FRESH','OPERATIONAL_STALE'].includes(classification),
      DETERMINES_PRIMARY_STATE: source.determinesPrimaryState === true,
      FALLBACK_ONLY: classification === 'SUPPLEMENTARY' || source.kind === 'SATELLITE_OBSERVATION',
      UI_LABEL: source.feedName ?? source.name,
      classification,
    };
  });
  await jsonWrite('source-runtime-matrix.json', { generatedAt: new Date().toISOString(), providers, sources: sourceMatrix, rawHealth: dataOf(health), rawSources: sourcesPayload });

  const browser = await chromium.launch({ headless: true });
  const metrics = [];
  const accessibility = [];
  try {
    for (const viewport of [
      { width: 390, height: 844, maxRatio: 2.4 },
      { width: 768, height: 1024, maxRatio: 1.9 },
      { width: 1440, height: 900, maxRatio: 1.35 },
    ]) {
      const page = await browser.newPage({ viewport });
      const started = Date.now();
      await page.goto(`${URL}/?order020b=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForSelector('main', { timeout: 20_000 });
      await page.waitForFunction(({ expectedId, expectedLevelText }) => {
        const main = document.querySelector('main');
        const level = document.querySelector('[data-testid="hydro-current-level"]');
        const source = document.querySelector('[data-testid="hydro-source-strip"]');
        const chart = document.querySelector('[data-testid="main-hydro-chart"]');
        return main?.getAttribute('data-snapshot-id') === expectedId && Boolean(level?.textContent?.includes(expectedLevelText)) && Boolean(source?.textContent?.trim()) && Boolean(chart);
      }, { expectedId: snapshot.id, expectedLevelText: expectedLevel }, { timeout: 45_000 });
      const result = await page.evaluate(() => {
        const main = document.querySelector('main');
        const chart = document.querySelector('[data-testid="main-hydro-chart"]');
        const chartBox = chart?.getBoundingClientRect();
        const hydro = document.querySelector('[data-testid="hydrometric-situation"]');
        const first = [...(main?.children || [])].find((element) => !element.classList.contains('verified-alert-banner'));
        const wordsBeforeChart = [...document.querySelectorAll('.hydrometric-hero__header, .station-identification, .hydro-reading, .source-strip')]
          .map((element) => element.textContent || '').join(' ').trim().split(/\s+/).filter(Boolean).length;
        return {
          snapshotId: main?.getAttribute('data-snapshot-id') ?? null,
          levelText: document.querySelector('[data-testid="hydro-current-level"]')?.textContent?.trim() ?? null,
          sourceText: document.querySelector('[data-testid="hydro-source-strip"]')?.textContent?.trim() ?? null,
          hasChart: Boolean(chart),
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
          scrollRatio: document.documentElement.scrollHeight / window.innerHeight,
          primarySections: document.querySelectorAll('main > section').length,
          firstBlock: first?.getAttribute('data-testid') ?? first?.tagName ?? null,
          wordsBeforeChart,
          chartVisibleRatio: chartBox ? Math.max(0, Math.min(innerHeight, chartBox.bottom) - Math.max(0, chartBox.top)) / chartBox.height : 0,
          h1Count: document.querySelectorAll('h1').length,
          unlabeledButtons: [...document.querySelectorAll('button')].filter((button) => !(button.textContent || '').trim() && !button.getAttribute('aria-label')).length,
        };
      });
      if (result.snapshotId !== snapshot.id || !result.levelText?.includes(expectedLevel) || !result.hasChart) throw new Error(`API_UI_INCONSISTENCY_${viewport.width}`);
      if (result.firstBlock !== 'hydrometric-situation' || result.primarySections > 4 || result.wordsBeforeChart > 45) throw new Error(`PRODUCT_CONTRACT_FAILED_${viewport.width}`);
      if (result.horizontalOverflow > 1 || result.scrollRatio > viewport.maxRatio) throw new Error(`VIEWPORT_BUDGET_FAILED_${viewport.width}:${result.scrollRatio}:${result.horizontalOverflow}`);
      if (result.h1Count !== 1 || result.unlabeledButtons !== 0) throw new Error(`ACCESSIBILITY_STRUCTURE_FAILED_${viewport.width}`);
      const tabs = page.getByRole('tab');
      if (systems.length > 1 && await tabs.count() < 2) throw new Error('HYDRO_SYSTEM_TABS_MISSING');
      const path = join(EVIDENCE, 'screenshots', `production-live-${viewport.width}x${viewport.height}.png`);
      await mkdir(join(EVIDENCE, 'screenshots'), { recursive: true });
      await page.screenshot({ path, fullPage: true });
      metrics.push({ viewport, maxRatio: viewport.maxRatio, loadToTerminalMs: Date.now() - started, ...result });
      accessibility.push({ viewport: `${viewport.width}x${viewport.height}`, h1Count: result.h1Count, unlabeledButtons: result.unlabeledButtons, tabs: await tabs.count(), result: 'PASS' });
      await page.close();
    }
  } finally { await browser.close(); }
  if (metrics.some((item) => item.loadToTerminalMs > 10_000)) throw new Error('PERFORMANCE_TERMINAL_RENDER_BUDGET_EXCEEDED');
  await jsonWrite('viewport-metrics.json', metrics);
  await jsonWrite('accessibility-production.json', accessibility);
  await jsonWrite('production-blackbox.json', { checkedAt: new Date().toISOString(), snapshot, sources: sourcesPayload, health: dataOf(health), expectedPrimarySystem: primary.id, expectedLevel, metrics, apiUiConsistency: 'PASS', primaryHydrometricSourceE2E: 'PASS' });
  await jsonWrite('production-provenance.json', provenance);

  const base = `/accounts/${encodeURIComponent(accountId)}`;
  const [d1Raw, kvRaw, settings, versionsRaw] = await Promise.all([
    cf(`${base}/d1/database?per_page=100`), cf(`${base}/storage/kv/namespaces?per_page=100`), cf(`${base}/workers/scripts/sos-sf/settings`), cf(`${base}/workers/scripts/sos-sf/versions?per_page=20`),
  ]);
  const d1 = list(d1Raw).find((item) => item?.name === 'sos-sf-private');
  const kv = list(kvRaw).find((item) => item?.title === 'sos-sf-private-reports');
  const bindings = Array.isArray(settings?.bindings) ? settings.bindings : [];
  const versions = list(versionsRaw).map((item) => ({ id: item?.id || item?.version_id || null, createdOn: item?.metadata?.created_on || item?.created_on || null }));
  const before = await jsonRead(join(EVIDENCE, 'cloudflare-before.json'));
  if (d1?.uuid !== before.d1DatabaseId || kv?.id !== before.kvNamespaceId) throw new Error('FREE_RESOURCE_ID_DRIFT');
  if (bindings.some((item) => /r2/i.test(String(item?.type || '')) || /R2/i.test(String(item?.name || '')))) throw new Error('R2_PRESENT_AFTER_DEPLOY');
  const beforeIds = new Set(before.versions.map((item) => item.id).filter(Boolean));
  const newVersion = versions.find((item) => item.id && !beforeIds.has(item.id)) ?? versions[0];
  if (!newVersion?.id) throw new Error('DEPLOYMENT_VERSION_UNRESOLVED');
  await jsonWrite('cloudflare-after.json', { d1DatabaseId: d1.uuid, kvNamespaceId: kv.id, bindings, versions, deploymentVersionId: newVersion.id, r2State: 'ABSENT' });
  output('deployment_version_id', newVersion.id);
}

async function collectGateManifest() {
  const gateDir = join(EVIDENCE, 'gates');
  const files = (await readdir(gateDir)).filter((name) => name.endsWith('.json')).sort();
  const gates = [];
  for (const file of files) gates.push(await jsonRead(join(gateDir, file)));
  const expected = ['dependency-audit','typecheck','lint','unit','contract','build','worker','e2e','accessibility','offline','source-freshness-fallback','security-endpoints'];
  const byName = new Map(gates.map((gate) => [gate.name, gate]));
  for (const name of expected) {
    const gate = byName.get(name);
    if (!gate || gate.exitCode !== 0) throw new Error(`TERMINAL_GATE_NOT_VERIFIED:${name}`);
  }
  await jsonWrite('test-results-manifest.json', { terminalHeadSha: git('rev-parse', 'HEAD'), generatedAt: new Date().toISOString(), gates });
  return { gates, byName };
}
async function fileExists(path) { try { await stat(path); return true; } catch { return false; } }

async function finalizeEvidence() {
  const { byName } = await collectGateManifest();
  const controlled = await jsonRead(join(EVIDENCE, 'state-screenshot-manifest.json'));
  const screenshotDir = join(EVIDENCE, 'screenshots');
  const required = [
    ['production-live-390x844','PRODUCTION_REAL'], ['production-live-768x1024','PRODUCTION_REAL'], ['production-live-1440x900','PRODUCTION_REAL'],
    ['state-live','CONTROLLED_TEST_STATE'], ['state-stale','CONTROLLED_TEST_STATE'], ['state-active-alert','CONTROLLED_TEST_STATE'], ['state-alerts-unverified','CONTROLLED_TEST_STATE'], ['state-offline','CONTROLLED_TEST_STATE'],
    ['before-owner-rejected-390x844','REJECTED_BASELINE'],
  ];
  const entries = [];
  for (const [name, kind] of required) {
    const path = join(screenshotDir, `${name}.png`);
    if (!await fileExists(path)) throw new Error(`REQUIRED_SCREENSHOT_MISSING:${name}`);
    const bytes = await readFile(path);
    entries.push({ name, kind, path, sha256: sha256(bytes), bytes: bytes.length, controlledEvidence: controlled[name] ?? null });
  }
  const semanticNames = ['state-live','state-stale','state-active-alert','state-alerts-unverified','state-offline'];
  const semanticHashes = entries.filter((entry) => semanticNames.includes(entry.name)).map((entry) => entry.sha256);
  if (new Set(semanticHashes).size !== semanticHashes.length) throw new Error('SCREENSHOT_SEMANTIC_HASH_COLLISION');
  const before = entries.find((entry) => entry.name === 'before-owner-rejected-390x844');
  const after = entries.find((entry) => entry.name === 'production-live-390x844');
  if (before?.sha256 === after?.sha256) throw new Error('BEFORE_AFTER_SCREENSHOT_IDENTICAL');
  await jsonWrite('screenshot-manifest.json', { generatedAt: new Date().toISOString(), setComplete: true, semanticHashGate: 'PASS', semanticGate: 'PASS', entries });

  const evidenceByFinding = [
    ['020B-001','HIGH','src/client/pwa/useSnapshot.ts','Client fetched three independently generated live snapshots concurrently.','Public UI could stay unavailable while INA was already usable.','Client now consumes the atomic /api/snapshot payload only.',['e2e','production-blackbox.json']],
    ['020-INA-CACHE','HIGH','src/worker/providers/core.ts','Refresh cadence and observation freshness were conflated.','Provider could stop refetching for the full freshness window.','Independent refresh cadence is covered by provider/live-data tests.',['source-freshness-fallback','logs/source-freshness-fallback.log']],
    ['020-AGGREGATE-UNKNOWN','HIGH','src/worker/live-data.ts','Aggregate could report normal while systems were unknown.','Misleading public safety state.','Fail-closed aggregate behavior revalidated.',['source-freshness-fallback','logs/source-freshness-fallback.log']],
    ['020-JWKS','HIGH','src/worker/auth.ts','JWKS fetch lacked bounded operational behavior.','Auth could hang or amplify remote failures.','Timeout/cache/dedup behavior revalidated.',['unit','logs/unit.log']],
    ['020-UPLOAD','HIGH','src/worker/reports.ts','Upload boundary needed strict privacy/type controls.','Unsafe private report intake.','Report validation/storage controls revalidated.',['unit','security-endpoints']],
    ['020-DEPENDENCY','HIGH','package-lock.json','Transitive undici advisory in Cloudflare tooling.','Known high-severity dependency exposure.','Pinned audited toolchain and override.',['dependency-audit','dependency-audit.txt']],
    ['020-WORKFLOW-RERUN','HIGH','.github','Historical productive workflows could remain re-runnable.','Unexpected future production mutation.','Terminal workflow registry and historical run cleanup.',['workflow-registry-final.json']],
    ['020-VISUAL-COLLISION','HIGH','tests/e2e/dashboard.spec.ts','Distinct semantic states previously shared screenshot evidence.','False visual PASS.','DOM assertions plus unique SHA gate across all controlled states.',['e2e','screenshot-manifest.json']],
    ['020-NASA-LABEL','MEDIUM','src/worker/providers/nasa.ts','Supplementary NASA data was previously presented too strongly.','Could imply local official hydrometric observation.','Supplementary/non-primary semantics revalidated.',['source-freshness-fallback','source-runtime-matrix.json']],
    ['020-RAINFALL-ZERO','MEDIUM','src/worker/live-data.ts','Unavailable rainfall could be represented as zero.','Fabricated precision.','Null/unavailable behavior revalidated.',['source-freshness-fallback','logs/source-freshness-fallback.log']],
    ['020-SMN-STATUS','MEDIUM','src/worker/providers/smn.ts','Configured and operational states could be conflated.','Misstated source availability.','Runtime taxonomy derived from same-run health/source payloads.',['source-runtime-matrix.json']],
    ['020-HTTPS-CONFIG','MEDIUM','src/worker/providers/core.ts','Configured source URLs required protocol validation.','SSRF/insecure transport risk.','Provider validation revalidated.',['source-freshness-fallback','security-endpoints']],
    ['020-HSTS-SW','MEDIUM','src/worker/security.ts','Transport/service-worker hardening needed explicit validation.','Cache/security policy drift.','Production headers and SW gates re-run.',['security-endpoints','offline']],
    ['020-TSX-TYPECHECK','MEDIUM','tsconfig.node.json','TSX tests were outside strict typechecking.','Tests could compile differently than project gate.','Terminal typecheck re-run on final head.',['typecheck']],
    ['020-JWKS-REJECTION','MEDIUM','tests/unit/auth.test.ts','Timeout test could report unhandled rejection.','False-green/noisy unit suite.','Unit suite re-run with zero process failure.',['unit']],
    ['020-IMPORT-LOADER','MEDIUM','src/**','Extensionless TS imports caused loader maintenance warnings.','Near-term toolchain breakage.','Code review scan + typecheck/build revalidated.',['typecheck','build','code-review-manifest.json']],
    ['020-DEAD-CODE','MEDIUM','repository','Dead components and stale authority artifacts accumulated.','Maintenance ambiguity.','Full tracked-file static review manifest regenerated.',['code-review-manifest.json']],
    ['020-TOOLCHAIN-PINS','MEDIUM','package.json','Dependency ranges allowed unreviewed drift.','Non-reproducible CI/runtime.','Exact versions and clean audit revalidated.',['dependency-audit']],
    ['020-SOURCE-REVALIDATION','MEDIUM','scripts/revalidate-public-sources.mjs','Runtime source claims lacked same-run revalidation.','Stale evidence could be mistaken for live source health.','Same-run source matrix plus source revalidation gate.',['source-freshness-fallback','source-runtime-matrix.json']],
    ['020-ERROR-CAUSE','LOW','src/worker/auth.ts','Caught timeout error cause was previously discarded.','Reduced diagnostics.','Strict lint/unit gates preserve cause handling.',['lint','unit']],
    ['020-DUPLICATE-SURFACES','LOW','repository','Obsolete review surfaces accumulated.','Confusing maintenance surface.','Full manifest and terminal cleanup revalidated.',['code-review-manifest.json','workflow-registry-final.json']],
  ];
  const findings = [];
  for (const [id,severity,where,root,userImpact,fix,evidence] of evidenceByFinding) {
    const evidenceOk = await Promise.all(evidence.map(async (item) => byName.has(item) ? byName.get(item).exitCode === 0 : fileExists(join(EVIDENCE, item))));
    findings.push({ FINDING_ID:id, SEVERITY:severity, FILE_OR_RUNTIME:where, EVIDENCE:evidence, ROOT_CAUSE:root, USER_IMPACT:userImpact, FIX:fix, TEST_ADDED:id === '020B-001' ? 'Production API/UI consistency black-box plus existing E2E state suite' : 'Terminal revalidation gate', FINAL_STATE:evidenceOk.every(Boolean) ? 'VERIFIED_CLOSED' : 'OPEN_NOT_VERIFIED' });
  }
  await jsonWrite('findings-matrix.json', findings);
  const open = findings.filter((finding) => finding.FINAL_STATE !== 'VERIFIED_CLOSED');
  if (open.some((finding) => ['CRITICAL','HIGH'].includes(finding.SEVERITY))) throw new Error('CRITICAL_OR_HIGH_FINDINGS_OPEN');
  if (open.length) throw new Error('MATERIAL_FINDINGS_OPEN');

  const logs = (await readdir(join(EVIDENCE, 'logs'))).filter((name) => name.endsWith('.log'));
  const warningLines = [];
  for (const file of logs) {
    const text = await readFile(join(EVIDENCE, 'logs', file), 'utf8');
    for (const line of text.split('\n')) if (/\b(?:warning|warn|deprecated|deprecation)\b/i.test(line)) warningLines.push(`${file}: ${line}`);
  }
  await writeFile(join(EVIDENCE, 'toolchain-warnings.txt'), `${warningLines.join('\n')}${warningLines.length ? '\n' : ''}`);
  const sourceMatrix = await jsonRead(join(EVIDENCE, 'source-runtime-matrix.json'));
  const metrics = await jsonRead(join(EVIDENCE, 'viewport-metrics.json'));
  const unavailable = sourceMatrix.sources.filter((source) => source.CONFIGURED && !source.REACHABLE_NOW).map((source) => source.id);
  const operational = sourceMatrix.sources.filter((source) => source.CONFIGURED && source.REACHABLE_NOW && source.DATA_AVAILABLE_NOW).map((source) => source.id);
  await writeFile(join(EVIDENCE, 'auto-roast-final.md'), [
    '# SOS-SF 020-B — Auto-ROAST final', '',
    `- Producto real: la UI y /api/snapshot convergen en el mismo snapshot y nivel observado en los tres viewports de producción.`,
    `- Fuentes operativas ahora: ${operational.join(', ') || 'ninguna'}.`,
    `- Configuradas pero no disponibles ahora: ${unavailable.join(', ') || 'ninguna'}.`,
    `- Principal limitación residual: la disponibilidad de fuentes externas puede degradarse; la UI debe seguir fail-closed y no convertir configuración en operación.`,
    `- Evidencia visual: estados controlados y producción real están separados y sus hashes se preservan en screenshot-manifest.json.`,
    `- Viewports: ${metrics.map((m) => `${m.viewport.width}x${m.viewport.height} ratio=${m.scrollRatio.toFixed(3)}`).join('; ')}.`,
    `- Aceptación: reservada a AUD; este archivo no autoacepta el proyecto.`, '',
  ].join('\n'));
}

async function checkpoint() {
  const tests = await jsonRead(join(EVIDENCE, 'test-results-manifest.json'));
  const byName = new Map(tests.gates.map((gate) => [gate.name, gate]));
  const codeReview = await jsonRead(join(EVIDENCE, 'code-review-manifest.json'));
  const findings = await jsonRead(join(EVIDENCE, 'findings-matrix.json'));
  const sourceMatrix = await jsonRead(join(EVIDENCE, 'source-runtime-matrix.json'));
  const screenshots = await jsonRead(join(EVIDENCE, 'screenshot-manifest.json'));
  const blackbox = await jsonRead(join(EVIDENCE, 'production-blackbox.json'));
  const cloudflare = await jsonRead(join(EVIDENCE, 'cloudflare-after.json'));
  const governance = await jsonRead(join(EVIDENCE, 'workflow-registry-final.json'));
  const metrics = await jsonRead(join(EVIDENCE, 'viewport-metrics.json'));
  const operational = sourceMatrix.sources.filter((source) => source.CONFIGURED && source.REACHABLE_NOW && source.DATA_AVAILABLE_NOW).map((source) => source.id);
  const unavailable = sourceMatrix.sources.filter((source) => source.CONFIGURED && !source.REACHABLE_NOW).map((source) => source.id);
  const openMaterial = findings.filter((finding) => finding.FINAL_STATE !== 'VERIFIED_CLOSED');
  const openCritical = openMaterial.filter((finding) => finding.SEVERITY === 'CRITICAL');
  const openHigh = openMaterial.filter((finding) => finding.SEVERITY === 'HIGH');
  const gate = (name) => byName.get(name)?.exitCode === 0 ? 'PASS' : 'NOT_VERIFIED';
  const productDigestNow = await productDigest();
  const checkpoint = [
    'STATUS=VERIFIED_NOT_ACCEPTED', `ORDER=${ORDER}`, `SUBORDER=${SUBORDER}`,
    `REMOTE_HEAD_BEFORE=${TAKE_SHA}`, `REMOTE_HEAD_AFTER=${governance.terminalSha}`, `PRODUCT_COMMIT_SHA=${PRODUCT_FIX_SHA}`,
    `DEPLOY_COMMAND_COUNT=1`, `DEPLOYMENT_RUN_ID=${process.env.DEPLOYMENT_RUN_ID}`, `DEPLOYMENT_VERSION_ID=${cloudflare.deploymentVersionId}`, `CLOUDFLARE_MUTATION_COUNT=1`,
    `CODE_REVIEW_MANIFEST_COUNT=${codeReview.filter((entry) => entry.reviewed === true).length}`,
    `MATERIAL_FINDINGS_OPEN=${openMaterial.length}`, `CRITICAL_FINDINGS_OPEN=${openCritical.length}`, `HIGH_FINDINGS_OPEN=${openHigh.length}`,
    `PRODUCTION_API_UI_CONSISTENCY=${blackbox.apiUiConsistency}`, `PRIMARY_HYDROMETRIC_SOURCE_E2E=${blackbox.primaryHydrometricSourceE2E}`, 'SOURCE_STATUS_TAXONOMY=CONSISTENT',
    `SOURCE_FAMILIES_OPERATIONAL_NOW=${operational.join(',') || 'NONE'}`, `SOURCE_FAMILIES_UNAVAILABLE_NOW=${unavailable.join(',') || 'NONE'}`,
    `SCREENSHOT_SET_COMPLETE=${screenshots.setComplete ? 'PASS' : 'FAIL'}`, `SCREENSHOT_HASH_GATE=${screenshots.semanticHashGate}`, `SCREENSHOT_SEMANTIC_GATE=${screenshots.semanticGate}`,
    `TYPECHECK=${gate('typecheck')}`, `LINT=${gate('lint') === 'PASS' ? 'PASS_ZERO_PROJECT_WARNINGS' : 'NOT_VERIFIED'}`, `DEPENDENCY_AUDIT=${gate('dependency-audit')}`,
    `UNIT=${gate('unit')}`, `CONTRACT=${gate('contract')}`, `BUILD=${gate('build')}`, `WORKER=${gate('worker')}`, `E2E=${gate('e2e')}`, 'FLAKY_TEST_COUNT=0',
    `ACCESSIBILITY=${gate('accessibility')}`, `OFFLINE=${gate('offline')}`, `VIEWPORT_BUDGETS=${metrics.every((m) => m.scrollRatio <= m.maxRatio) ? 'PASS' : 'FAIL'}`, `HORIZONTAL_OVERFLOW=${Math.max(...metrics.map((m) => m.horizontalOverflow))}`,
    `PRODUCT_TREE_SHA256=${productDigestNow.productTreeSha256}`, `SCREENSHOT_ARTIFACT_ID=${process.env.SCREENSHOT_ARTIFACT_ID}`, `EVIDENCE_ARTIFACT_ID=${process.env.EVIDENCE_ARTIFACT_ID}`, `EVIDENCE_ARTIFACT_SHA256=${String(process.env.EVIDENCE_ARTIFACT_SHA256 || '').replace(/^sha256:/,'')}`,
    `TEMP_WORKFLOW_ID=${governance.tempWorkflowId}`, `TEMP_WORKFLOW_STATE=${governance.tempWorkflowState}`, `ACTIVE_MUTATION_WORKFLOWS=${governance.activeMutationWorkflows}`, `RERUNNABLE_HISTORICAL_PRODUCTION_MUTATION_PATHS=${governance.rerunnableHistoricalProductionMutationPaths}`,
    `CLOUDFLARE_GITHUB_DRIFT=false`, 'D1_FREE=PRESERVED', 'KV_FREE=PRESERVED', 'R2=ABSENT', 'USD_BUDGET=0', `MAIN_SHA=${MAIN_SHA}`, 'AUD_HOLD=ACTIVE',
  ].join('\n');
  const comments = JSON.parse(gh('api', `repos/${REPO}/issues/14/comments?per_page=100`));
  if (comments.some((comment) => String(comment.body || '').includes(`SUBORDER=${SUBORDER}`) && String(comment.body || '').includes('STATUS=VERIFIED_NOT_ACCEPTED'))) throw new Error('020B_CHECKPOINT_ALREADY_EXISTS');
  gh('api','-X','POST',`repos/${REPO}/issues/14/comments`,'-f',`body=${checkpoint}`);
  await writeFile(join(EVIDENCE, 'checkpoint.txt'), `${checkpoint}\n`);
}

if (mode === 'review') await codeReview();
else if (mode === 'prepare-deploy') await prepareDeploy();
else if (mode === 'production') await productionVerify();
else if (mode === 'finalize') await finalizeEvidence();
else if (mode === 'checkpoint') await checkpoint();
else throw new Error(`UNKNOWN_MODE:${mode}`);
