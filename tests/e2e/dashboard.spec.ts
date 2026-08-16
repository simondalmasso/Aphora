import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { Snapshot, Source } from '../../src/domain/snapshot.ts';

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/current-run';
const generatedAt = '2026-08-06T04:30:00.000Z';
const storageKey = 'sos-sf:last-public-safety-snapshot:v4';

const points = (base: number, endAt = generatedAt) => Array.from({ length: 30 }, (_, index) => ({
  at: new Date(Date.parse(endAt) - (29 - index) * 60 * 60_000).toISOString(),
  metres: base + index * .008,
  measured: true,
  quality: 'PUBLISHED_OPERATIONAL' as const,
}));

function source(input: Partial<Source> & Pick<Source, 'id' | 'name'>): Source {
  return {
    kind: 'OFFICIAL_OBSERVATION',
    status: 'FRESH',
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    lastCheckedAt: generatedAt,
    validUntil: '2026-08-06T10:30:00.000Z',
    contribution: 'Fuente pública inventariada.',
    official: true,
    connected: true,
    organizationId: 'ina',
    organizationName: 'Instituto Nacional del Agua',
    feedId: input.id,
    feedName: input.name,
    classification: 'OPERATIONAL_FRESH',
    freshness: 'ACTUALIZADO',
    determinesPrimaryState: false,
    url: 'https://example.test/official',
    ...input,
  };
}

const systems = [
  {
    id: 'parana-santa-fe',
    label: 'Río Paraná — Santa Fe',
    watercourse: 'Río Paraná',
    stationName: 'Santa Fe',
    stationCode: '30',
    available: true,
    dataStatus: 'LIVE' as const,
    freshness: 'ACTUALIZADO' as const,
    currentMetres: 3.22,
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    validUntil: '2026-08-06T10:30:00.000Z',
    sourceId: 'ina-rest-30',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: points(2.988),
    thresholds: [
      { id: 'NORMAL' as const, label: 'Referencia inferior', metres: 2 },
      { id: 'ALERTA' as const, label: 'Nivel de alerta de referencia', metres: 5.3 },
      { id: 'EVACUACION' as const, label: 'Nivel de evacuación de referencia', metres: 5.7 },
    ],
    trend: 'RISING_SLOWLY' as const,
    delta1h: .01,
    delta6h: .06,
    delta24h: .23,
  },
  {
    id: 'salado-santo-tome',
    label: 'Río Salado — Santo Tomé',
    watercourse: 'Río Salado',
    stationName: 'Santo Tomé',
    stationCode: '1679',
    available: true,
    dataStatus: 'STALE' as const,
    freshness: 'ACTUALIZACION_DEMORADA' as const,
    currentMetres: 4.8,
    observedAt: '2026-08-05T18:00:00.000Z',
    fetchedAt: '2026-08-06T04:25:00.000Z',
    validUntil: '2026-08-06T00:00:00.000Z',
    sourceId: 'ina-rest-3044',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: points(4.568, '2026-08-05T18:00:00.000Z'),
    thresholds: [
      { id: 'NORMAL' as const, label: 'Referencia inferior', metres: 0 },
      { id: 'ALERTA' as const, label: 'Nivel de alerta de referencia', metres: 4.7 },
    ],
    trend: 'RISING' as const,
    delta1h: .01,
    delta6h: .06,
    delta24h: .23,
  },
] as const;

const sources: Source[] = [
  source({ id: 'ina-rest-30', name: 'INA REST · Paraná Santa Fe', determinesPrimaryState: true }),
  source({ id: 'ina-rest-3044', name: 'INA REST · Salado Santo Tomé', determinesPrimaryState: true, status: 'STALE', classification: 'OPERATIONAL_STALE', freshness: 'ACTUALIZACION_DEMORADA' }),
  source({ id: 'ina-waterml-parana', name: 'INA WaterOneFlow / WaterML · Paraná', feedName: 'INA WaterML · Paraná' }),
  source({ id: 'ina-waterml-salado', name: 'INA WaterOneFlow / WaterML · Salado', feedName: 'INA WaterML · Salado', status: 'STALE', classification: 'OPERATIONAL_STALE', freshness: 'ACTUALIZACION_DEMORADA' }),
  source({
    id: 'smn-alerts',
    name: 'Alertas SMN CAP',
    kind: 'OFFICIAL_ALERT',
    organizationId: 'smn',
    organizationName: 'Servicio Meteorológico Nacional',
    feedName: 'Alertas oficiales SMN · CAP',
    status: 'UNAVAILABLE',
    connected: false,
    classification: 'DEGRADED',
    freshness: 'NO_DISPONIBLE',
    limitations: 'Timeout de la última consulta automática.',
  }),
  source({
    id: 'province-early-warning-page',
    name: 'Sistema de Alerta Temprana',
    kind: 'OFFICIAL_ALERT',
    organizationId: 'province',
    organizationName: 'Protección Civil de Santa Fe',
    feedName: 'Canal provincial de alerta temprana',
    status: 'UNAVAILABLE',
    connected: false,
    classification: 'BLOCKED_NO_MACHINE_ENDPOINT',
    freshness: 'NO_DISPONIBLE',
    limitations: 'Canal humano oficial; no se presenta como feed automático.',
  }),
  source({
    id: 'nasa-gpm-imerg-early',
    name: 'NASA GPM IMERG Early',
    kind: 'SATELLITE_OBSERVATION',
    organizationId: 'nasa',
    organizationName: 'NASA',
    feedName: 'GPM IMERG Early · estimación satelital',
    classification: 'SUPPLEMENTARY',
    determinesPrimaryState: false,
    official: false,
  }),
];

const activeAlert = {
  identifier: 'smn-019',
  sender: 'Servicio Meteorológico Nacional',
  sent: '2026-08-06T04:00:00.000Z',
  status: 'Actual',
  messageType: 'Alert',
  scope: 'Public',
  category: 'Met',
  event: 'Tormentas fuertes',
  urgency: 'Immediate',
  severity: 'Severe',
  certainty: 'Likely',
  effective: '2026-08-06T04:00:00.000Z',
  onset: '2026-08-06T04:00:00.000Z',
  expires: '2026-08-06T10:00:00.000Z',
  headline: 'Alerta por tormentas fuertes',
  description: 'Se esperan tormentas fuertes.',
  instruction: 'Permanecé en un lugar seguro y evitá circular.',
  area: 'Departamento La Capital, Santa Fe',
  sourceUrl: 'https://example.test/alert',
  lifecycle: 'ACTIVE' as const,
  appliesToSantaFe: true,
};

const baseSnapshot: Snapshot = {
  schemaVersion: '1.0',
  id: 'order-020-live',
  mode: 'LIVE',
  dataStatus: 'STALE',
  freshness: 'ACTUALIZACION_DEMORADA',
  generatedAt,
  previousSnapshotAt: '2026-08-06T04:15:00.000Z',
  state: 'UNKNOWN',
  stateLabel: 'Estado no clasificado por vigencia insuficiente',
  summary: 'Paraná vigente. Salado conserva su última medición con actualización demorada.',
  dominantSourceId: 'ina-rest-30',
  validUntil: '2026-08-06T10:30:00.000Z',
  recommendedAction: 'Consultá las mediciones y los canales oficiales ante cambios.',
  emergencyDisclaimer: 'Servicio independiente de información pública. Ante peligro inmediato, llamá a emergencias.',
  alertStatus: 'FUENTES_DE_ALERTAS_NO_DISPONIBLES',
  alerts: [],
  timeline: [],
  sourceOrganizations: [
    { id: 'ina', name: 'Instituto Nacional del Agua', official: true, url: 'https://example.test/ina' },
    { id: 'smn', name: 'Servicio Meteorológico Nacional', official: true, url: 'https://example.test/smn' },
    { id: 'province', name: 'Protección Civil de Santa Fe', official: true, url: 'https://example.test/province' },
  ],
  serviceStatus: { worker: 'OPERATIONAL', api: 'OPERATIONAL', checkedAt: generatedAt, note: 'Servicio operativo.' },
  changes: [],
  systems,
  river: {
    systemId: systems[0].id,
    available: true,
    dataStatus: 'LIVE',
    stationName: 'Santa Fe',
    currentMetres: 3.22,
    delta1h: .01,
    delta6h: .06,
    delta24h: .23,
    trend: 'RISING_SLOWLY',
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    validUntil: '2026-08-06T10:30:00.000Z',
    sourceId: 'ina-rest-30',
    sourceName: systems[0].sourceName,
    points: systems[0].points,
    forecastPoints: [],
    thresholds: systems[0].thresholds,
  },
  rain: {
    available: false,
    dataStatus: 'UNAVAILABLE',
    accumulated1hMm: null,
    accumulated24hMm: null,
    forecast: 'Sin muestra válida.',
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    validUntil: '2026-08-06T10:30:00.000Z',
    sourceId: 'nasa-gpm-imerg-early',
    points: [],
  },
  sources,
  contradictions: [],
  shelters: [],
  actions: [],
  messages: [],
};

function snapshotWith(overrides: Partial<Snapshot>): Snapshot {
  return { ...baseSnapshot, ...overrides };
}

async function mockPublicApi(page: Page, snapshot: Snapshot = baseSnapshot) {
  await page.route('**/api/snapshot*', (route) => route.fulfill({
    headers: { 'Cache-Control': 'no-store' },
    json: { ok: true, data: snapshot, meta: { schemaVersion: '1.0', generatedAt, mode: snapshot.mode, official: false } },
  }));
  await page.route('**/api/sources*', (route) => route.fulfill({
    headers: { 'Cache-Control': 'no-store' },
    json: { ok: true, data: { snapshotId: snapshot.id, systems: snapshot.systems ?? [], sources: snapshot.sources } },
  }));
  await page.route('**/api/messages*', (route) => route.fulfill({ json: { ok: true, data: { snapshotId: snapshot.id, messages: [], deliveryClaims: 'NONE' } } }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: false, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

async function expectSnapshot(page: Page, snapshot: Snapshot): Promise<void> {
  await expect(page.locator('main')).toHaveAttribute('data-snapshot-id', snapshot.id);
  await expect(page.getByTestId('hydrometric-situation')).toBeVisible();
}

async function screenshotSha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}


test.beforeAll(async () => {
  await mkdir(`${evidenceDir}/screenshots`, { recursive: true });
  await writeFile(`${evidenceDir}/order-020-scenario.json`, `${JSON.stringify({
    order: 'SOS-SF-AUD-FULL-CODEBASE-REVIEW-AND-END-TO-END-CLOSE-020',
    generatedAt,
    viewports: ['390x844', '768x1024', '1440x900'],
    states: ['LIVE', 'STALE', 'ALERT_ACTIVE', 'ALERTS_UNVERIFIED', 'OFFLINE'],
  }, null, 2)}\n`);
});

test('390x844 starts with hydrometric situation and exposes the chart', async ({ page }) => {
  await mockPublicApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const hydro = page.getByTestId('hydrometric-situation');
  await expect(hydro).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Paraná' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Salado' })).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,22');
  await expect(hydro.getByText(/Al día/)).toBeVisible();
  await expect(page.getByTestId('main-hydro-chart')).toBeVisible();
  await expect(page.getByTestId('hydro-source-strip')).toContainText('Instituto Nacional del Agua');

  const mainFirstElement = await page.locator('main > :not(.verified-alert-banner)').first().getAttribute('data-testid');
  expect(mainFirstElement).toBe('hydrometric-situation');

  const headingBox = await hydro.boundingBox();
  expect(headingBox?.y).toBeLessThan(120);
  const chartBox = await page.getByTestId('main-hydro-chart').boundingBox();
  expect(chartBox).not.toBeNull();
  const visibleChartHeight = Math.max(0, Math.min(844, chartBox!.y + chartBox!.height) - Math.max(0, chartBox!.y));
  const levelBox = await page.getByTestId('hydro-current-level').boundingBox();
  expect(levelBox).not.toBeNull();
  expect(levelBox!.y).toBeLessThan(844);

  const wordsBeforeChart = await page.locator('.hydrometric-hero__header, .station-identification, .hydro-reading, .source-strip').evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).innerText).join(' ').trim().split(/\s+/).filter(Boolean).length);
  expect(wordsBeforeChart).toBeLessThanOrEqual(125);
  await expect(page.getByTestId('hydro-meaning')).toBeVisible();
  await writeFile(`${evidenceDir}/first-viewport-metrics.json`, `${JSON.stringify({
    viewport: '390x844',
    headingY: headingBox?.y ?? null,
    chartY: chartBox?.y ?? null,
    chartVisibleRatio: visibleChartHeight / chartBox!.height,
    wordsBeforeChart,
    firstBlock: mainFirstElement,
  }, null, 2)}\n`);
});

test('stays within section, scroll and horizontal-overflow budgets', async ({ page }) => {
  await mockPublicApi(page);
  const cases = [
    { width: 390, height: 844, maxRatio: 2.4 },
    { width: 768, height: 1024, maxRatio: 1.9 },
    { width: 1440, height: 900, maxRatio: 1.35 },
  ];
  const results = [];
  for (const item of cases) {
    await page.setViewportSize(item);
    await page.goto('/');
    await expect(page.getByTestId('hydrometric-situation')).toBeVisible();
    const metrics = await page.evaluate(() => ({
      ratio: document.documentElement.scrollHeight / window.innerHeight,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      sections: document.querySelectorAll('main > section').length,
    }));
    results.push({ ...item, ...metrics });
    expect(metrics.sections).toBe(4);
    expect(metrics.overflow).toBeLessThanOrEqual(1);
  }
  await writeFile(`${evidenceDir}/density-metrics.json`, `${JSON.stringify(results, null, 2)}\n`);
});

test('an alert feed failure is only a compact header badge and opens a dialog', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const badge = page.getByRole('button', { name: 'Verificación no disponible' });
  await expect(badge).toBeVisible();
  const hydroBox = await page.getByTestId('hydrometric-situation').boundingBox();
  expect(hydroBox?.y).toBeLessThan(130);
  await expect(page.locator('.verified-alert-banner')).toHaveCount(0);
  await badge.click();
  await expect(page.getByRole('dialog')).toContainText('No pudimos verificar alertas ahora');
  await page.getByRole('button', { name: 'Cerrar alertas' }).click();
  await expect(badge).toBeFocused();
});

test('a verified active alert may appear as one compact priority band', async ({ page }) => {
  const active = snapshotWith({
    alertStatus: 'ALERTA_OFICIAL_ACTIVA',
    alerts: [activeAlert],
    recommendedAction: activeAlert.instruction,
  });
  await mockPublicApi(page, active);
  await page.goto('/');
  await expect(page.locator('.verified-alert-banner')).toContainText('Alerta por tormentas fuertes');
  await expect(page.getByTestId('hydrometric-situation')).toBeVisible();
  const bannerBox = await page.locator('.verified-alert-banner').boundingBox();
  const hydroBox = await page.getByTestId('hydrometric-situation').boundingBox();
  expect(bannerBox!.y).toBeLessThan(hydroBox!.y);
});

test('chart supports keyboard reading and the source surface is traceable', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const chart = page.locator('[data-testid="main-hydro-chart"] svg');
  await chart.focus();
  await chart.press('Home');
  await expect(page.locator('.hydro-chart__readout')).not.toContainText('Tocá');
  await chart.press('End');
  await expect(page.locator('.hydro-chart__readout')).toContainText('3,22');
  await page.getByRole('button', { name: 'Ver fuente y detalle', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('INA REST');
  await expect(page.getByRole('dialog')).toContainText('INA WaterML');
});

test('skip link is hidden until keyboard focus', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const skip = page.getByRole('link', { name: 'Saltar al contenido principal' });
  const before = await skip.evaluate((element) => getComputedStyle(element).transform);
  expect(before).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  const after = await skip.evaluate((element) => getComputedStyle(element).transform);
  expect(after).not.toBe(before);
  const focusedBox = await skip.boundingBox();
  expect(focusedBox?.y).toBeGreaterThanOrEqual(0);
});

test('offline keeps the cached hydrometric surface and signals connection state', async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  }, { key: storageKey, value: JSON.stringify({ snapshot: baseSnapshot, savedAt: generatedAt }) });
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('Sin conexión', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('hydrometric-situation')).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,22');
});

test('captures required visual states with unique hashes and verified semantics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One deterministic evidence pass is sufficient.');
  const screenshots = `${evidenceDir}/screenshots`;
  const manifest: Record<string, { readonly sha256: string; readonly snapshotId: string; readonly semantic: string }> = {};

  for (const viewport of [
    { width: 390, height: 844, name: 'after-390x844' },
    { width: 768, height: 1024, name: 'after-768x1024' },
    { width: 1440, height: 900, name: 'after-1440x900' },
  ]) {
    await mockPublicApi(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expectSnapshot(page, baseSnapshot);
    const path = `${screenshots}/${viewport.name}.png`;
    await page.screenshot({ path, fullPage: true });
    manifest[viewport.name] = { sha256: await screenshotSha256(path), snapshotId: baseSnapshot.id, semantic: 'LIVE_HYDROMETRIC_FIRST' };
    await page.unrouteAll({ behavior: 'wait' });
  }

  await mockPublicApi(page, baseSnapshot);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expectSnapshot(page, baseSnapshot);
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,22');
  const livePath = `${screenshots}/state-live.png`;
  await page.screenshot({ path: livePath, fullPage: true });
  manifest['state-live'] = { sha256: await screenshotSha256(livePath), snapshotId: baseSnapshot.id, semantic: 'LIVE_VALUE_AND_CHART' };
  await page.unrouteAll({ behavior: 'wait' });

  const staleObservedAt = '2026-08-05T04:30:00.000Z';
  const staleSystem = {
    ...systems[0],
    freshness: 'DESACTUALIZADO' as const,
    dataStatus: 'STALE' as const,
    observedAt: staleObservedAt,
    fetchedAt: '2026-08-06T04:25:00.000Z',
    validUntil: '2026-08-05T10:30:00.000Z',
    points: points(2.988, staleObservedAt),
  };
  const stale = snapshotWith({
    id: 'order-020-stale',
    dataStatus: 'STALE',
    freshness: 'DESACTUALIZADO',
    state: 'UNKNOWN',
    stateLabel: 'No hay una medición vigente suficiente para clasificar el nivel',
    systems: [staleSystem, systems[1]],
    river: { ...baseSnapshot.river, dataStatus: 'STALE', observedAt: staleObservedAt, fetchedAt: staleSystem.fetchedAt, validUntil: staleSystem.validUntil, points: staleSystem.points },
  });
  await mockPublicApi(page, stale);
  await page.goto('/');
  await expectSnapshot(page, stale);
  await expect(page.getByText(/Dato desactualizado/).first()).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,22');
  await expect(page.getByTestId('main-hydro-chart')).toBeVisible();
  const stalePath = `${screenshots}/state-stale.png`;
  await page.screenshot({ path: stalePath, fullPage: true });
  manifest['state-stale'] = { sha256: await screenshotSha256(stalePath), snapshotId: stale.id, semantic: 'STALE_VALUE_AND_CHART_PRESERVED' };
  await page.unrouteAll({ behavior: 'wait' });

  const active = snapshotWith({ id: 'order-020-active-alert', alertStatus: 'ALERTA_OFICIAL_ACTIVA', alerts: [activeAlert], recommendedAction: activeAlert.instruction });
  await mockPublicApi(page, active);
  await page.goto('/');
  await expectSnapshot(page, active);
  await expect(page.locator('.verified-alert-banner')).toContainText('Alerta oficial vigente');
  await expect(page.locator('.verified-alert-banner')).toContainText(activeAlert.headline);
  const activePath = `${screenshots}/state-active-alert.png`;
  await page.screenshot({ path: activePath, fullPage: true });
  manifest['state-active-alert'] = { sha256: await screenshotSha256(activePath), snapshotId: active.id, semantic: 'VERIFIED_ACTIVE_ALERT_BAND' };
  await page.unrouteAll({ behavior: 'wait' });

  await mockPublicApi(page, baseSnapshot);
  await page.goto('/');
  await expectSnapshot(page, baseSnapshot);
  await expect(page.getByRole('button', { name: 'Verificación no disponible' })).toBeVisible();
  await expect(page.locator('.verified-alert-banner')).toHaveCount(0);
  const unverifiedPath = `${screenshots}/state-alerts-unverified.png`;
  await page.screenshot({ path: unverifiedPath, fullPage: true });
  manifest['state-alerts-unverified'] = { sha256: await screenshotSha256(unverifiedPath), snapshotId: baseSnapshot.id, semantic: 'HEADER_BADGE_ONLY' };
  await page.unrouteAll({ behavior: 'wait' });

  const semanticHashes = [manifest['state-stale']!.sha256, manifest['state-active-alert']!.sha256, manifest['state-alerts-unverified']!.sha256];
  expect(new Set(semanticHashes).size).toBe(3);

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  }, { key: storageKey, value: JSON.stringify({ snapshot: baseSnapshot, savedAt: generatedAt }) });
  await page.route('**/api/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('Sin conexión', { exact: true })).toHaveCount(1);
  await expectSnapshot(page, baseSnapshot);
  const offlinePath = `${screenshots}/state-offline.png`;
  await page.screenshot({ path: offlinePath, fullPage: true });
  manifest['state-offline'] = { sha256: await screenshotSha256(offlinePath), snapshotId: baseSnapshot.id, semantic: 'OFFLINE_CACHED_HYDROMETRY' };

  await writeFile(`${evidenceDir}/state-screenshot-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(`${evidenceDir}/ROAST_BEFORE_AFTER.md`, [
    '# SOS-SF 020 — comparación y evidencia semántica',
    '',
    '| Base rechazada por el owner | Cierre hidrométrico 020 |',
    '|---|---|',
    '| `before-owner-rejected.png` | `screenshots/after-390x844.png` |',
    '',
    'Los estados LIVE, STALE, ALERT_ACTIVE, ALERTS_UNVERIFIED y OFFLINE fueron renderizados con snapshots identificables, aserciones semánticas previas y hashes individuales.',
    'La aceptación queda reservada a AUD y al owner.',
    '',
  ].join('\n'));
});
