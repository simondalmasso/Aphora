import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = 'https://sos-sf.simondalmasso44.workers.dev';
const EVIDENCE = 'artifacts/order-020b-ui-diagnostic';
await mkdir(EVIDENCE, { recursive: true });

async function api(path) {
  const response = await fetch(`${URL}${path}?diag=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store', Accept: 'application/json' }, signal: AbortSignal.timeout(40000) });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}

const initialSnapshot = await api('/api/snapshot');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const consoleMessages = [];
const pageErrors = [];
const snapshotResponses = [];
page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
page.on('response', async (response) => {
  if (!response.url().includes('/api/snapshot')) return;
  let body = null;
  try { body = await response.json(); } catch {}
  snapshotResponses.push({ url: response.url(), status: response.status(), headers: await response.allHeaders(), body });
});
await page.goto(`${URL}/?ui-diag=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const samples = [];
for (const delayMs of [1000, 4000, 10000, 20000]) {
  await page.waitForTimeout(delayMs - (samples.at(-1)?.elapsedMs || 0));
  const state = await page.evaluate(() => ({
    elapsedMs: 0,
    readyState: document.readyState,
    mainSnapshotId: document.querySelector('main')?.getAttribute('data-snapshot-id') ?? null,
    level: document.querySelector('[data-testid="hydro-current-level"]')?.textContent?.trim() ?? null,
    source: document.querySelector('[data-testid="hydro-source-strip"]')?.textContent?.trim() ?? null,
    chart: Boolean(document.querySelector('[data-testid="main-hydro-chart"]')),
    bodyText: document.body.innerText.slice(0, 5000),
    localStorage: Object.fromEntries(Object.entries(localStorage)),
  }));
  state.elapsedMs = delayMs;
  samples.push(state);
}
await page.screenshot({ path: join(EVIDENCE, 'production-after-20s.png'), fullPage: true });
const finalSnapshot = await api('/api/snapshot');
await browser.close();
await writeFile(join(EVIDENCE, 'ui-diagnostic.json'), JSON.stringify({ checkedAt: new Date().toISOString(), initialSnapshot, finalSnapshot, samples, snapshotResponses, consoleMessages, pageErrors }, null, 2) + '\n');
