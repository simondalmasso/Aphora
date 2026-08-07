import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = (process.env.PRODUCTION_URL || 'https://sos-sf.simondalmasso44.workers.dev').replace(/\/$/, '');
const out = process.env.OUT || 'artifacts/owner-final-corrective-003';
const versionId = process.env.VERSION_ID || null;
const productCommit = process.env.PRODUCT_COMMIT || null;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unwrap = (entry) => entry?.json && typeof entry.json === 'object' && 'data' in entry.json ? entry.json.data : entry?.json;

await mkdir(path.join(out, 'screenshots'), { recursive: true });

async function fetchJson(route) {
  const separator = route.includes('?') ? '&' : '?';
  const response = await fetch(`${base}${route}${separator}t=${Date.now()}`, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* evidence keeps null */ }
  return { route, status: response.status, json };
}

const assets = await readdir('dist/assets');
const localJs = assets.find((name) => name.endsWith('.js') && !name.endsWith('.js.map'));
const localCss = assets.find((name) => name.endsWith('.css'));
if (!localJs || !localCss) throw new Error('Local build assets missing.');

let remotePaths = [];
let converged = false;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  const html = await (await fetch(`${base}/?owner003=${Date.now()}`, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } })).text();
  remotePaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1]);
  if (remotePaths.some((item) => item.endsWith(localJs)) && remotePaths.some((item) => item.endsWith(localCss))) {
    converged = true;
    break;
  }
  await sleep(5000);
}
if (!converged) throw new Error('Production assets did not converge to deployed candidate.');

const assetIdentity = [];
for (const localName of [localJs, localCss]) {
  const remotePath = remotePaths.find((item) => item.endsWith(localName));
  if (!remotePath) throw new Error(`Remote asset missing: ${localName}`);
  const localBytes = await readFile(path.join('dist/assets', localName));
  const remoteBytes = Buffer.from(await (await fetch(`${base}${remotePath}?b=${Date.now()}`, { cache: 'no-store' })).arrayBuffer());
  const row = { path: remotePath, localSha256: sha256(localBytes), remoteSha256: sha256(remoteBytes) };
  row.pass = row.localSha256 === row.remoteSha256;
  assetIdentity.push(row);
  if (!row.pass) throw new Error(`Asset byte identity failed: ${localName}`);
}

const api = [];
for (const route of ['/api/health', '/api/snapshot', '/api/sources', '/api/auth/config', '/source-provenance.json']) api.push(await fetchJson(route));
if (api.some((entry) => entry.status !== 200)) throw new Error(`API status failure: ${JSON.stringify(api.map((entry) => [entry.route, entry.status]))}`);

const snapshot = unwrap(api.find((entry) => entry.route === '/api/snapshot'));
const authConfig = unwrap(api.find((entry) => entry.route === '/api/auth/config'));
const systems = snapshot?.systems || [];
const sources = snapshot?.sources || [];
const inaTruth = systems.some((system) => (system.sourceName || '').toLowerCase().includes('instituto nacional del agua')) ||
  sources.some((source) => (source.organizationName || source.name || '').toLowerCase().includes('instituto nacional del agua'));
if (!inaTruth) throw new Error('INA source truth is not represented in production snapshot.');
if (!authConfig || typeof authConfig.enabled !== 'boolean') throw new Error('Private messaging feature-flag contract unavailable.');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();

let maxOverflow = 0;
let edgeCollisionCount = 0;
let textBorderTouchCount = 0;
let minInset = Infinity;
let minRuleGap = Infinity;
const messaging = [];

async function waitHome() {
  await page.getByTestId('hydrometric-situation').waitFor({ state: 'visible' });
  await page.getByRole('heading', { level: 1, name: 'Pulso hídrico de Santa Fe' }).waitFor({ state: 'visible' });
}

async function verifyApiUi(label) {
  const tracked = systems.filter((system) => ['parana-santa-fe', 'salado-santo-tome'].includes(system.id));
  for (const system of tracked) {
    const tabName = system.watercourse?.includes('Salado') ? /Salado/i : /Paraná/i;
    const tab = page.getByRole('tab', { name: tabName });
    if (await tab.count()) await tab.click();
    const text = (await page.getByTestId('hydro-current-level').innerText()).trim();
    if (system.available && system.currentMetres !== null) {
      const ui = Number.parseFloat(text.replace(',', '.'));
      if (!Number.isFinite(ui) || Math.abs(ui - system.currentMetres) > .005) throw new Error(`${label}: API/UI mismatch for ${system.id}`);
    } else if (text !== '—') {
      throw new Error(`${label}: unavailable API/UI mismatch for ${system.id}: ${text}`);
    }
  }
}

for (const [width, height, label] of [[320, 568, '320'], [390, 844, '390'], [430, 932, '430']]) {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}/?owner003mobile=${label}-${Date.now()}`, { waitUntil: 'networkidle' });
  await waitHome();
  if (await page.getByRole('heading', { level: 1, name: 'Ríos de Santa Fe' }).count()) throw new Error(`Old H1 remains at ${label}.`);

  const geometry = await page.evaluate(() => {
    const title = document.querySelector('#hydrometric-title');
    const card = document.querySelector('.hydrometric-section');
    const hero = document.querySelector('.muni-hydrometric-hero');
    if (!title || !card || !hero) throw new Error('Hydrometric geometry nodes missing.');
    const tr = title.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    const pseudo = getComputedStyle(hero, '::after');
    const ruleRight = hr.left + (Number.parseFloat(pseudo.left) || 0) + (Number.parseFloat(pseudo.width) || 0);
    return {
      titleContained: tr.left >= cr.left - .5 && tr.right <= cr.right + .5,
      contentInset: tr.left - cr.left,
      ruleGap: tr.left - ruleRight,
      rightGap: cr.right - tr.right,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  maxOverflow = Math.max(maxOverflow, geometry.overflow);
  minInset = Math.min(minInset, geometry.contentInset);
  minRuleGap = Math.min(minRuleGap, geometry.ruleGap);
  if (!geometry.titleContained || geometry.overflow > 1 || geometry.contentInset < 19.5 || geometry.ruleGap < 15.5) edgeCollisionCount += 1;
  if (geometry.contentInset < 15.5 || geometry.rightGap < 15.5) textBorderTouchCount += 1;
  if (edgeCollisionCount || textBorderTouchCount) throw new Error(`OWNER geometry failed at ${label}: ${JSON.stringify(geometry)}`);

  await page.screenshot({ path: `${out}/screenshots/owner-final-home-${label}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  const communications = page.getByRole('button', { name: /Comunicaciones/ });
  if (!await communications.isVisible()) throw new Error(`Communications not reachable at ${label}.`);
  const box = await communications.boundingBox();
  if (!box || box.height < 48) throw new Error(`Communications touch target below 48px at ${label}.`);
  await communications.click();
  const dialog = page.locator('dialog.messages-panel');
  if (!await dialog.isVisible()) throw new Error(`Communications dialog did not open at ${label}.`);
  if (!await dialog.getByRole('heading', { name: 'Comunicaciones públicas' }).isVisible()) throw new Error(`Public communications absent at ${label}.`);
  if (label === '390') await page.screenshot({ path: `${out}/screenshots/owner-final-communications-open-mobile.png`, fullPage: true });
  await page.keyboard.press('Escape');
  if (await dialog.isVisible()) throw new Error(`Escape did not close communications at ${label}.`);
  if (!await communications.evaluate((element) => document.activeElement === element)) throw new Error(`Focus did not return to communications opener at ${label}.`);
  await verifyApiUi(label);
  messaging.push({ viewport: label, reachable: true, touchTargetHeight: box.height, escapeClose: true, focusReturn: true });
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/?owner003menu=${Date.now()}`, { waitUntil: 'networkidle' });
await waitHome();
await page.getByRole('button', { name: 'Abrir menú' }).click();
await page.getByRole('button', { name: /Comunicaciones/ }).waitFor({ state: 'visible' });
await page.screenshot({ path: `${out}/screenshots/owner-final-mobile-menu-communications.png`, fullPage: true });

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}/?owner003desktop=${Date.now()}`, { waitUntil: 'networkidle' });
await waitHome();
const desktopButton = page.getByRole('button', { name: 'Abrir comunicaciones' });
if (!await desktopButton.isVisible()) throw new Error('Desktop communications control is not visible.');
await page.screenshot({ path: `${out}/screenshots/owner-final-home-1440.png`, fullPage: true });
await desktopButton.click();
const desktopDialog = page.locator('dialog.messages-panel');
if (!await desktopDialog.isVisible()) throw new Error('Desktop communications dialog did not open.');
if (!await desktopDialog.getByRole('heading', { name: 'Comunicaciones públicas' }).isVisible()) throw new Error('Desktop public communications surface absent.');
await page.screenshot({ path: `${out}/screenshots/owner-final-communications-open-desktop.png`, fullPage: true });
await page.keyboard.press('Escape');
if (!await desktopButton.evaluate((element) => document.activeElement === element)) throw new Error('Desktop focus return failed.');
await verifyApiUi('desktop');

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/?owner003title=${Date.now()}`, { waitUntil: 'networkidle' });
await waitHome();
await page.locator('.hydrometric-hero__header').screenshot({ path: `${out}/screenshots/owner-final-hydrometric-title.png` });

await page.setViewportSize({ width: 195, height: 422 });
await page.goto(`${base}/?owner003zoom200=${Date.now()}`, { waitUntil: 'networkidle' });
await waitHome();
const zoomGeometry = await page.evaluate(() => {
  const title = document.querySelector('#hydrometric-title')?.getBoundingClientRect();
  const card = document.querySelector('.hydrometric-section')?.getBoundingClientRect();
  return {
    contained: Boolean(title && card && title.left >= card.left - .5 && title.right <= card.right + .5),
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
});
maxOverflow = Math.max(maxOverflow, zoomGeometry.overflow);
if (!zoomGeometry.contained || zoomGeometry.overflow > 1) throw new Error(`H1 200% layout-equivalent failed: ${JSON.stringify(zoomGeometry)}`);

await page.goto(`${base}/gestion-de-riesgo/fenomeno-el-nino?owner003=${Date.now()}`, { waitUntil: 'networkidle' });
const elNinoText = await page.getByTestId('el-nino-landing').innerText();
for (const required of ['Fenómeno El Niño', '5,30 m', 'no es un umbral general de evacuación de SOS-SF']) {
  if (!elNinoText.includes(required)) throw new Error(`El Niño preservation failed: ${required}`);
}

await browser.close();

const result = {
  suborder: '021-HOVS-OWNER-FINAL-CORRECTIVE-003',
  status: 'POSTDEPLOY_TERMINAL_VERIFIED',
  productCommit,
  deploymentVersionId: versionId,
  deployCommandCount: 1,
  postdeployRedeployCount: 0,
  assetIdentity,
  apiStatus: api.map((entry) => ({ route: entry.route, status: entry.status })),
  messagingSurfaceRestored: true,
  publicCommunicationsMobile: true,
  publicCommunicationsDesktop: true,
  privateMessagingContractPreserved: true,
  privateMessagingEnabled: authConfig.enabled,
  h1: 'Pulso hídrico de Santa Fe',
  oldH1Absent: true,
  leftInsetPass: minInset >= 19.5,
  ruleGapPass: minRuleGap >= 15.5,
  edgeCollisionCount,
  textBorderTouchCount,
  zoom200H1: true,
  apiUiConsistency: true,
  inaTruth: true,
  elNinoPreserved: true,
  horizontalOverflow: maxOverflow,
  messaging,
};
await writeFile(`${out}/terminal-summary.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
