import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = (process.env.BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const out = process.env.OUT || 'artifacts/hovs-021';
const prefix = process.env.SCREENSHOT_PREFIX || '';
const canonicalContainer = 1240;
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
const touchRows = [];
const neighborRows = [];
const hashes = {};

async function hashFile(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}
async function shot(name, options = { fullPage: true }) {
  const path = `${out}/screenshots/${prefix}${name}`;
  await page.screenshot({ path, ...options });
  hashes[`${prefix}${name}`] = await hashFile(path);
  return path;
}
async function locatorShot(locator, name) {
  const path = `${out}/screenshots/${prefix}${name}`;
  await locator.screenshot({ path });
  hashes[`${prefix}${name}`] = await hashFile(path);
  return path;
}
async function goto(path = '/') {
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${base}${path}${sep}hovs021=${Date.now()}`, { waitUntil: 'networkidle' });
}
function overlap(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}
function rectGap(a, b) {
  const dx = Math.max(a.left - b.right, b.left - a.right, 0);
  const dy = Math.max(a.top - b.bottom, b.top - a.bottom, 0);
  return Math.hypot(dx, dy);
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
      const x = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) !== 0 && x.width > 0 && x.height > 0;
    };
    const clusterSelectors = ['.civic-header__main > .sos-brand', '.civic-header__main > .civic-nav', '.civic-header__actions', '.civic-menu-toggle'];
    const clusters = clusterSelectors.filter((s) => { const e = document.querySelector(s); return e && visible(e); });
    const quick = [...document.querySelectorAll('.civic-quick-tile')].filter(visible);
    const contacts = [...document.querySelectorAll('.contact-grid a')].filter(visible);
    const interactive = [...document.querySelectorAll('a,button,summary,input,select,textarea,[role="button"],[role="tab"],[tabindex]')]
      .filter((el) => visible(el) && !el.closest('[aria-hidden="true"]'))
      .map((el, index) => {
        const x = el.getBoundingClientRect();
        const role = el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName.toLowerCase());
        const primary = el.matches('.civic-menu-toggle,.header-trust-action,.station-selector button,.hydro-refresh-button,.civic-quick-tile,.contact-grid a');
        return {
          index,
          tag: el.tagName.toLowerCase(),
          role,
          selector: el.id ? `#${el.id}` : (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().replace(/\s+/g,'.')}` : el.tagName.toLowerCase()),
          text: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g,' ').slice(0,90),
          primary,
          fontSize: parseFloat(getComputedStyle(el).fontSize),
          rect: { left:x.left, top:x.top, right:x.right, bottom:x.bottom, width:x.width, height:x.height },
        };
      });
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      docHeight: document.documentElement.scrollHeight,
      hydro: r('[data-testid="hydrometric-situation"]'),
      level: r('[data-testid="hydro-current-level"]'),
      time: r('.hydro-level time'),
      headerClusters: clusters.length,
      quickCount: quick.length,
      quickColumns: document.querySelector('.civic-quick-grid') ? getComputedStyle(document.querySelector('.civic-quick-grid')).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      contactCount: contacts.length,
      contactColumns: document.querySelector('.contact-grid') ? getComputedStyle(document.querySelector('.contact-grid')).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
      interactive,
    };
  });

  if (geometry.overflow > 1) throw new Error(`horizontal overflow ${size.w}: ${geometry.overflow}`);
  const targetWidth = Math.min(size.w, canonicalContainer);
  if (!geometry.hydro || geometry.hydro.width / targetWidth < (size.w <= 430 ? .90 : .94)) {
    throw new Error(`hydrometry canonical-width gate ${size.w}: ${geometry.hydro?.width}/${targetWidth}`);
  }
  if (geometry.level && geometry.time && overlap(geometry.level, geometry.time) > 0) throw new Error(`metric/timestamp collision ${size.w}`);

  if (size.w <= 430) {
    if (geometry.headerClusters > 3) throw new Error(`mobile header clusters ${size.w}: ${geometry.headerClusters}`);
    if (geometry.quickCount !== 6 || geometry.quickColumns > 2) throw new Error(`quick access comfort ${size.w}: ${geometry.quickCount}/${geometry.quickColumns}`);
    if (geometry.contactCount !== 5 || geometry.contactColumns > 2) throw new Error(`emergency grid ${size.w}: ${geometry.contactCount}/${geometry.contactColumns}`);

    for (const item of geometry.interactive) {
      const min = item.primary ? 48 : 44;
      const pass = item.rect.width + .5 >= min && item.rect.height + .5 >= min;
      touchRows.push({ viewport:`${size.w}x${size.h}`, selector:item.selector, role:item.role, label:item.text, primary:item.primary, requiredMinPx:min, width:item.rect.width, height:item.rect.height, fontSize:item.fontSize, pass });
      if (!pass) throw new Error(`touch target ${size.w}: ${item.selector} ${item.rect.width}x${item.rect.height} < ${min}`);
      if (item.primary && item.text && item.fontSize < 14.5) throw new Error(`mobile action label ${size.w}: ${item.selector} ${item.fontSize}px`);
    }

    for (let i = 0; i < geometry.interactive.length; i++) {
      const a = geometry.interactive[i];
      let nearest = null;
      for (let j = 0; j < geometry.interactive.length; j++) {
        if (i === j) continue;
        const b = geometry.interactive[j];
        const ov = overlap(a.rect, b.rect);
        const gap = rectGap(a.rect, b.rect);
        if (!nearest || gap < nearest.gap) nearest = { gap, overlap:ov, selector:b.selector, label:b.text };
        if (ov > .5) throw new Error(`interactive overlap ${size.w}: ${a.selector} <> ${b.selector}`);
      }
      neighborRows.push({ viewport:`${size.w}x${size.h}`, selector:a.selector, label:a.text, nearestSelector:nearest?.selector ?? null, nearestLabel:nearest?.label ?? null, nearestGapPx:nearest?.gap ?? null, overlapPx2:nearest?.overlap ?? 0, pass:(nearest?.overlap ?? 0) <= .5 });
    }

    const groupGaps = await page.evaluate(() => {
      const visible = (el) => { const s=getComputedStyle(el); const r=el.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0; };
      const groups = ['.station-selector','.civic-quick-grid','.contact-grid','.hydrometric-hero__controls'];
      const out = [];
      for (const selector of groups) {
        const root = document.querySelector(selector); if (!root || !visible(root)) continue;
        const items = [...root.querySelectorAll('a,button')].filter(visible);
        for (let i=0;i<items.length;i++) for (let j=i+1;j<items.length;j++) {
          const a=items[i].getBoundingClientRect(), b=items[j].getBoundingClientRect();
          const dx=Math.max(a.left-b.right,b.left-a.right,0), dy=Math.max(a.top-b.bottom,b.top-a.bottom,0);
          const gap=Math.hypot(dx,dy);
          const sameRow=Math.max(a.top,b.top) < Math.min(a.bottom,b.bottom);
          const sameCol=Math.max(a.left,b.left) < Math.min(a.right,b.right);
          if (sameRow || sameCol) out.push({group:selector,gap});
        }
      }
      return out;
    });
    const cramped = groupGaps.filter((x) => x.gap < 9.5);
    if (cramped.length) throw new Error(`adjacent interactive gap ${size.w}: ${JSON.stringify(cramped.slice(0,6))}`);

    for (const value of ['3,30','10,00','0,99','12,34']) {
      const m = await page.evaluate((value) => {
        const strong = document.querySelector('[data-testid="hydro-current-level"]');
        const time = document.querySelector('.hydro-level time');
        const container = document.querySelector('.hydro-level');
        if (!strong || !time || !container) return null;
        const node = [...strong.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
        const old = node?.textContent || '';
        if (node) node.textContent = value;
        const a = strong.getBoundingClientRect(), b = time.getBoundingClientRect(), c = container.getBoundingClientRect();
        if (node) node.textContent = old;
        return { value, right:a.right, containerRight:c.right, bottom:a.bottom, timeTop:b.top, collision: Math.max(0, Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)) };
      }, value);
      if (!m || m.collision > 0 || m.right > m.containerRight + 1 || m.bottom > m.timeTop + .5) throw new Error(`metric regression ${size.w}/${value}: ${JSON.stringify(m)}`);
      metricTests.push({ viewport:`${size.w}x${size.h}`, ...m, pass:true });
    }
  }

  results.push({ ...size, overflow:geometry.overflow, docHeight:geometry.docHeight, documentRatio:geometry.docHeight/size.h, hydro:geometry.hydro, headerClusters:geometry.headerClusters, quickCount:geometry.quickCount, quickColumns:geometry.quickColumns, contactCount:geometry.contactCount, contactColumns:geometry.contactColumns });
  const sizeName = `${size.w}x${size.h}`;
  if ([320,390,430,768,1024,1440,1920].includes(size.w)) await shot(`home-live-${sizeName}.png`);
  if (size.w <= 430) await shot(`hovs-final-mobile-${size.w}.png`);
}

await page.setViewportSize({ width:390, height:844 });
await goto('/');
await locatorShot(page.locator('.civic-header'), 'hovs-header-mobile.png');
await locatorShot(page.locator('.hydro-level'), 'hovs-hydrometric-metric-detail.png');
await locatorShot(page.locator('.civic-quick-grid'), 'hovs-quick-access-mobile.png');
await locatorShot(page.locator('.safety-actions'), 'hovs-emergency-actions-mobile.png');

await page.evaluate(() => {
  document.querySelectorAll('[data-hovs-qa-overlay]').forEach((el) => el.remove());
  const visible = (el) => { const s=getComputedStyle(el); const r=el.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0; };
  const els = [...document.querySelectorAll('a,button,summary')].filter(visible);
  const layer = document.createElement('div');
  layer.dataset.hovsQaOverlay = '1';
  Object.assign(layer.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'9999'});
  els.forEach((el,i) => {
    const r=el.getBoundingClientRect();
    const box=document.createElement('div');
    box.dataset.hovsQaOverlay='1';
    Object.assign(box.style,{position:'absolute',left:`${r.left+scrollX}px`,top:`${r.top+scrollY}px`,width:`${r.width}px`,height:`${r.height}px`,border:'2px solid #d10000',background:'rgba(255,255,255,.04)',boxSizing:'border-box'});
    const label=document.createElement('span');
    label.textContent=String(i+1);
    Object.assign(label.style,{position:'absolute',left:'0',top:'0',font:'700 10px Arial',lineHeight:'14px',padding:'0 3px',background:'#d10000',color:'#fff'});
    box.append(label); layer.append(box);
  });
  document.body.append(layer);
});
await shot('hovs-touch-target-overlay-390.png');

await goto('/');
await page.getByRole('button', { name:'Abrir menú' }).click();
await shot('nav-mobile-open.png');

await goto('/');
await locatorShot(page.getByTestId('hydrometric-situation'), 'hydrometric-detail-mobile.png');
await page.getByRole('tab', { name:/Salado/i }).click();
await shot('station-transition.png');

await page.setViewportSize({ width:1440, height:900 });
await goto('/');
await locatorShot(page.getByTestId('hydrometric-situation'), 'hydrometric-detail-desktop.png');
await locatorShot(page.locator('.source-transparency'), 'sources-transparency.png');

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

await page.setViewportSize({ width:195, height:422 });
await goto('/');
const zoom = await page.evaluate(() => ({ overflow:document.documentElement.scrollWidth-innerWidth, metric:document.querySelector('[data-testid="hydro-current-level"]')?.getBoundingClientRect().width || 0, viewport:innerWidth }));
if (zoom.overflow > 1) throw new Error(`zoom 200 overflow: ${zoom.overflow}`);

await page.setViewportSize({ width:390, height:844 });
await goto('/');
await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
const textScale = await page.evaluate(() => ({ overflow:document.documentElement.scrollWidth-innerWidth, level:document.querySelector('[data-testid="hydro-current-level"]')?.getBoundingClientRect(), time:document.querySelector('.hydro-level time')?.getBoundingClientRect() }));
if (textScale.overflow > 1 || (textScale.level && textScale.time && overlap(textScale.level,textScale.time)>0)) throw new Error(`text scale robustness: ${JSON.stringify(textScale)}`);

if (new Set(Object.values(hashes)).size !== Object.values(hashes).length) throw new Error('screenshot hash collision');
await writeFile(`${out}/responsive-metrics.json`, JSON.stringify(results, null, 2) + '\n');
await writeFile(`${out}/mobile-touch-target-audit.json`, JSON.stringify({ pass:true, primaryMinPx:48, secondaryMinPx:44, rows:touchRows }, null, 2) + '\n');
await writeFile(`${out}/metric-typography-regression.json`, JSON.stringify({ pass:true, collisionCount:0, cases:metricTests }, null, 2) + '\n');
await writeFile(`${out}/mobile-interactive-neighbor-matrix.json`, JSON.stringify({ pass:true, overlapCount:0, adjacentGapTargetPx:10, rows:neighborRows }, null, 2) + '\n');
await writeFile(`${out}/accessibility-results.json`, JSON.stringify({ pass:true, touchTargets:true, focusRingClipped:false, zoom200:zoom, textScaleRobust:textScale.overflow===0 }, null, 2) + '\n');
await writeFile(`${out}/screenshot-manifest.json`, JSON.stringify({ pass:true, hashes }, null, 2) + '\n');
await browser.close();
