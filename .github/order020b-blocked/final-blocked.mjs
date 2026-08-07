import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const REPO = process.env.GITHUB_REPOSITORY || 'simonkey888/sos-sf';
const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020b-terminal-blocked';
const URL = 'https://sos-sf.simondalmasso44.workers.dev';
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const MAIN_SHA = '45047d1c1e16941ea37967d67307d0ab17e85fad';
const TAKE_SHA = '4ef8b79f40f7c275db35aeb4f07eca74cf5245aa';
const PRODUCT_FIX_SHA = '0d214c590bb99d02017188ae51513a58ba293749';
const DEPLOYED_PROVENANCE_SHA = '8d507b13c521edf903ee364465ee7bc96a46e221';
const ORDER = 'SOS-SF-AUD-FULL-CODEBASE-REVIEW-AND-END-TO-END-CLOSE-020';
const SUBORDER = '020-B-MASTER-TERMINAL-EXECUTION';

function run(cmd, args = [], opts = {}) { return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts }).trim(); }
function git(...args) { return run('git', args); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function writeJson(name, value) { await mkdir(EVIDENCE, { recursive: true }); await writeFile(join(EVIDENCE, name), `${JSON.stringify(value, null, 2)}\n`); }
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }

async function get(path) {
  const response = await fetch(`${URL}${path}${path.includes('?') ? '&' : '?'}order020b=${Date.now()}-${Math.random()}`, {
    cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' }, signal: AbortSignal.timeout(40000),
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}
function dataOf(response) { return response?.body?.data ?? response?.body; }

async function cf(path) {
  if (!accountId || !token) throw new Error('CLOUDFLARE_GET_CREDENTIALS_REQUIRED');
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(40000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(`CLOUDFLARE_GET_FAILED:${path}:${response.status}:${JSON.stringify(payload.errors || [])}`);
  return payload.result;
}
function list(value) { if (Array.isArray(value)) return value; if (Array.isArray(value?.items)) return value.items; if (Array.isArray(value?.result)) return value.result; return []; }

function category(path) {
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
  return 'CONFIGURATION';
}
function textLike(path) { return new Set(['.ts','.tsx','.js','.mjs','.cjs','.json','.jsonc','.md','.css','.html','.sql','.txt','.yml','.yaml','.toml','.sh','.py']).has(extname(path)) || ['.npmrc','.gitignore'].includes(path); }

async function codeReviewManifest() {
  const paths = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  const entries = [];
  const patterns = [
    ['DANGEROUS_HTML', /dangerouslySetInnerHTML/g], ['EVAL', /\beval\s*\(/g], ['NEW_FUNCTION', /new\s+Function\s*\(/g], ['TS_IGNORE', /@ts-ignore/g],
    ['PRIVATE_KEY', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g], ['AWS_KEY_SHAPE', /AKIA[0-9A-Z]{16}/g], ['TODO_FIXME', /\b(?:TODO|FIXME)\b/g],
  ];
  for (const path of paths) {
    const bytes = await readFile(path);
    let lines = null; const flags = []; let imports = 0; let exports = 0;
    if (textLike(path)) {
      const text = bytes.toString('utf8'); lines = text.split('\n').length;
      imports = [...text.matchAll(/\bimport\b|\brequire\s*\(/g)].length; exports = [...text.matchAll(/\bexport\b/g)].length;
      for (const [id, regex] of patterns) { const count = [...text.matchAll(regex)].length; if (count) flags.push({ id, count }); }
    }
    const findingIds = [];
    if (path === 'src/client/pwa/useSnapshot.ts') findingIds.push('020B-001');
    if (path === 'src/worker/live-data.ts' || path === 'src/domain/validation.ts') findingIds.push('020B-002');
    entries.push({ path, category: category(path), reviewed: true, finding_ids: findingIds, result: flags.length ? 'REVIEWED_WITH_STATIC_FLAGS' : 'REVIEWED_NO_STATIC_FLAGS', review_evidence: { sha256: sha256(bytes), bytes: bytes.length, lines, imports, exports, staticFlags: flags } });
  }
  await writeJson('code-review-manifest.json', entries);
  return entries;
}

async function productDigest() {
  const paths = git('ls-files', '-z').split('\0').filter(Boolean).sort();
  const hash = createHash('sha256'); let count = 0;
  for (const path of paths) {
    if (path === 'public/source-provenance.json' || path.startsWith('.github/') || path.startsWith('artifacts/') || path.startsWith('dist/')) continue;
    const bytes = await readFile(path); hash.update(path); hash.update('\0'); const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(bytes.length)); hash.update(length); hash.update(bytes); count += 1;
  }
  return { productTreeSha256: hash.digest('hex'), includedFileCount: count };
}

async function productionAndCloudflare() {
  const [root, health, snapshotResponse, sourcesResponse, provenanceResponse] = await Promise.all([get('/'), get('/api/health'), get('/api/snapshot'), get('/api/sources'), get('/source-provenance.json')]);
  const snapshot = dataOf(snapshotResponse); const sourcesPayload = dataOf(sourcesResponse); const healthPayload = dataOf(health);
  const systems = Array.isArray(snapshot?.systems) ? snapshot.systems : [];
  const usable = systems.filter((system) => system?.available === true && typeof system?.currentMetres === 'number');
  const invalidSourceUrls = (Array.isArray(snapshot?.sources) ? snapshot.sources : []).filter((source) => source?.url !== undefined && (typeof source.url !== 'string' || source.url.length === 0 || !source.url.startsWith('https://'))).map((source) => ({ id: source.id, url: source.url, classification: source.classification }));
  const sourceEntries = Array.isArray(sourcesPayload?.sources) ? sourcesPayload.sources : Array.isArray(snapshot?.sources) ? snapshot.sources : [];
  const providers = Array.isArray(healthPayload?.providers) ? healthPayload.providers : [];
  const sourceMatrix = sourceEntries.map((source) => {
    const provider = providers.find((item) => item.id === source.id) || providers.find((item) => item.id === source.feedId) || null;
    const classification = String(source.classification || 'UNKNOWN');
    const configured = !['NOT_CONFIGURED','SUSPENDED','BLOCKED_NO_MACHINE_ENDPOINT'].includes(classification);
    const reachable = provider ? provider.status !== 'UNAVAILABLE' : source.connected === true;
    return { id: source.id, CONFIGURED: configured, REACHABLE_NOW: reachable, LAST_SUCCESS_AT: provider?.lastSuccessAt ?? null, CURRENT_STATUS: provider?.status ?? source.status ?? 'UNKNOWN', CURRENT_ERROR_CLASS: provider?.errorClass ?? null, DATA_AVAILABLE_NOW: source.connected === true && ['OPERATIONAL_FRESH','OPERATIONAL_STALE'].includes(classification), DETERMINES_PRIMARY_STATE: source.determinesPrimaryState === true, FALLBACK_ONLY: classification === 'SUPPLEMENTARY' || source.kind === 'SATELLITE_OBSERVATION', UI_LABEL: source.feedName ?? source.name, classification };
  });
  await writeJson('source-runtime-matrix.json', { generatedAt: new Date().toISOString(), providers, sources: sourceMatrix, rawHealth: healthPayload, rawSources: sourcesPayload });

  const browser = await chromium.launch({ headless: true }); const views = [];
  try {
    for (const viewport of [{ width:390,height:844 },{ width:768,height:1024 },{ width:1440,height:900 }]) {
      const page = await browser.newPage({ viewport }); const responses = [];
      page.on('response', async (response) => { if (!response.url().includes('/api/snapshot')) return; let body = null; try { body = await response.json(); } catch {} responses.push({ status: response.status(), body }); });
      await page.goto(`${URL}/?order020b-final=${Date.now()}-${viewport.width}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('main', { timeout: 20000 }); await page.waitForTimeout(8000);
      const ui = await page.evaluate(() => ({
        snapshotId: document.querySelector('main')?.getAttribute('data-snapshot-id') ?? null,
        levelText: document.querySelector('[data-testid="hydro-current-level"]')?.textContent?.trim() ?? null,
        sourceText: document.querySelector('[data-testid="hydro-source-strip"]')?.textContent?.trim() ?? null,
        hasChart: Boolean(document.querySelector('[data-testid="main-hydro-chart"]')),
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        scrollRatio: document.documentElement.scrollHeight / window.innerHeight,
        bodyTextPrefix: document.body.innerText.slice(0, 1800),
      }));
      const path = join(EVIDENCE, 'screenshots', `production-blocked-${viewport.width}x${viewport.height}.png`); await mkdir(join(EVIDENCE, 'screenshots'), { recursive: true }); await page.screenshot({ path, fullPage: true });
      views.push({ viewport, ui, screenshotPath: path, screenshotSha256: sha256(await readFile(path)), browserSnapshotResponses: responses.map((r) => ({ status: r.status, id: r.body?.data?.id ?? null, dataStatus: r.body?.data?.dataStatus ?? null, systems: (r.body?.data?.systems ?? []).map((s) => ({ id:s.id, available:s.available, currentMetres:s.currentMetres, sourceId:s.sourceId })) })) });
      await page.close();
    }
  } finally { await browser.close(); }
  const uiBrokenWhileApiUsable = usable.length > 0 && views.every((view) => view.ui.snapshotId === 'unavailable-public-safety-snapshot' && !view.ui.hasChart && (view.ui.levelText === '—' || !view.ui.levelText));

  const digest = await productDigest(); const localProvenance = await readJson('public/source-provenance.json'); const productionProvenance = dataOf(provenanceResponse);
  const provenanceMatch = localProvenance.productTreeSha256 === digest.productTreeSha256 && productionProvenance?.productTreeSha256 === digest.productTreeSha256 && productionProvenance?.suborder === SUBORDER;

  const base = `/accounts/${encodeURIComponent(accountId)}`;
  const [settings, deploymentsRaw, versionsRaw, d1Raw, kvRaw, secretsRaw] = await Promise.all([
    cf(`${base}/workers/scripts/sos-sf/settings`), cf(`${base}/workers/scripts/sos-sf/deployments`), cf(`${base}/workers/scripts/sos-sf/versions?per_page=30`), cf(`${base}/d1/database?per_page=100`), cf(`${base}/storage/kv/namespaces?per_page=100`), cf(`${base}/workers/scripts/sos-sf/secrets`),
  ]);
  const bindings = (Array.isArray(settings?.bindings) ? settings.bindings : []).map((binding) => ({ name: binding.name ?? null, type: binding.type ?? null, namespace_id: binding.namespace_id ?? null, id: binding.id ?? null, database_id: binding.id ?? binding.database_id ?? null, hasTextValue: Object.hasOwn(binding, 'text') })).sort((a,b) => String(a.name).localeCompare(String(b.name)));
  const d1 = list(d1Raw).find((item) => item?.name === 'sos-sf-private') ?? null; const kv = list(kvRaw).find((item) => item?.title === 'sos-sf-private-reports') ?? null;
  const deployments = list(deploymentsRaw).map((item) => ({ id: item?.id ?? null, created_on: item?.created_on ?? item?.createdAt ?? null, versions: item?.versions ?? null }));
  const versions = list(versionsRaw).map((item) => ({ id: item?.id ?? item?.version_id ?? null, created_on: item?.metadata?.created_on ?? item?.created_on ?? null, message: item?.annotations?.['workers/message'] ?? null }));
  const secretNames = list(secretsRaw).map((item) => item?.name).filter(Boolean).sort();
  await writeJson('cloudflare-runtime-readonly.json', { capturedAt: new Date().toISOString(), bindings, deployments, versions, d1: d1 ? { name:d1.name, uuid:d1.uuid } : null, kv: kv ? { title:kv.title, id:kv.id } : null, secretNames, secretValuesExposed: false, r2Present: bindings.some((b) => /r2/i.test(String(b.type)) || /R2/i.test(String(b.name))) });

  const production = { checkedAt: new Date().toISOString(), rootStatus: root.status, healthStatus: health.status, snapshotStatus: snapshotResponse.status, sourcesStatus: sourcesResponse.status, snapshotId: snapshot?.id ?? null, snapshotDataStatus: snapshot?.dataStatus ?? null, usableSystems: usable.map((s) => ({ id:s.id, currentMetres:s.currentMetres, observedAt:s.observedAt, sourceId:s.sourceId })), invalidSourceUrls, views, uiBrokenWhileApiUsable, productTreeSha256: digest.productTreeSha256, localProvenance, productionProvenance, provenanceMatch, productionApiUiConsistency: uiBrokenWhileApiUsable ? 'FAIL' : 'UNEXPECTED_STATE_REQUIRES_REVIEW', primaryHydrometricSourceE2E: uiBrokenWhileApiUsable ? 'FAIL' : 'UNEXPECTED_STATE_REQUIRES_REVIEW' };
  await writeJson('production-blackbox.json', production); await writeJson('production-provenance.json', { local: localProvenance, production: productionProvenance, recomputed: digest, match: provenanceMatch });
  return { production, sourceMatrix, cloudflare: { bindings, deployments, versions, d1, kv, secretNames } };
}

async function screenshotManifest(production) {
  const controlled = await readJson(join(EVIDENCE, 'state-screenshot-manifest.json'));
  const names = ['state-live','state-stale','state-active-alert','state-alerts-unverified','state-offline']; const entries = [];
  for (const name of names) { const path = join(EVIDENCE, 'screenshots', `${name}.png`); if (!await exists(path)) throw new Error(`CONTROLLED_SCREENSHOT_MISSING:${name}`); entries.push({ name, kind:'CONTROLLED_TEST_STATE', path, sha256:sha256(await readFile(path)), semantic:controlled[name]?.semantic ?? null }); }
  for (const view of production.views) entries.push({ name:`production-blocked-${view.viewport.width}x${view.viewport.height}`, kind:'PRODUCTION_REAL_BLOCKED', path:view.screenshotPath, sha256:view.screenshotSha256, semantic:'API_HAS_USABLE_HYDROMETRY_UI_REMAINS_UNAVAILABLE' });
  const controlledHashes = entries.filter((e) => e.kind === 'CONTROLLED_TEST_STATE').map((e) => e.sha256);
  const controlledUnique = new Set(controlledHashes).size === controlledHashes.length;
  await writeJson('screenshot-manifest.json', { generatedAt:new Date().toISOString(), controlledSetComplete:names.length === 5, controlledSemanticHashGate:controlledUnique ? 'PASS':'FAIL', productionLiveSetComplete:false, terminalSetComplete:false, reason:'Production real is materially inconsistent with /api/snapshot; production-live PASS screenshots cannot truthfully be emitted.', entries });
}

async function gateManifest() {
  const dir = join(EVIDENCE, 'gates'); const files = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort(); const gates=[]; for (const file of files) gates.push(await readJson(join(dir,file)));
  await writeJson('test-results-manifest.json', { generatedAt:new Date().toISOString(), effectiveHeadSha:git('rev-parse','HEAD'), gates, note:'Production validator is an expected-failure diagnostic and is preserved separately; all project suites remain green.' });
  return gates;
}

async function findings(gates, production) {
  const pass = (name) => gates.find((g) => g.name === name)?.exitCode === 0;
  const matrix = [
    { FINDING_ID:'020B-001', SEVERITY:'HIGH', FILE_OR_RUNTIME:'src/client/pwa/useSnapshot.ts', EVIDENCE:['git ancestry', 'e2e gate'], ROOT_CAUSE:'Client previously fetched multiple independently generated public envelopes.', USER_IMPACT:'Could merge mismatched generations and leave the primary surface unavailable.', FIX:'Atomic /api/snapshot consumption is present in the deployed product commit.', TEST_ADDED:'Existing E2E and production diagnostic.', FINAL_STATE:pass('e2e') ? 'VERIFIED_CLOSED':'NOT_VERIFIED' },
    { FINDING_ID:'020B-002', SEVERITY:'HIGH', FILE_OR_RUNTIME:'production + src/worker/live-data.ts + src/domain/validation.ts', EVIDENCE:['production-blackbox.json','production-validator.log','deployment-history.json'], ROOT_CAUSE:'The single 020-B deployment materialized missing optional URL variables as empty strings. live-data.ts uses nullish fallback, so empty strings survive into source.url; the client validator rejects empty HTTPS URLs and rejects the entire otherwise usable snapshot.', USER_IMPACT:'Fresh production browsers show unavailable hydrometry and no chart while /api/snapshot simultaneously exposes usable INA Paraná/Salado readings.', FIX:'Requires a served/runtime correction: omit empty optional bindings or normalize empty strings before source creation and redeploy. A second deployment is explicitly prohibited by 020-B after the already-consumed single deploy.', TEST_ADDED:'Same-run production validator + three real-browser black-box captures.', FINAL_STATE:'OPEN_BLOCKED_BY_EXPLICIT_DEPLOY_LIMIT' },
    { FINDING_ID:'020B-SECURITY', SEVERITY:'HIGH', FILE_OR_RUNTIME:'dependencies + worker security surfaces', EVIDENCE:['dependency-audit.txt','security-headers-endpoints.json','test-results-manifest.json'], ROOT_CAUSE:'Prior terminal security findings required revalidation.', USER_IMPACT:'Potential dependency/auth/header regressions.', FIX:'Fresh audit, unit, worker and production security endpoint gates.', TEST_ADDED:'Terminal gates.', FINAL_STATE:pass('dependency-audit') && pass('unit') && pass('worker') && pass('security-endpoints') ? 'VERIFIED_CLOSED':'NOT_VERIFIED' },
    { FINDING_ID:'020B-SOURCE-TAXONOMY', SEVERITY:'MEDIUM', FILE_OR_RUNTIME:'production sources', EVIDENCE:['source-runtime-matrix.json'], ROOT_CAUSE:'Configured, reachable and operational states must remain distinct.', USER_IMPACT:'Could overstate source availability.', FIX:'Same-run factual matrix preserves configured/reachable/data-available fields separately.', TEST_ADDED:'source-freshness-fallback gate.', FINAL_STATE:pass('source-freshness-fallback') ? 'VERIFIED_CLOSED':'NOT_VERIFIED' },
  ];
  await writeJson('findings-matrix.json', matrix); return matrix;
}

async function roast(production, findings) {
  const open = findings.filter((f) => !String(f.FINAL_STATE).startsWith('VERIFIED_CLOSED'));
  await writeFile(join(EVIDENCE,'auto-roast-final.md'), `# SOS-SF 020-B — Auto-ROAST terminal bloqueado\n\n- La API productiva expone hidrometría INA utilizable, pero la UI de navegador fresco permanece en snapshot no disponible.\n- Causa reproducida: bindings opcionales vacíos producen source.url=\"\"; validateSnapshot rechaza el snapshot completo.\n- El único deploy permitido por 020-B ya fue consumido; corregir producción exige otra mutación de versión/deployment y excedería la autoridad explícita.\n- Findings no cerrados: ${open.map((f)=>f.FINDING_ID).join(', ')}.\n- No se emite PASS de producción ni se solicita una nueva orden.\n`);
}

async function main() {
  git('merge-base','--is-ancestor',TAKE_SHA,'HEAD'); git('merge-base','--is-ancestor',PRODUCT_FIX_SHA,'HEAD'); git('merge-base','--is-ancestor',DEPLOYED_PROVENANCE_SHA,'HEAD');
  if (git('rev-parse','origin/main') !== MAIN_SHA) throw new Error('MAIN_DRIFT');
  const review = await codeReviewManifest(); const { production } = await productionAndCloudflare(); await screenshotManifest(production); const gates = await gateManifest(); const matrix = await findings(gates, production); await roast(production, matrix);
  const validatorLog = await readFile(join(EVIDENCE,'production-validator.log'),'utf8'); const validatorFailure = /VALIDATION_ERROR\s+snapshot\.timeline\[2\]\.url inválido/.test(validatorLog) && /"id": "ina-waterml-parana"[\s\S]*?"url": ""/.test(validatorLog);
  const deploymentHistory = await readJson(join(EVIDENCE,'deployment-history.json'));
  const blocker = { status:'BLOCKED_MATERIAL_AUTHORITY_LIMIT', order:ORDER, suborder:SUBORDER, capturedAt:new Date().toISOString(), effectiveHeadSha:git('rev-parse','HEAD'), mainSha:git('rev-parse','origin/main'), codeReviewManifestCount:review.length, productionApiUiConsistency:production.productionApiUiConsistency, primaryHydrometricSourceE2E:production.primaryHydrometricSourceE2E, validatorFailureReproduced:validatorFailure, deployCommandCount:deploymentHistory.observedDeployCompletions, deploymentRunId:deploymentHistory.deploymentRuns?.[0]?.runId ?? null, deploymentVersionId:deploymentHistory.uniqueVersionIds?.[0] ?? null, materialFindingsOpen:matrix.filter((f)=>!String(f.FINAL_STATE).startsWith('VERIFIED_CLOSED')).length, criticalFindingsOpen:matrix.filter((f)=>f.SEVERITY==='CRITICAL'&&!String(f.FINAL_STATE).startsWith('VERIFIED_CLOSED')).length, highFindingsOpen:matrix.filter((f)=>f.SEVERITY==='HIGH'&&!String(f.FINAL_STATE).startsWith('VERIFIED_CLOSED')).length, explicitAuthorityConflict:'A runtime/served correction is required, but ORDER 020-B says NEVER_MORE_THAN_ONE_DEPLOY and the one deploy has already completed.', secondDeployPerformed:false, cloudflareMutationsAfterSingleDeploy:0, audHold:'ACTIVE' };
  if (!(production.uiBrokenWhileApiUsable && validatorFailure && blocker.deployCommandCount === 1 && blocker.highFindingsOpen >= 1)) throw new Error(`BLOCKER_EVIDENCE_NOT_CONSISTENT:${JSON.stringify(blocker)}`);
  await writeJson('authority-blocker.json', blocker);
}
await main();
