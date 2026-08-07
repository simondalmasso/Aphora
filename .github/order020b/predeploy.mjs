import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = 'https://sos-sf.simondalmasso44.workers.dev';
const EVIDENCE = process.env.EVIDENCE_DIR || 'artifacts/order-020b-predeploy-truth';

async function api(path) {
  const response = await fetch(`${URL}${path}?truth=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store', Accept: 'application/json' }, signal: AbortSignal.timeout(40_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}:${response.status}`);
  return body.data ?? body;
}

const [snapshot, sources] = await Promise.all([api('/api/snapshot'), api('/api/sources')]);
const systems = Array.isArray(snapshot.systems) ? snapshot.systems : [];
const primary = systems.find((system) => system.id === snapshot?.river?.systemId) ?? systems.find((system) => system.available && typeof system.currentMetres === 'number') ?? null;
const apiHasUsable = Boolean(primary && primary.available === true && typeof primary.currentMetres === 'number');
const expected = apiHasUsable ? primary.currentMetres.toFixed(2).replace('.', ',') : null;
let uiMatched = false;
let terminalText = null;
let elapsedMs = null;
await mkdir(join(EVIDENCE, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const started = Date.now();
  await page.goto(`${URL}/?truth=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('main', { timeout: 20_000 });
  if (apiHasUsable) {
    try {
      await page.waitForFunction(({ snapshotId, level }) => {
        const main = document.querySelector('main');
        const current = document.querySelector('[data-testid="hydro-current-level"]')?.textContent || '';
        const strip = document.querySelector('[data-testid="hydro-source-strip"]')?.textContent || '';
        const chart = document.querySelector('[data-testid="main-hydro-chart"]');
        return main?.getAttribute('data-snapshot-id') === snapshotId && current.includes(level) && strip.trim().length > 0 && Boolean(chart);
      }, { snapshotId: snapshot.id, level: expected }, { timeout: 20_000 });
      uiMatched = true;
    } catch {
      uiMatched = false;
    }
  } else {
    try {
      await page.waitForFunction(() => {
        const level = document.querySelector('[data-testid="hydro-current-level"]')?.textContent?.trim();
        return level === '—' || document.body.innerText.includes('Medición no disponible');
      }, null, { timeout: 20_000 });
      uiMatched = true;
    } catch {
      uiMatched = false;
    }
  }
  elapsedMs = Date.now() - started;
  terminalText = await page.locator('main').innerText();
  await page.screenshot({ path: join(EVIDENCE, 'screenshots', 'predeploy-production-390x844.png'), fullPage: true });
} finally { await browser.close(); }

const productBug = apiHasUsable && !uiMatched;
const payload = { checkedAt: new Date().toISOString(), snapshotId: snapshot.id, apiHasUsable, primary, expected, uiMatched, productBug, elapsedMs, terminalText, sources };
await writeFile(join(EVIDENCE, 'production-predeploy-truth.json'), `${JSON.stringify(payload, null, 2)}\n`);
if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, `product_bug=${productBug}\napi_has_usable=${apiHasUsable}\nui_matched=${uiMatched}\n`, { flag: 'a' });
}
