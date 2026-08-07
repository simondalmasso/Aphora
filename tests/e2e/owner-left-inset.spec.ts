import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Snapshot } from '../../src/domain/snapshot.ts';

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/owner-left-inset-002';
const generatedAt = '2026-08-07T15:56:46.000Z';

const points = Array.from({ length: 12 }, (_, index) => ({
  at: new Date(Date.parse(generatedAt) - (11 - index) * 60 * 60_000).toISOString(),
  metres: 3.08 + index * .02,
  measured: true,
  quality: 'PUBLISHED_OPERATIONAL' as const,
}));

const systems = [
  {
    id: 'parana-santa-fe', label: 'Río Paraná — Santa Fe', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30',
    available: true, dataStatus: 'LIVE', freshness: 'ACTUALIZADO', currentMetres: 3.30, observedAt: generatedAt, fetchedAt: generatedAt,
    validUntil: '2026-08-07T18:56:46.000Z', sourceId: 'ina-rest-30', sourceName: 'Instituto Nacional del Agua · INA REST',
    points, thresholds: [], trend: 'RISING_SLOWLY', delta1h: .01, delta6h: .04, delta24h: .12,
  },
  {
    id: 'salado-santo-tome', label: 'Río Salado — Santo Tomé', watercourse: 'Río Salado', stationName: 'Santo Tomé', stationCode: '1679',
    available: true, dataStatus: 'LIVE', freshness: 'ACTUALIZADO', currentMetres: 3.58, observedAt: generatedAt, fetchedAt: generatedAt,
    validUntil: '2026-08-07T18:56:46.000Z', sourceId: 'ina-rest-3044', sourceName: 'Instituto Nacional del Agua · INA REST',
    points: points.map((point) => ({ ...point, metres: point.metres + .28 })), thresholds: [], trend: 'STABLE', delta1h: 0, delta6h: .01, delta24h: .03,
  },
] as const;

const sources = [
  {
    id: 'ina-rest-30', name: 'INA REST · Paraná Santa Fe', kind: 'OFFICIAL_OBSERVATION', status: 'FRESH', observedAt: generatedAt,
    fetchedAt: generatedAt, lastCheckedAt: generatedAt, validUntil: '2026-08-07T18:56:46.000Z', contribution: 'Hidrometría', official: true,
    connected: true, organizationId: 'ina', organizationName: 'Instituto Nacional del Agua', feedId: 'ina-rest-30', feedName: 'INA REST',
    classification: 'OPERATIONAL_FRESH', freshness: 'ACTUALIZADO', determinesPrimaryState: true, url: 'https://www.argentina.gob.ar/ina',
  },
  {
    id: 'ina-rest-3044', name: 'INA REST · Salado Santo Tomé', kind: 'OFFICIAL_OBSERVATION', status: 'FRESH', observedAt: generatedAt,
    fetchedAt: generatedAt, lastCheckedAt: generatedAt, validUntil: '2026-08-07T18:56:46.000Z', contribution: 'Hidrometría', official: true,
    connected: true, organizationId: 'ina', organizationName: 'Instituto Nacional del Agua', feedId: 'ina-rest-3044', feedName: 'INA REST',
    classification: 'OPERATIONAL_FRESH', freshness: 'ACTUALIZADO', determinesPrimaryState: true, url: 'https://www.argentina.gob.ar/ina',
  },
  {
    id: 'smn-alerts', name: 'Alertas SMN CAP', kind: 'OFFICIAL_ALERT', status: 'UNAVAILABLE', observedAt: null, fetchedAt: generatedAt,
    lastCheckedAt: generatedAt, validUntil: null, contribution: 'Alertas', official: true, connected: false, organizationId: 'smn',
    organizationName: 'Servicio Meteorológico Nacional', feedId: 'smn-alerts', feedName: 'Alertas oficiales SMN', classification: 'DEGRADED',
    freshness: 'NO_DISPONIBLE', determinesPrimaryState: false, url: 'https://www.smn.gob.ar/alertas', limitations: 'Canal no disponible en fixture.',
  },
  {
    id: 'province-early-warning-page', name: 'Protección Civil de Santa Fe', kind: 'OFFICIAL_ALERT', status: 'UNAVAILABLE', observedAt: null,
    fetchedAt: generatedAt, lastCheckedAt: generatedAt, validUntil: null, contribution: 'Contexto provincial', official: true, connected: false,
    organizationId: 'province', organizationName: 'Protección Civil de Santa Fe', feedId: 'province', feedName: 'Canal provincial',
    classification: 'BLOCKED_NO_MACHINE_ENDPOINT', freshness: 'NO_DISPONIBLE', determinesPrimaryState: false, url: 'https://www.santafe.gov.ar/',
  },
] as const;

const snapshot = {
  schemaVersion: '1.0', id: 'owner-left-inset-002', mode: 'LIVE', dataStatus: 'LIVE', freshness: 'ACTUALIZADO', generatedAt,
  previousSnapshotAt: null, state: 'UNKNOWN', stateLabel: 'Estado no clasificado', summary: 'Fixture geométrico del amendment OWNER.',
  dominantSourceId: 'ina-rest-30', validUntil: '2026-08-07T18:56:46.000Z', recommendedAction: 'Verificá fuentes oficiales.',
  emergencyDisclaimer: 'SOS-SF es independiente. Ante peligro inmediato llamá a emergencias.', alertStatus: 'FUENTES_DE_ALERTAS_NO_DISPONIBLES',
  alerts: [], timeline: [], sourceOrganizations: [], serviceStatus: { worker: 'OPERATIONAL', api: 'OPERATIONAL', checkedAt: generatedAt }, changes: [],
  systems, river: { systemId: systems[0].id, available: true, dataStatus: 'LIVE', stationName: 'Santa Fe', currentMetres: 3.30, delta1h: .01,
    delta6h: .04, delta24h: .12, trend: 'RISING_SLOWLY', observedAt: generatedAt, fetchedAt: generatedAt,
    validUntil: '2026-08-07T18:56:46.000Z', sourceId: 'ina-rest-30', sourceName: 'Instituto Nacional del Agua · INA REST', points, forecastPoints: [], thresholds: [] },
  rain: { available: false, dataStatus: 'UNAVAILABLE', accumulated1hMm: null, accumulated24hMm: null, forecast: 'No disponible', observedAt: null,
    fetchedAt: generatedAt, validUntil: null, sourceId: 'smn-alerts', points: [] }, sources, contradictions: [], shelters: [], actions: [], messages: [],
} as unknown as Snapshot;

async function mockPublicApi(page: Page) {
  await page.route('**/api/snapshot*', (route) => route.fulfill({ json: { ok: true, data: snapshot, meta: { schemaVersion: '1.0', generatedAt, mode: 'LIVE', official: false } } }));
  await page.route('**/api/sources*', (route) => route.fulfill({ json: { ok: true, data: { snapshotId: snapshot.id, systems, sources } } }));
  await page.route('**/api/messages*', (route) => route.fulfill({ json: { ok: true, data: { snapshotId: snapshot.id, messages: [], deliveryClaims: 'NONE' } } }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: false, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

const representativeSelectors = [
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

test('OWNER left inset, decorative gap and edge collision gates', async ({ page }) => {
  await mockPublicApi(page);
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
    const measurements = await page.evaluate(({ selectors, viewport, zoom }) => {
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
      return {
        viewport, zoom, pageGutter, ruleLeft, ruleWidth, ruleRight, overflow,
        elements: selectors.map(([element, selector]) => {
          const node = document.querySelector(selector) as HTMLElement | null;
          if (!node) throw new Error(`missing ${selector}`);
          const rect = node.getBoundingClientRect();
          const contentInset = rect.left - cardRect.left;
          const ruleToContentGap = rect.left - ruleRight;
          const rightBorderGap = cardRect.right - rect.right;
          const pass = pageGutter >= 15.5 && contentInset >= 19.5 && ruleToContentGap >= 15.5 && rightBorderGap >= 15.5 && overflow <= 1;
          return { element, selector, leftEdge: rect.left, rightEdge: rect.right, containerLeftEdge: cardRect.left, containerRightEdge: cardRect.right,
            decorativeRuleRightEdge: ruleRight, contentInset, ruleToContentGap, rightBorderGap, passFail: pass ? 'PASS' : 'FAIL' };
        }),
      };
    }, { selectors: representativeSelectors, viewport: item.viewport, zoom: item.zoom });

    expect(measurements.pageGutter).toBeGreaterThanOrEqual(15.5);
    expect(measurements.ruleWidth).toBeGreaterThanOrEqual(3.5);
    expect(measurements.overflow).toBeLessThanOrEqual(1);
    for (const row of measurements.elements) {
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
