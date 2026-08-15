import { expect, test, type Page } from '@playwright/test';
import type { HydrologicalSystem, Snapshot, Source } from '../../src/domain/snapshot.ts';
import { stableHydrometricSnapshot } from './fixtures/stable-hydrometric.ts';

const generatedMs = Date.parse(stableHydrometricSnapshot.generatedAt);
const staleObservedAt = new Date(generatedMs - 42 * 60 * 60_000).toISOString();
const recentFetchAt = new Date(generatedMs - 30_000).toISOString();
const staleValidUntil = new Date(generatedMs - 30 * 60 * 60_000).toISOString();

function staleSnapshot(): Snapshot {
  const baseSystem = stableHydrometricSnapshot.systems?.[0];
  const baseSource = stableHydrometricSnapshot.sources[0];
  if (!baseSystem || !baseSource) throw new Error('Stable hydrometric fixture is incomplete');
  const system: HydrologicalSystem = {
    ...baseSystem,
    freshness: 'DESACTUALIZADO',
    observedAt: staleObservedAt,
    fetchedAt: recentFetchAt,
    validUntil: staleValidUntil,
  };
  const source: Source = {
    ...baseSource,
    status: 'STALE',
    classification: 'OPERATIONAL_STALE',
    freshness: 'DESACTUALIZADO',
    observedAt: staleObservedAt,
    fetchedAt: recentFetchAt,
    lastCheckedAt: recentFetchAt,
    validUntil: staleValidUntil,
  };
  return {
    ...stableHydrometricSnapshot,
    id: '024-stale-measurement-recent-source-check',
    systems: [system, ...(stableHydrometricSnapshot.systems ?? []).slice(1)],
    sources: [source, ...stableHydrometricSnapshot.sources.slice(1)],
    river: {
      ...stableHydrometricSnapshot.river,
      observedAt: staleObservedAt,
      fetchedAt: recentFetchAt,
      validUntil: staleValidUntil,
    },
  };
}

async function installFixture(page: Page, snapshot: Snapshot = stableHydrometricSnapshot) {
  await page.route('**/api/snapshot*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: snapshot, meta: { schemaVersion: '1.0', generatedAt: snapshot.generatedAt, mode: 'LIVE', official: false } }),
  }));
  await page.route('**/api/sources*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { snapshotId: snapshot.id, systems: snapshot.systems ?? [], sources: snapshot.sources } }),
  }));
  await page.route('**/api/messages*', (route) => route.fulfill({ json: { ok: true, data: { snapshotId: snapshot.id, messages: [], deliveryClaims: 'NONE' } } }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: true, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

async function open(page: Page, snapshot: Snapshot = stableHydrometricSnapshot) {
  await installFixture(page, snapshot);
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-snapshot-id', snapshot.id);
  await expect(page.getByTestId('hydrometric-situation')).toBeVisible();
}

test('024 first viewport is civic, calm and measurement-dominant', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Explicit viewport check runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByText('Santa Fe · monitoreo hídrico', { exact: true })).toBeVisible();
  const h1 = page.getByRole('heading', { level: 1, name: 'Situación hidrométrica' });
  await expect(h1).toBeVisible();
  await expect(page.getByText('Niveles, tendencia y vigencia de las últimas mediciones disponibles.', { exact: true })).toBeVisible();
  await expect(page.getByText('Santa Fe, hoy', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Así están el Paraná y el Salado', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Último nivel disponible', { exact: true })).toBeVisible();
  const level = page.getByTestId('hydro-current-level');
  const [h1Px, levelPx] = await Promise.all([
    h1.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
    level.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize)),
  ]);
  expect(levelPx).toBeGreaterThan(h1Px * 1.6);
  const levelBox = await level.boundingBox();
  expect(levelBox).not.toBeNull();
  expect(levelBox?.y ?? 9999).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('024 distinguishes measurement age from source consultation age', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Temporal semantics check runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, staleSnapshot());
  const station = page.locator('.station-identification');
  await expect(station).toContainText('Última medición · hace 42 horas');
  const source = page.getByTestId('hydro-source-strip');
  await expect(source).toContainText('Fuente · Instituto Nacional del Agua');
  await expect(source).toContainText('Medición · hace 42 horas');
  await expect(source).toContainText('Consulta de la fuente · hace menos de un minuto');
  await expect(source).not.toContainText('Recibidos');
});

test('024 required responsive matrix has zero overflow and preserves touch targets', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Explicit matrix runs once.');
  const cases = [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [1440, 900]] as const;
  for (const [width, height] of cases) {
    await page.setViewportSize({ width, height });
    await open(page, { ...stableHydrometricSnapshot, id: `024-${width}x${height}` });
    await expect(page.getByRole('heading', { level: 1, name: 'Situación hidrométrica' })).toBeVisible();
    await expect(page.getByTestId('hydro-current-level')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}x${height}`).toBeLessThanOrEqual(1);
    if (width <= 430) {
      const refreshBox = await page.getByRole('button', { name: 'Actualizar información' }).boundingBox();
      const sourceBox = await page.getByRole('button', { name: 'Ver fuente y detalle' }).first().boundingBox();
      expect(refreshBox?.height ?? 0, `${width} refresh`).toBeGreaterThanOrEqual(44);
      expect(sourceBox?.height ?? 0, `${width} source`).toBeGreaterThanOrEqual(44);
    }
    await page.unrouteAll({ behavior: 'wait' });
  }
});
