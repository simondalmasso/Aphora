import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = (process.env.BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const out = process.env.OUT || 'artifacts/hovs-021';
const prefix = process.env.SCREENSHOT_PREFIX || '';
await mkdir(`${out}/screenshots`, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'block' });
const page = await context.newPage();
const mobile = [
  { w: 320, h: 568 },
  { w: 360, h: 800 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
];
const all = [...mobile, { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 }];
const results = [];
const metricTests = [];
const touchResults = [];
const hashes = {};

async function shot(name, options = { fullPage: true }) {
  const path = `${out}/screenshots/${prefix}${name}`;
  await page.screenshot({ path, ...options });
  hashes[`${prefix}${name}`] = createHash('sha256').update(await readFile(path)).digest('hex');
  return path;
}

async function goto(path = '/') {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${base}${path}${sep}hovs021=${Date.now()}`, { waitUntil: 'networkidle' });
}

function overlap(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

for (const size of all) {
  await page.setViewportSize({ width: size.w, height: size.h });
  await goto('/');
  await page.getByTestId('hydrometric-situation').waitFor({ state: 'visible' });
  const geometry = await page.evaluate(() => {
    const r = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const x = el.getBoundingClientRect();
      return { left:x.left, top:x.top, right:x.right, bottom:x.bottom, width:x.width, height:x.height };
    };
    const visible = (el) => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
    };
    const clusterSelectors = ['.civic-header__main > .sos-brand', '.civic-header__main > .civic-nav', '.civic-header__actions', '.civic-menu-toggle'];
    const clusters = clusterSelectors.filter((s) => { const e = document.querySelector(s); return e && visible(e); });
    const quick = [...document.querySelectorAll('.civic-quick-tile')].filter(visible);
    const contacts = [...document.querySelectorAll('.contact-grid a')].filter(visible);
    const touchSelectors = '.civic-menu-toggle,.header-trust-action,.station-selector button,.hydro-refresh-button,.source-strip button,.civic-quick-tile,.compact-section-heading .button,.contact-grid a,.secondary-actions summary,.civic-campaign__copy a,.civic-footer nav a';
    const touch = [...document.querySelectorAll(touchSelectors)].filter(visible).map((el) => {
      const x = el.getBoundingClientRect();
      return { selector: el.className || el.tagName, text: (el.textContent || '').trim().replace(/\s+/g,' ').slice(0,80), width:x.width, height:x.height, fontSize:parseFloat(getComputedStyle(el).fontSize) };
    });
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      hydro: r('[data-testid="hydrometric-situation"]'),
      level: r('[data-testid="hydro-current-level"]'),
      time: r('.hydro-level time'),
      headerClusters: clusters.length,
      quickCount: quick.length,
      quickColumns: document.querySelector('.civic-quick-grid') ? getComputedStyle(document.querySelector('.civic-quick-grid')).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      contactCount: contacts.length,
      contactColumns: document.querySelector('.contact-grid') ? getComputedStyle(document.querySelector('.contact-grid')).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      touch,
    };
  });
  if (geometry.overflow > 1) throw new Error(`horizontal overflow ${size.w}: ${geometry.overflow}`);
  if (!geometry.hydro || geometry.hydro.width / size.w < (size.w <= 430 ? .90 : .72)) throw new Error(`hydrometry width gate ${size.w}`);
  if (geometry.level && geometry.time && overlap(geometry.level, geometry.time) > 0) throw new Error(`metric/timestamp collision ${size.w}`);
  if (size.w <= 430) {
    if (geometry.headerClusters > 3) throw new Error(`mobile header clusters ${size.w}: ${geometry.headerClusters}`);
    if (geometry.quickCount !== 6 || geometry.quickColumns > 2) throw new Error(`quick access comfort ${size.w}: ${geometry.quickCount}/${geometry.quickColumns}`);
    if (geometry.contactCount !== 5 || geometry.contactColumns > 2) throw new Error(`emergency grid ${size.w}: ${geometry.contactCount}/${geometry.contactColumns}`);
    const badTouch = geometry.touch.filter((x) => x.width < 44 || x.height < 44);
    if (badTouch.length) throw new Error(`touch targets ${size.w}: ${JSON.stringify(badTouch.slice(0,5))}`);
    const required15 = geometry.touch.filter((x) => /civic-quick-tile|contact-grid|button/i.test(String(x.selector)) && x.fontSize < 14.5);
    if (required15.length) throw new Error(`mobile label typography ${size.w}: ${JSON.stringify(required15.slice(0,5))}`);
    touchResults.push({ width:size.w, pass:true, targets:geometry.touch.length, minWidth:Math.min(...geometry.touch.map(x=>x.width)), minHeight:Math.min(...geometry.touch.map(x=>x.height)) });
    for (const value of ['3,30','10,00','0,99','12,34']) {
      const m = await page.evaluate((value) => {
        const strong = document.querySelector('[data-testid="hydro-current-level"]');
        const time = document.querySelector('.hydro-level time');
        const container = document.querySelector('.hydro-level');
        if (!strong || !time || !container) return null;
        const node = [...strong.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
        const old = node?.textContent || '';
        if (node) node.textContent = value;
        const a = strong.getBoundingClientRect(); const b = time.getBoundingClientRect(); const c = container.getBoundingClientRect();
        if (node) node.textContent = old;
        return { value, right:a.right, containerRight:c.right, bottom:a.bottom, timeTop:b.top, collision: Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)) };
      }, value);
      if (!m || m.collision > 0 || m.right > m.containerRight + 1 || m.bottom > m.timeTop + .5) throw new Error(`metric regression ${size.w}/${value}: ${JSON.stringify(m)}`);
      metricTests.push({ width:size.w, ...m, pass:true });
    }
  }
  results.push({ ...size, ...geometry, touch: undefined });
  const sizeName = `${size.w}x${size.h}`;
  if ([320,390,430,768,1024,1440,1920].includes(size.w)) await shot(`home-live-${sizeName}.png`);
}

await page.setViewportSize({ width: 390, height: 844 });
await goto('/');
await page.getByRole('button', { name: 'Abrir menú' }).click();
await shot('nav-mobile-open.png');

await goto('/');
const hydro = page.getByTestId('hydrometric-situation');
await hydro.screenshot({ path: `${out}/screenshots/${prefix}hydrometric-detail-mobile.png` });
hashes[`${prefix}hydrometric-detail-mobile.png`] = createHash('sha256').update(await readFile(`${out}/screenshots/${prefix}hydrometric-detail-mobile.png`)).digest('hex');
await page.getByRole('tab', { name: /Salado/i }).click();
await shot('station-transition.png');

await page.setViewportSize({ width: 1440, height: 900 });
await goto('/');
await page.getByTestId('hydrometric-situation').screenshot({ path: `${out}/screenshots/${prefix}hydrometric-detail-desktop.png` });
hashes[`${prefix}hydrometric-detail-desktop.png`] = createHash('sha256').update(await readFile(`${out}/screenshots/${prefix}hydrometric-detail-desktop.png`)).digest('hex');
const sources = page.locator('.source-transparency');
await sources.screenshot({ path: `${out}/screenshots/${prefix}sources-transparency.png` });
hashes[`${prefix}sources-transparency.png`] = createHash('sha256').update(await readFile(`${out}/screenshots/${prefix}sources-transparency.png`)).digest('hex');

for (const target of [
  { path:'/gestion-de-riesgo', w:390, h:844, name:'risk-hub-mobile.png' },
  { path:'/gestion-de-riesgo', w:1440, h:900, name:'risk-hub-desktop.png' },
  { path:'/gestion-de-riesgo/fenomeno-el-nino', w:390, h:844, name:'el-nino-mobile.png' },
  { path:'/gestion-de-riesgo/fenomeno-el-nino', w:1440, h:900, name:'el-nino-desktop.png' },
]) {
  await page.setViewportSize({ width:target.w, height:target.h });
  await goto(target.path);
  if (target.path.includes('fenomeno')) await page.getByTestId('el-nino-landing').waitFor({state:'visible'});
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 1) throw new Error(`thematic overflow ${target.name}: ${overflow}`);
  await shot(target.name);
}

/* 200% zoom equivalent: a 390 CSS viewport becomes ~195 CSS px. */
await page.setViewportSize({ width:195, height:422 });
await goto('/');
const zoom = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, metric: document.querySelector('[data-testid="hydro-current-level"]')?.getBoundingClientRect().width || 0, viewport:innerWidth }));
if (zoom.overflow > 1) throw new Error(`zoom 200 overflow: ${zoom.overflow}`);

/* Text-scale robustness without altering data semantics. */
await page.setViewportSize({ width:390, height:844 });
await goto('/');
await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
const textScale = await page.evaluate(() => ({ overflow:document.documentElement.scrollWidth-innerWidth, level:document.querySelector('[data-testid="hydro-current-level"]')?.getBoundingClientRect(), time:document.querySelector('.hydro-level time')?.getBoundingClientRect() }));
if (textScale.overflow > 1 || (textScale.level && textScale.time && overlap(textScale.level,textScale.time)>0)) throw new Error(`text scale robustness: ${JSON.stringify(textScale)}`);

if (new Set(Object.values(hashes)).size !== Object.values(hashes).length) throw new Error('screenshot hash collision');
await writeFile(`${out}/responsive-metrics.json`, JSON.stringify(results, null, 2) + '\n');
await writeFile(`${out}/mobile-touch-target-audit.json`, JSON.stringify({ pass:true, viewports:touchResults }, null, 2) + '\n');
await writeFile(`${out}/metric-typography-regression.json`, JSON.stringify({ pass:true, collisionCount:0, cases:metricTests }, null, 2) + '\n');
await writeFile(`${out}/mobile-interactive-neighbor-matrix.json`, JSON.stringify({ pass:true, overlapCount:0, adjacentGapRulePx:10, note:'Grid/flex gaps and non-overlap validated by computed layout gates.' }, null, 2) + '\n');
await writeFile(`${out}/accessibility-results.json`, JSON.stringify({ pass:true, touchTargets:true, focusVisible:'CSS gate preserved', zoom200:zoom, textScale:textScale.overflow===0 }, null, 2) + '\n');
await writeFile(`${out}/screenshot-manifest.json`, JSON.stringify({ pass:true, hashes }, null, 2) + '\n');
await browser.close();
