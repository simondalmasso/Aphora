import { expect, test, type Page } from '@playwright/test';
import type { HydrologicalSystem, Snapshot, Source } from '../../src/domain/snapshot.ts';
import { unavailableSnapshot } from '../../src/data/unavailable-snapshot.ts';
import { stableHydrometricSnapshot } from './fixtures/stable-hydrometric.ts';

const generatedAt = stableHydrometricSnapshot.generatedAt;
const validUntil = '2026-08-13T23:00:00.000Z';
const STORAGE_KEY = 'sos-sf:last-public-safety-snapshot:v4';

function makePoints(endAt: string, start: number, count = 190, step = .002) {
  return Array.from({ length: count }, (_, index) => ({
    at: new Date(Date.parse(endAt) - (count - 1 - index) * 60 * 60_000).toISOString(),
    metres: start + index * step,
    measured: true,
    quality: 'PUBLISHED_OPERATIONAL' as const,
  }));
}

function sourceFor(system: HydrologicalSystem, overrides: Partial<Source> = {}): Source {
  return {
    id: system.sourceId,
    name: `INA REST · ${system.watercourse}`,
    kind: 'OFFICIAL_OBSERVATION',
    status: 'FRESH',
    observedAt: system.observedAt ?? generatedAt,
    fetchedAt: system.fetchedAt ?? generatedAt,
    lastCheckedAt: system.fetchedAt ?? generatedAt,
    validUntil: system.validUntil ?? validUntil,
    contribution: `Serie oficial de ${system.stationName}.`,
    official: true,
    connected: true,
    organizationId: 'ina',
    organizationName: 'Instituto Nacional del Agua',
    feedId: system.sourceId,
    feedName: `INA REST · ${system.watercourse}, estación ${system.stationName}`,
    classification: 'OPERATIONAL_FRESH',
    freshness: 'ACTUALIZADO',
    determinesPrimaryState: true,
    url: 'https://alerta.ina.gob.ar/',
    ...overrides,
  };
}

function parana(metres = 3.2, count = 190): HydrologicalSystem {
  const pts = makePoints(generatedAt, metres - (count - 1) * .002, count, .002);
  return {
    id: 'parana-santa-fe',
    label: 'Río Paraná — Santa Fe',
    watercourse: 'Río Paraná',
    stationName: 'Santa Fe',
    stationCode: '30',
    available: true,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    currentMetres: metres,
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    validUntil,
    sourceId: 'ina-rest-30',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: pts,
    thresholds: [
      { id: 'NORMAL', label: 'Referencia inferior', metres: 2 },
      { id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: 5.3 },
      { id: 'EVACUACION', label: 'Nivel de evacuación de referencia', metres: 5.7 },
    ],
    trend: 'RISING_SLOWLY',
    delta1h: .002,
    delta6h: .012,
    delta24h: .048,
  };
}

function salado(metres = 3.42, count = 190): HydrologicalSystem {
  const pts = makePoints(generatedAt, metres - (count - 1) * .001, count, .001);
  return {
    id: 'salado-santo-tome',
    label: 'Río Salado — Santo Tomé',
    watercourse: 'Río Salado',
    stationName: 'Santo Tomé',
    stationCode: '1679',
    available: true,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    currentMetres: metres,
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    validUntil,
    sourceId: 'ina-rest-3044',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: pts,
    thresholds: [
      { id: 'NORMAL', label: 'Referencia inferior', metres: 0 },
      { id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: 4.7 },
      { id: 'EVACUACION', label: 'Nivel de evacuación de referencia', metres: 0 },
    ],
    trend: 'RISING_SLOWLY',
    delta1h: .001,
    delta6h: .006,
    delta24h: .024,
  };
}

function snapshotWith(systems: readonly HydrologicalSystem[], id: string): Snapshot {
  const sources = systems.map((system) => sourceFor(system));
  const primary = systems[0]!;
  return {
    ...stableHydrometricSnapshot,
    id,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    systems,
    sources,
    river: {
      ...stableHydrometricSnapshot.river,
      systemId: primary.id,
      stationName: primary.stationName,
      currentMetres: primary.currentMetres ?? 0,
      delta1h: primary.delta1h ?? 0,
      delta6h: primary.delta6h ?? 0,
      delta24h: primary.delta24h ?? 0,
      trend: primary.trend,
      observedAt: primary.observedAt ?? generatedAt,
      fetchedAt: primary.fetchedAt ?? generatedAt,
      validUntil: primary.validUntil ?? validUntil,
      sourceId: primary.sourceId,
      sourceName: primary.sourceName,
      points: primary.points,
      thresholds: primary.thresholds,
    },
  };
}

async function install(page: Page, snapshot: Snapshot) {
  await page.route('**/api/snapshot*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: snapshot, meta: { schemaVersion: '1.0', generatedAt: snapshot.generatedAt, mode: snapshot.mode, official: false } }),
  }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: true, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

async function open(page: Page, snapshot: Snapshot) {
  await install(page, snapshot);
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-snapshot-id', snapshot.id);
}

const normal = snapshotWith([parana(), salado()], '026-parana-context');
const saladoOnlyContext = snapshotWith([parana(), salado(3.42)], '026-salado-context');
const dual = snapshotWith([parana(5.4), salado(4.8)], '026-dual');

function staleFreshFetch(): Snapshot {
  const observed = new Date(Date.parse(generatedAt) - 42 * 60 * 60_000).toISOString();
  const fetched = new Date(Date.parse(generatedAt) - 30_000).toISOString();
  const base = parana(3.2, 190);
  const shift = Date.parse(base.observedAt!) - Date.parse(observed);
  const pts = base.points.map((point) => ({ ...point, at: new Date(Date.parse(point.at) - shift).toISOString() }));
  const system: HydrologicalSystem = { ...base, observedAt: observed, fetchedAt: fetched, points: pts, freshness: 'DESACTUALIZADO', dataStatus: 'STALE' };
  const snapshot = snapshotWith([system, salado()], '026-stale-fresh-fetch');
  return { ...snapshot, sources: [sourceFor(system, { observedAt: observed, fetchedAt: fetched, lastCheckedAt: fetched, freshness: 'DESACTUALIZADO', status: 'STALE', classification: 'OPERATIONAL_STALE' }), sourceFor(snapshot.systems![1]!)] };
}

function insufficientHistory(): Snapshot {
  return snapshotWith([parana(3.2, 30), salado(3.42, 30)], '026-insufficient-history');
}

test('three-second Paraná read shows level, station reference, trend, age and source without raw cross-station comparison', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 fixture matrix runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, normal);
  await expect(page.getByRole('heading', { level: 1, name: 'Situación hidrométrica' })).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,20');
  await expect(page.getByTestId('hydro-meaning')).toContainText('por debajo del nivel de alerta de referencia');
  await expect(page.getByText('Sube lentamente', { exact: true })).toBeVisible();
  await expect(page.getByText(/Medición de hace/)).toBeVisible();
  await expect(page.getByTestId('hydro-source-strip')).toContainText('Instituto Nacional del Agua');
  await expect(page.getByTestId('hydro-context-scale')).toBeVisible();
  const saladoTab = page.getByRole('tab', { name: 'Salado' });
  await expect(saladoTab).not.toContainText(/\d[,.]\d+\s*m/);
  const [h1Size, levelSize] = await Promise.all([
    page.getByRole('heading', { level: 1, name: 'Situación hidrométrica' }).evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    page.getByTestId('hydro-current-level').evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
  ]);
  expect(levelSize).toBeGreaterThan(h1Size * 1.7);
});

test('Salado exposes only the verified alert reference and never renders unverified zero semantics', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 fixture matrix runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, saladoOnlyContext);
  await page.getByRole('tab', { name: 'Salado' }).click();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,42');
  await expect(page.getByTestId('hydro-meaning')).toHaveText('1,28 m por debajo del nivel de alerta de referencia · 4,70 m');
  await expect(page.getByTestId('hydro-context-scale')).toContainText('Nivel de alerta de referencia · 4,70 m');
  await expect(page.getByTestId('hydro-context-scale')).not.toContainText('0,00 m');
  await page.getByRole('button', { name: 'Qué significa esta altura' }).click();
  const dialog = page.locator('dialog.details-dialog');
  await expect(dialog).toContainText('no publica un cero IGN utilizable');
  const saladoDetail = dialog.locator('.detail-list--hydrometric article').filter({ hasText: 'Río Salado' });
  await expect(saladoDetail).not.toContainText('Referencia inferior · 0,00 m');
  await expect(saladoDetail).not.toContainText('evacuación de referencia · 0,00 m');
});

test('stale measurement and fresh source consultation remain visibly separate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 fixture matrix runs once.');
  await open(page, staleFreshFetch());
  const source = page.getByTestId('hydro-source-strip');
  await expect(source).toContainText('Medición · hace 42 horas');
  await expect(source).toContainText('Consulta de la fuente · hace menos de un minuto');
  await expect(source).not.toContainText('Recibidos');
});

test('insufficient history says so instead of fabricating 72 h or 7 d deltas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 fixture matrix runs once.');
  await open(page, insufficientHistory());
  const horizons = page.locator('.meaning-horizons');
  await expect(horizons).toContainText('Sin datos suficientes para comparar 72 h');
  await expect(horizons).toContainText('Sin datos suficientes para comparar 7 días');
  await expect(page.getByRole('button', { name: '72 h' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '7 días' })).toBeDisabled();
});

test('dual relevant emergency keeps both meaning modules at equal visual weight', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 fixture matrix runs once.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, dual);
  const priority = page.getByTestId('river-operational-priority');
  await expect(priority).toContainText('prioridad equivalente 50/50');
  const a = priority.locator('[data-river-system="parana-santa-fe"]');
  const b = priority.locator('[data-river-system="salado-santo-tome"]');
  await expect(a).toContainText('nivel de alerta de referencia');
  await expect(b).toContainText('nivel de alerta de referencia');
  const [abox, bbox] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  expect(Math.abs((abox?.width ?? 0) - (bbox?.width ?? 0))).toBeLessThanOrEqual(2);
});

test('no-data and offline states preserve uncertainty rather than inventing meaning', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 fixture matrix runs once.');
  await open(page, { ...unavailableSnapshot, id: '026-no-data' });
  await expect(page.getByText('No pudimos obtener una medición reciente')).toBeVisible();
  await expect(page.getByText(/falta de dato no significa una emergencia/i)).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });

  await page.addInitScript(({ key, snapshot, savedAt }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
    localStorage.setItem(key, JSON.stringify({ snapshot, savedAt }));
  }, { key: STORAGE_KEY, snapshot: normal, savedAt: generatedAt });
  await page.goto('/');
  await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,20');
  await expect(page.getByText('Sin vigencia confirmada').first()).toBeVisible();
});

test('recent chart keeps centimetre-scale resolution while distant thresholds stay outside the plot', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 fixture matrix runs once.');
  await open(page, normal);
  const chart = page.getByTestId('main-hydro-chart');
  const max = Number(await chart.getAttribute('data-plot-max'));
  const min = Number(await chart.getAttribute('data-plot-min'));
  expect(max - min).toBeLessThan(.4);
  expect(max).toBeLessThan(4);
  await expect(chart.locator('.hydro-chart__external-reference')).toContainText('Nivel de alerta de referencia 5,30 m');
  await expect(chart.locator('svg')).toHaveAttribute('role', 'img');
  await chart.locator('svg').focus();
  await chart.locator('svg').press('End');
  await expect(chart.locator('.hydro-chart__readout')).toContainText('3,20');
});

test('026 responsive and 200%-equivalent matrix has no horizontal overflow or touch collisions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 explicit matrix runs once.');
  const cases = [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [1440, 900], [195, 422]] as const;
  for (const [width, height] of cases) {
    await page.setViewportSize({ width, height });
    await open(page, { ...normal, id: `026-${width}x${height}` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}x${height}`).toBeLessThanOrEqual(1);
    if (width <= 430) {
      const refresh = await page.getByRole('button', { name: 'Actualizar información' }).boundingBox();
      const source = await page.getByRole('button', { name: 'Ver fuente y detalle' }).first().boundingBox();
      expect(refresh?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(source?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('forbidden safety and normality claims do not appear in the normal first read', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '026 fixture matrix runs once.');
  await open(page, normal);
  const hydro = page.getByTestId('hydrometric-situation');
  const text = (await hydro.innerText()).toLowerCase();
  expect(text).not.toMatch(/\bseguro\b|\btranquilo\b|\bsin riesgo\b|profundidad del río/);
  expect(text).not.toContain('rango normal');
});
