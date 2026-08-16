import { expect, test, type Page } from '@playwright/test';
import type { HydrologicalSystem, Snapshot, Source } from '../../src/domain/snapshot.ts';
import { stableHydrometricSnapshot } from './fixtures/stable-hydrometric.ts';

const generatedAt = stableHydrometricSnapshot.generatedAt;
const validUntil = new Date(Date.parse(generatedAt) + 24 * 60 * 60_000).toISOString();

function points(endAt: string, current: number, step: number) {
  return Array.from({ length: 190 }, (_, index) => ({
    at: new Date(Date.parse(endAt) - (189 - index) * 60 * 60_000).toISOString(),
    metres: current - (189 - index) * step,
    measured: true,
    quality: 'PUBLISHED_OPERATIONAL' as const,
  }));
}

function parana(): HydrologicalSystem {
  const series = points(generatedAt, 3.2, .002);
  return {
    id: 'parana-santa-fe',
    label: 'Río Paraná — Santa Fe',
    watercourse: 'Río Paraná',
    stationName: 'Santa Fe',
    stationCode: '30',
    available: true,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    currentMetres: 3.2,
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    validUntil,
    sourceId: 'ina-rest-30',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: series,
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

function salado(): HydrologicalSystem {
  const series = points(generatedAt, 3.42, .001);
  return {
    id: 'salado-santo-tome',
    label: 'Río Salado — Santo Tomé',
    watercourse: 'Río Salado',
    stationName: 'Santo Tomé',
    stationCode: '1679',
    available: true,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    currentMetres: 3.42,
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    validUntil,
    sourceId: 'ina-rest-3044',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: series,
    thresholds: [{ id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: 4.7 }],
    trend: 'RISING_SLOWLY',
    delta1h: .001,
    delta6h: .006,
    delta24h: .024,
  };
}

function hydrometricSource(system: HydrologicalSystem): Source {
  return {
    id: system.sourceId,
    name: `INA REST · ${system.watercourse}`,
    kind: 'OFFICIAL_OBSERVATION',
    status: 'FRESH',
    observedAt: generatedAt,
    fetchedAt: generatedAt,
    lastCheckedAt: generatedAt,
    validUntil,
    contribution: `Serie oficial de ${system.stationName}.`,
    official: true,
    connected: true,
    organizationId: 'ina',
    organizationName: 'Instituto Nacional del Agua',
    feedId: system.sourceId,
    feedName: `INA REST · ${system.watercourse}`,
    classification: 'OPERATIONAL_FRESH',
    freshness: 'ACTUALIZADO',
    determinesPrimaryState: true,
    url: 'https://alerta.ina.gob.ar/',
  };
}

function nasaSource(connected = true): Source {
  return {
    id: 'nasa-gpm-imerg-early',
    name: 'NASA GPM IMERG Early',
    kind: 'SATELLITE_OBSERVATION',
    status: connected ? 'FRESH' : 'UNAVAILABLE',
    observedAt: new Date(Date.parse(generatedAt) - 30 * 60_000).toISOString(),
    fetchedAt: generatedAt,
    lastCheckedAt: generatedAt,
    validUntil,
    contribution: connected ? 'Muestra satelital válida en Santa Fe: 0.42 mm/h.' : 'Sin muestra local numérica válida.',
    official: false,
    connected,
    organizationId: 'nasa',
    organizationName: 'NASA',
    feedId: 'nasa-gpm-imerg-early',
    feedName: 'GPM IMERG Early',
    classification: 'SUPPLEMENTARY',
    freshness: connected ? 'ACTUALIZADO' : 'NO_DISPONIBLE',
    determinesPrimaryState: false,
    resolution: '0,1° / 30 minutos',
    uncertainty: 'Estimación satelital suplementaria.',
    limitations: 'No reemplaza pluviómetros ni determina el estado hidrométrico.',
    ...(connected ? { instantRateMmPerHour: .42 } : {}),
    url: 'https://gpm.nasa.gov/data/imerg',
  };
}

function snapshot(connectedRain = true): Snapshot {
  const p = parana();
  const s = salado();
  return {
    ...stableHydrometricSnapshot,
    id: connectedRain ? '027-smooth-product' : '027-rain-unavailable',
    generatedAt,
    validUntil,
    systems: [p, s],
    sources: [hydrometricSource(p), hydrometricSource(s), nasaSource(connectedRain)],
    river: {
      ...stableHydrometricSnapshot.river,
      systemId: p.id,
      stationName: p.stationName,
      currentMetres: p.currentMetres ?? 0,
      delta1h: p.delta1h ?? 0,
      delta6h: p.delta6h ?? 0,
      delta24h: p.delta24h ?? 0,
      trend: p.trend,
      observedAt: p.observedAt ?? generatedAt,
      fetchedAt: p.fetchedAt ?? generatedAt,
      validUntil,
      sourceId: p.sourceId,
      sourceName: p.sourceName,
      points: p.points,
      thresholds: p.thresholds,
    },
  };
}

async function install(page: Page, data: Snapshot) {
  await page.route('**/api/snapshot*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data, meta: { schemaVersion: '1.0', generatedAt: data.generatedAt, mode: data.mode, official: false } }),
  }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: true, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

async function open(page: Page, data = snapshot()) {
  await install(page, data);
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-snapshot-id', data.id);
}

test('027 mobile first viewport is a visual river product with interactive chart and honest rain context', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '027 explicit mobile viewport runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  await expect(page.getByRole('heading', { level: 1, name: 'Situación hidrométrica' })).toBeVisible();
  await expect(page.getByText('Nivel, tendencia y contexto.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,20');
  await expect(page.getByRole('tab', { name: 'Paraná' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Salado' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Salado' })).not.toContainText(/\d[,.]\d+\s*m/);

  const chart = page.getByTestId('main-hydro-chart');
  await expect(chart).toHaveAttribute('data-interactive', 'true');
  await expect(chart.locator('.hydro-chart__area')).toHaveCount(1);
  await expect(chart.locator('.hydro-chart__current-dot')).toBeVisible();
  const box = await chart.boundingBox();
  expect(box?.y ?? 9999).toBeLessThan(844);

  await chart.locator('svg').focus();
  await chart.locator('svg').press('End');
  await expect(chart.locator('.hydro-chart__readout')).toContainText('3,20');
  await page.getByRole('button', { name: '72 h' }).click();
  await expect(chart).toHaveAttribute('data-window-hours', '72');

  const rain = page.getByTestId('rain-context');
  await expect(rain).toBeVisible();
  await expect(rain).toContainText('0,42 mm/h');
  await expect(rain).toContainText('Estimación satelital instantánea · NASA IMERG Early');
  await expect(rain).toContainText('Observación ·');
  await expect(rain).toContainText('Consulta ·');

  const source = page.getByTestId('hydro-source-strip');
  await expect(source).toContainText('Medición ·');
  await expect(source).toContainText('Consulta de la fuente ·');

  const hydroText = (await page.getByTestId('hydrometric-situation').innerText()).toLowerCase();
  expect(hydroText).not.toMatch(/\bseguro\b|\btranquilo\b|\bsin riesgo\b|\brango normal\b/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('027 river switch changes station-specific visualization without raw cross-station metre comparison', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '027 interaction runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole('tab', { name: 'Salado' }).click();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,42');
  await expect(page.getByTestId('hydro-meaning')).toContainText('1,28 m por debajo del nivel de alerta de referencia');
  await expect(page.getByTestId('hydro-context-scale')).toContainText('4,70 m');
  await expect(page.getByTestId('hydro-context-scale')).not.toContainText('0,00 m');
  await expect(page.getByTestId('main-hydro-chart').locator('title')).toContainText('Río Salado');
});

test('027 rain unavailable state stays explicit and does not invent accumulation or forecast', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '027 rain state runs once.');
  await open(page, snapshot(false));
  const rain = page.getByTestId('rain-context');
  await expect(rain).toContainText('Sin estimación reciente');
  await expect(rain).toContainText('sin muestra local utilizable');
  await expect(rain).not.toContainText(/acumulado|pronóstico|va a llover|subirá el río/i);
});

test('027 responsive matrix preserves native-feeling touch targets and zero horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '027 matrix runs once.');
  const cases = [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [1440, 900]] as const;
  for (const [width, height] of cases) {
    await page.setViewportSize({ width, height });
    await open(page, { ...snapshot(), id: `027-${width}x${height}` });
    await expect(page.getByTestId('main-hydro-chart')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}x${height}`).toBeLessThanOrEqual(1);
    if (width <= 430) {
      for (const locator of [
        page.getByRole('button', { name: 'Actualizar información' }),
        page.getByRole('button', { name: '24 h' }),
        page.getByRole('button', { name: '72 h' }),
        page.getByRole('tab', { name: 'Paraná' }),
      ]) {
        const target = await locator.boundingBox();
        expect(target?.height ?? 0, `${width} touch target`).toBeGreaterThanOrEqual(44);
      }
    }
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('027 reduced motion disables product chart arrival animations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '027 reduced motion runs once.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const [seriesAnimation, markerAnimation] = await Promise.all([
    page.locator('.hydro-chart__series-motion').evaluate((node) => getComputedStyle(node).animationName),
    page.locator('.hydro-chart__current-halo').evaluate((node) => getComputedStyle(node).animationName),
  ]);
  expect(seriesAnimation).toBe('none');
  expect(markerAnimation).toBe('none');
});
