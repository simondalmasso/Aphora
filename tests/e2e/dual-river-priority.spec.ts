import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { HydrologicalSystem, Snapshot, Source } from '../../src/domain/snapshot.ts';

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/current-run';
const generatedAt = '2026-08-12T23:00:00.000Z';
const validUntil = '2026-08-13T23:00:00.000Z';

function points(base: number) {
  return Array.from({ length: 30 }, (_, index) => ({
    at: new Date(Date.parse(generatedAt) - (29 - index) * 60 * 60_000).toISOString(),
    metres: base + index * .01,
    measured: true,
    quality: 'PUBLISHED_OPERATIONAL' as const,
  }));
}

function riverSystem(id: 'parana-santa-fe' | 'salado-santo-tome', metres: number): HydrologicalSystem {
  const parana = id === 'parana-santa-fe';
  return {
    id,
    label: parana ? 'Río Paraná — Santa Fe' : 'Río Salado — Santo Tomé',
    watercourse: parana ? 'Río Paraná' : 'Río Salado',
    stationName: parana ? 'Santa Fe' : 'Santo Tomé',
    stationCode: parana ? '30' : '1679',
    available: true,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    currentMetres: metres,
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    validUntil,
    sourceId: parana ? 'ina-rest-30' : 'ina-rest-3044',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: points(metres - .29),
    thresholds: parana
      ? [
        { id: 'NORMAL' as const, label: 'Referencia inferior', metres: 2 },
        { id: 'ALERTA' as const, label: 'Nivel de alerta de referencia', metres: 5.3 },
        { id: 'EVACUACION' as const, label: 'Nivel de evacuación de referencia', metres: 5.7 },
      ]
      : [
        { id: 'NORMAL' as const, label: 'Referencia inferior', metres: 0 },
        { id: 'ALERTA' as const, label: 'Nivel de alerta de referencia', metres: 4.7 },
      ],
    trend: parana ? 'RISING_SLOWLY' : 'RISING',
    delta1h: .01,
    delta6h: .06,
    delta24h: parana ? .18 : .24,
  };
}

function officialSource(system: HydrologicalSystem, overrides: Partial<Source> = {}): Source {
  return {
    id: system.sourceId,
    name: `INA REST · ${system.watercourse}`,
    kind: 'OFFICIAL_OBSERVATION',
    status: 'FRESH',
    observedAt: system.observedAt ?? generatedAt,
    fetchedAt: generatedAt,
    lastCheckedAt: generatedAt,
    validUntil,
    contribution: 'Lectura hidrométrica oficial para QA 021-D.',
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

function makeSnapshot(input: {
  readonly id: string;
  readonly paranaMetres: number;
  readonly saladoMetres: number;
  readonly paranaSource?: Partial<Source>;
  readonly saladoSource?: Partial<Source>;
}): Snapshot {
  const parana = riverSystem('parana-santa-fe', input.paranaMetres);
  const salado = riverSystem('salado-santo-tome', input.saladoMetres);
  const sources = [officialSource(parana, input.paranaSource), officialSource(salado, input.saladoSource)];
  return {
    schemaVersion: '1.0',
    id: input.id,
    mode: 'LIVE',
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    generatedAt,
    previousSnapshotAt: '2026-08-12T22:45:00.000Z',
    state: 'NORMAL',
    stateLabel: 'Nivel por debajo del umbral de alerta',
    summary: 'Escenario determinístico de QA 021-D.',
    dominantSourceId: parana.sourceId,
    validUntil: '2026-08-12T23:15:00.000Z',
    recommendedAction: 'Verificá fuentes oficiales.',
    emergencyDisclaimer: 'SOS-SF es independiente. Un umbral numérico no constituye una orden de evacuación.',
    alertStatus: 'SIN_ALERTAS_OFICIALES_DETECTADAS',
    alerts: [],
    timeline: [],
    sourceOrganizations: [{ id: 'ina', name: 'Instituto Nacional del Agua', official: true, url: 'https://www.argentina.gob.ar/ina' }],
    serviceStatus: { worker: 'OPERATIONAL', api: 'OPERATIONAL', checkedAt: generatedAt, note: 'QA.' },
    changes: [],
    systems: [parana, salado],
    river: {
      systemId: parana.id,
      available: true,
      dataStatus: 'LIVE',
      stationName: parana.stationName,
      currentMetres: parana.currentMetres ?? 0,
      delta1h: parana.delta1h ?? 0,
      delta6h: parana.delta6h ?? 0,
      delta24h: parana.delta24h ?? 0,
      trend: parana.trend,
      observedAt: parana.observedAt ?? generatedAt,
      fetchedAt: parana.fetchedAt ?? generatedAt,
      validUntil: parana.validUntil ?? validUntil,
      sourceId: parana.sourceId,
      sourceName: parana.sourceName,
      points: parana.points,
      forecastPoints: [],
      thresholds: parana.thresholds,
    },
    rain: {
      available: false,
      dataStatus: 'UNAVAILABLE',
      accumulated1hMm: null,
      accumulated24hMm: null,
      forecast: 'No disponible.',
      observedAt: generatedAt,
      fetchedAt: generatedAt,
      validUntil,
      sourceId: 'rain-unavailable',
      points: [],
    },
    sources,
    contradictions: [],
    shelters: [],
    actions: [],
    messages: [],
  };
}

async function mockSnapshot(page: Page, snapshot: Snapshot): Promise<void> {
  await page.route('**/api/snapshot*', (route) => route.fulfill({
    headers: { 'Cache-Control': 'no-store' },
    json: { ok: true, data: snapshot, meta: { schemaVersion: '1.0', generatedAt, mode: 'LIVE', official: false } },
  }));
}

async function openScenario(page: Page, snapshot: Snapshot): Promise<void> {
  await mockSnapshot(page, snapshot);
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-snapshot-id', snapshot.id);
  await expect(page.getByTestId('hydrometric-situation')).toBeVisible();
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

const normal = makeSnapshot({ id: '021d-normal', paranaMetres: 3.2, saladoMetres: 3.4 });
const singleSalado = makeSnapshot({ id: '021d-single-salado', paranaMetres: 3.2, saladoMetres: 4.8 });
const dual = makeSnapshot({ id: '021d-dual', paranaMetres: 5.4, saladoMetres: 4.8 });
const falseEmergency = makeSnapshot({
  id: '021d-unverified-number',
  paranaMetres: 8.2,
  saladoMetres: 3.4,
  paranaSource: {
    kind: 'DEMO_FIXTURE',
    official: false,
    determinesPrimaryState: false,
    classification: 'SUPPLEMENTARY',
  },
});

test.beforeAll(async () => {
  await mkdir(`${evidenceDir}/021-d/screenshots`, { recursive: true });
});

test('NORMAL keeps the established editorial hierarchy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Deterministic 021-D scenario pass.');
  await openScenario(page, normal);
  await expect(page.getByTestId('hydrometric-situation')).toHaveAttribute('data-priority-mode', 'NORMAL');
  await expect(page.getByTestId('river-operational-priority')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Paraná' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,20');
});

test('single-river verified risk temporarily promotes only the affected river and exposes cause/source', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Deterministic 021-D scenario pass.');
  await openScenario(page, singleSalado);
  const priority = page.getByTestId('river-operational-priority');
  await expect(page.getByTestId('hydrometric-situation')).toHaveAttribute('data-priority-mode', 'SINGLE_RIVER_PRIORITY');
  await expect(priority).toContainText('Río Salado · prioridad temporal');
  await expect(priority.locator('[data-river-system="salado-santo-tome"]')).toBeVisible();
  await expect(priority.locator('[data-river-system="parana-santa-fe"]')).toHaveCount(0);
  await expect(priority).toContainText('Condición hídrica verificada');
  await expect(priority).toContainText('Instituto Nacional del Agua');
  await expect(page.getByRole('tab', { name: 'Salado' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Paraná' })).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('4,80');
  const trace = page.getByRole('button', { name: 'Ver trazabilidad de fuentes' });
  await trace.focus();
  await expect(trace).toBeFocused();
  await trace.click();
  await expect(page.getByRole('dialog')).toContainText('INA REST');
});

test('dual verified risk renders Paraná and Salado at equal first-contact weight with all mandatory facts', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Deterministic 021-D scenario pass.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await openScenario(page, dual);
  const priority = page.getByTestId('river-operational-priority');
  await expect(page.getByTestId('hydrometric-situation')).toHaveAttribute('data-priority-mode', 'DUAL_EMERGENCY');
  await expect(priority).toContainText('Paraná + Salado · prioridad equivalente 50/50');
  const parana = priority.locator('[data-river-system="parana-santa-fe"]');
  const salado = priority.locator('[data-river-system="salado-santo-tome"]');
  await expect(parana).toBeVisible();
  await expect(salado).toBeVisible();
  for (const panel of [parana, salado]) {
    await expect(panel).toContainText('Estación');
    await expect(panel).toContainText('Nivel');
    await expect(panel).toContainText('Tendencia');
    await expect(panel).toContainText('Δ24h');
    await expect(panel).toContainText('Vigencia');
    await expect(panel).toContainText('Fuente');
    await expect(panel).toContainText('Estado / alerta relacionada');
    await expect(panel).toContainText('Instituto Nacional del Agua');
  }
  const [paranaBox, saladoBox] = await Promise.all([parana.boundingBox(), salado.boundingBox()]);
  expect(paranaBox).not.toBeNull();
  expect(saladoBox).not.toBeNull();
  expect(Math.abs((paranaBox?.width ?? 0) - (saladoBox?.width ?? 0))).toBeLessThanOrEqual(2);
});

test('an unverified numeric threshold never activates operational hierarchy', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Deterministic 021-D scenario pass.');
  await openScenario(page, falseEmergency);
  await expect(page.getByTestId('hydrometric-situation')).toHaveAttribute('data-priority-mode', 'NORMAL');
  await expect(page.getByTestId('river-operational-priority')).toHaveCount(0);
});

test('dual mode is overflow-safe at 320/360/390/430 and preserves both rivers', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Explicit viewport matrix runs once.');
  const metrics: Array<Record<string, number>> = [];
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await openScenario(page, { ...dual, id: `021d-dual-${width}` });
    const priority = page.getByTestId('river-operational-priority');
    const parana = priority.locator('[data-river-system="parana-santa-fe"]');
    const salado = priority.locator('[data-river-system="salado-santo-tome"]');
    await expect(parana).toBeVisible();
    await expect(salado).toBeVisible();
    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(layout.overflow).toBeLessThanOrEqual(1);
    const [paranaBox, saladoBox] = await Promise.all([parana.boundingBox(), salado.boundingBox()]);
    expect(Math.abs((paranaBox?.width ?? 0) - (saladoBox?.width ?? 0))).toBeLessThanOrEqual(2);
    metrics.push({ width, ...layout });
    await page.unrouteAll({ behavior: 'wait' });
  }
  await writeFile(`${evidenceDir}/021-d/mobile-overflow.json`, `${JSON.stringify(metrics, null, 2)}\n`);
});

test('200% layout-equivalent viewport reflows without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Explicit zoom-equivalent pass runs once.');
  await page.setViewportSize({ width: 720, height: 900 });
  await openScenario(page, dual);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('river-operational-priority').locator('[data-river-system="parana-santa-fe"]')).toBeVisible();
  await expect(page.getByTestId('river-operational-priority').locator('[data-river-system="salado-santo-tome"]')).toBeVisible();
});

test('captures semantically verified 021-D visual evidence with collision-safe hashes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One deterministic evidence capture pass.');
  const manifest: Record<string, { sha256: string; semantic: string; snapshotId: string }> = {};
  const cases = [
    { name: 'dual-desktop', width: 1440, height: 900, snapshot: dual, semantic: 'DUAL_EMERGENCY_50_50' },
    { name: 'dual-mobile-390', width: 390, height: 844, snapshot: { ...dual, id: '021d-dual-mobile-evidence' }, semantic: 'DUAL_EMERGENCY_BOTH_VISIBLE_MOBILE' },
    { name: 'single-salado-mobile-360', width: 360, height: 800, snapshot: { ...singleSalado, id: '021d-single-mobile-evidence' }, semantic: 'SINGLE_RIVER_PRIORITY_SALADO' },
  ] as const;
  for (const item of cases) {
    await page.setViewportSize({ width: item.width, height: item.height });
    await openScenario(page, item.snapshot);
    const hydro = page.getByTestId('hydrometric-situation');
    await expect(hydro).toHaveAttribute('data-priority-mode', item.semantic.startsWith('SINGLE') ? 'SINGLE_RIVER_PRIORITY' : 'DUAL_EMERGENCY');
    const path = `${evidenceDir}/021-d/screenshots/${item.name}.png`;
    await page.screenshot({ path, fullPage: true });
    manifest[item.name] = { sha256: await sha256(path), semantic: item.semantic, snapshotId: item.snapshot.id };
    await page.unrouteAll({ behavior: 'wait' });
  }
  const hashes = Object.values(manifest).map((entry) => entry.sha256);
  expect(new Set(hashes).size).toBe(hashes.length);
  await writeFile(`${evidenceDir}/021-d/visual-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
});
