import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/owner-left-inset-002';
const production = 'https://sos-sf.simondalmasso44.workers.dev';

const selectors = [
  ['section-kicker', '.hydrometric-hero__header .section-kicker'],
  ['hero-title', '#hydrometric-title'],
  ['station-label', '.station-identification > div > span'],
  ['river-name', '.station-identification > div > strong'],
  ['signature-axis', '.hydro-signature-axis'],
  ['level-label', '.hydro-level > span'],
  ['level-value', '[data-testid="hydro-current-level"]'],
  ['observation-time', '.hydro-level time'],
  ['source-line', '[data-testid="hydro-source-strip"] > span:first-child'],
  ['chart', '[data-testid="main-hydro-chart"]'],
] as const;

test.beforeAll(async () => {
  await mkdir(`${evidenceDir}/screenshots`, { recursive: true });
});

test('OWNER left inset, decorative gap and edge collision gates', async ({ page, request }) => {
  const snapshotResponse = await request.get(`${production}/api/snapshot?owner-inset=${Date.now()}`);
  const sourcesResponse = await request.get(`${production}/api/sources?owner-inset=${Date.now()}`);
  expect(snapshotResponse.ok()).toBeTruthy();
  expect(sourcesResponse.ok()).toBeTruthy();
  const snapshotEnvelope = await snapshotResponse.json();
  const sourcesEnvelope = await sourcesResponse.json();

  await page.route('**/api/snapshot*', (route) => route.fulfill({ json: snapshotEnvelope }));
  await page.route('**/api/sources*', (route) => route.fulfill({ json: sourcesEnvelope }));
  await page.route('**/api/messages*', (route) => route.fulfill({ json: { ok: true, data: { snapshotId: snapshotEnvelope.data?.id, messages: [], deliveryClaims: 'NONE' } } }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: false, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));

  const cases = [
    { viewport: '320x568', width: 320, height: 568, zoom: 100 },
    { viewport: '360x800', width: 360, height: 800, zoom: 100 },
    { viewport: '390x844', width: 390, height: 844, zoom: 100 },
    { viewport: '430x932', width: 430, height: 932, zoom: 100 },
    { viewport: '390x844@200%', width: 195, height: 422, zoom: 200 },
  ];

  const rows: unknown[] = [];
  let edgeCollisionCount = 0;
  let textBorderTouchCount = 0;
  let minContentInset = Number.POSITIVE_INFINITY;
  let minRuleGap = Number.POSITIVE_INFINITY;
  let minBorderGap = Number.POSITIVE_INFINITY;

  for (const item of cases) {
    await page.setViewportSize({ width: item.width, height: item.height });
    await page.goto('/');
    await expect(page.getByTestId('hydrometric-situation')).toBeVisible();
    await expect(page.getByTestId('main-hydro-chart')).toBeVisible();

    const measurement = await page.evaluate(({ selectors: inputSelectors, viewport, zoom }) => {
      const card = document.querySelector('.hydrometric-section') as HTMLElement | null;
      const hero = document.querySelector('.muni-hydrometric-hero') as HTMLElement | null;
      if (!card || !hero) throw new Error('hydrometric geometry missing');
      const cardRect = card.getBoundingClientRect();
      const heroRect = hero.getBoundingClientRect();
      const pseudo = getComputedStyle(hero, '::after');
      const ruleLeft = heroRect.left + (Number.parseFloat(pseudo.left) || 0);
      const ruleWidth = Number.parseFloat(pseudo.width) || 0;
      const ruleRight = ruleLeft + ruleWidth;
      const pageGutter = cardRect.left;
      const overflow = document.documentElement.scrollWidth - innerWidth;
      const elements = inputSelectors.map(([element, selector]) => {
        const node = document.querySelector(selector) as HTMLElement | null;
        if (!node) throw new Error(`missing ${selector}`);
        const rect = node.getBoundingClientRect();
        const contentInset = rect.left - cardRect.left;
        const ruleToContentGap = rect.left - ruleRight;
        const rightBorderGap = cardRect.right - rect.right;
        const pass = pageGutter >= 15.5 && contentInset >= 19.5 && ruleToContentGap >= 15.5 && rightBorderGap >= 15.5 && overflow <= 1;
        return {
          element,
          selector,
          leftEdge: rect.left,
          rightEdge: rect.right,
          containerLeftEdge: cardRect.left,
          containerRightEdge: cardRect.right,
          decorativeRuleRightEdge: ruleRight,
          contentInset,
          ruleToContentGap,
          rightBorderGap,
          passFail: pass ? 'PASS' : 'FAIL',
        };
      });
      return { viewport, zoom, pageGutter, ruleLeft, ruleWidth, ruleRight, overflow, elements };
    }, { selectors, viewport: item.viewport, zoom: item.zoom });

    expect(measurement.pageGutter).toBeGreaterThanOrEqual(15.5);
    expect(measurement.ruleWidth).toBeGreaterThanOrEqual(3.5);
    expect(measurement.overflow).toBeLessThanOrEqual(1);

    for (const row of measurement.elements) {
      minContentInset = Math.min(minContentInset, row.contentInset);
      minRuleGap = Math.min(minRuleGap, row.ruleToContentGap);
      minBorderGap = Math.min(minBorderGap, row.rightBorderGap);
      if (row.ruleToContentGap < 15.5 || row.contentInset < 19.5) edgeCollisionCount += 1;
      if (row.contentInset < 15.5 || row.rightBorderGap < 15.5) textBorderTouchCount += 1;
      expect(row.passFail, `${item.viewport} ${row.element}`).toBe('PASS');
      rows.push({ viewport: item.viewport, zoom: item.zoom, ...row });
    }

    if (item.viewport === '390x844') {
      await page.locator('.hydrometric-section').screenshot({ path: `${evidenceDir}/screenshots/hovs-left-inset-detail-390.png` });
    }
  }

  expect(minContentInset).toBeGreaterThanOrEqual(19.5);
  expect(minRuleGap).toBeGreaterThanOrEqual(15.5);
  expect(minBorderGap).toBeGreaterThanOrEqual(15.5);
  expect(edgeCollisionCount).toBe(0);
  expect(textBorderTouchCount).toBe(0);

  await writeFile(`${evidenceDir}/mobile-left-inset-audit.json`, `${JSON.stringify({
    amendment: '021-HOVS-OWNER-LEFT-INSET-EDGE-COLLISION-002',
    ownerCommentId: 5219229883,
    heroInnerContentInsetMinimumPx: minContentInset,
    decorativeRuleToTextGapMinimumPx: minRuleGap,
    textToVisibleBorderGapMinimumPx: minBorderGap,
    edgeCollisionCount,
    textBorderTouchCount,
    leftInsetGate: 'PASS',
    decorativeRuleGapGate: 'PASS',
    zoom200LeftInset: 'PASS',
    rows,
  }, null, 2)}\n`);
});
