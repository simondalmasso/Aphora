import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { HydrologicalSystem, Snapshot, Source } from '../../src/domain/snapshot.ts';
import { stableHydrometricSnapshot } from './fixtures/stable-hydrometric.ts';

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/order-023';
const generatedAt = stableHydrometricSnapshot.generatedAt;
const validUntil = '2026-08-13T23:00:00.000Z';
const STORAGE_KEY = 'sos-sf:last-public-safety-snapshot:v4';

function saladoSystem(metres: number): HydrologicalSystem {
  const base = stableHydrometricSnapshot.systems?.[0];
  if (!base) throw new Error('stable fixture missing Paraná system');
  return {
    ...base,
    id: 'salado-santo-tome',
    label: 'Río Salado — Santo Tomé',
    watercourse: 'Río Salado',
    stationName: 'Santo Tomé',
    stationCode: '1679',
    currentMetres: metres,
    sourceId: 'ina-rest-3044',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    thresholds: [
      { id: 'NORMAL', label: 'Referencia inferior', metres: 0 },
      { id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: 4.7 },
    ],
    trend: 'FALLING',
    delta1h: -.01,
    delta6h: -.02,
    delta24h: -.03,
    points: base.points.map((point, index) => ({ ...point, metres: metres - .29 + index * .01 })),
  };
}

function saladoSource(system: HydrologicalSystem): Source {
  const base = stableHydrometricSnapshot.sources[0];
  if (!base) throw new Error('stable fixture missing source');
  return {
    ...base,
    id: system.sourceId,
    name: 'INA REST · Salado Santo Tomé',
    feedId: system.sourceId,
    feedName: 'INA REST · Río Salado, estación Santo Tomé',
    contribution: 'Lectura hidrométrica oficial del Salado para QA 023.',
  };
}

function snapshotWithLevels(paranaMetres: number, saladoMetres: number, id: string): Snapshot {
  const paranaBase = stableHydrometricSnapshot.systems?.[0];
  if (!paranaBase) throw new Error('stable fixture missing Paraná system');
  const parana: HydrologicalSystem = {
    ...paranaBase,
    currentMetres: paranaMetres,
    points: paranaBase.points.map((point, index) => ({ ...point, metres: paranaMetres - .29 + index * .01 })),
  };
  const salado = saladoSystem(saladoMetres);
  const paranaSource = stableHydrometricSnapshot.sources[0]!;
  return {
    ...stableHydrometricSnapshot,
    id,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    systems: [parana, salado],
    sources: [paranaSource, saladoSource(salado)],
    river: {
      ...stableHydrometricSnapshot.river,
      systemId: parana.id,
      stationName: parana.stationName,
      currentMetres: parana.currentMetres ?? 0,
      trend: parana.trend,
      delta24h: parana.delta24h ?? 0,
      sourceId: parana.sourceId,
      points: parana.points,
      thresholds: parana.thresholds,
    },
  };
}

const normal = snapshotWithLevels(3.2, 3.4, '023-normal');
const single = snapshotWithLevels(3.2, 4.8, '023-single-salado');
const dual = snapshotWithLevels(5.4, 4.8, '023-dual');
const publicMessage = {
  id: '023-public-message',
  type: 'OFFICIAL_NOTICE' as const,
  title: 'Información pública de prueba',
  body: 'Mensaje visible para verificar el canal público.',
  sourceId: 'qa-023',
  geographicScope: ['Santa Fe'],
  createdAt: generatedAt,
  expiresAt: validUntil,
  priority: 2 as const,
  status: 'ACTIVE' as const,
  evidenceRefs: [],
  provenance: { producer: 'SOS-SF QA', sourceKind: 'TEST', capturedAt: generatedAt },
};

async function installFixture(page: Page, snapshot: Snapshot = normal) {
  const withMessage: Snapshot = { ...snapshot, messages: [publicMessage] };
  await page.route('**/api/snapshot*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: withMessage, meta: { schemaVersion: '1.0', generatedAt, mode: 'LIVE', official: false } }),
  }));
  await page.route('**/api/sources*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { snapshotId: withMessage.id, systems: withMessage.systems ?? [], sources: withMessage.sources } }),
  }));
  await page.route('**/api/messages*', (route) => route.fulfill({ json: { ok: true, data: { snapshotId: withMessage.id, messages: [publicMessage], deliveryClaims: 'NONE' } } }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: true, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

async function openScenario(page: Page, snapshot: Snapshot = normal) {
  await installFixture(page, snapshot);
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-snapshot-id', snapshot.id);
  await expect(page.getByTestId('hydrometric-situation')).toBeVisible();
}

async function sha256(path: string) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

test.beforeAll(async () => {
  await mkdir(`${evidenceDir}/screenshots`, { recursive: true });
});

test('mobile first viewport answers river, level, movement, recency, source and alert status', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Viewport matrix is executed once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await openScenario(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Así están el Paraná y el Salado' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Paraná/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Salado/ })).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,20');
  await expect(page.getByText('Sube lentamente')).toBeVisible();
  await expect(page.getByText(/Última medición/)).toBeVisible();
  await expect(page.getByTestId('hydro-source-strip')).toContainText('Instituto Nacional del Agua');
  await expect(page.getByRole('button', { name: 'Sin alertas oficiales', exact: true })).toBeVisible();
  await expect(page.getByTestId('main-hydro-chart')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('responsive matrix has no horizontal overflow and keeps core controls usable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Explicit matrix runs once.');
  const cases = [
    [320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080], [195, 422],
  ] as const;
  const rows: Array<Record<string, number | string>> = [];
  for (const [width, height] of cases) {
    await page.setViewportSize({ width, height });
    await openScenario(page, { ...normal, id: `023-normal-${width}x${height}` });
    await expect(page.getByTestId('hydro-current-level')).toBeVisible();
    await expect(page.getByTestId('main-hydro-chart')).toBeVisible();
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(metrics.overflow, `${width}x${height}`).toBeLessThanOrEqual(1);
    rows.push({ width, height, ...metrics });
    await page.unrouteAll({ behavior: 'wait' });
  }
  await writeFile(`${evidenceDir}/responsive-matrix.json`, `${JSON.stringify(rows, null, 2)}\n`);
});

test('mobile dock is one-handed and communications remains reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Explicit mobile viewport runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await openScenario(page);
  const dock = page.locator('.mobile-dock');
  await expect(dock).toBeVisible();
  for (const label of ['Inicio', 'Ríos', 'Riesgo', 'Más']) {
    const control = label === 'Más' ? dock.getByRole('button', { name: 'Más' }) : dock.getByRole('link', { name: label });
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  }
  await dock.getByRole('button', { name: 'Más' }).click();
  const menu = page.locator('#civic-mobile-menu');
  await expect(menu).toBeVisible();
  const communications = menu.getByRole('button', { name: /Comunicaciones/ });
  await communications.scrollIntoViewIfNeeded();
  await expect(communications).toBeInViewport();
  await communications.click();
  const dialog = page.locator('dialog.messages-panel');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Información pública de prueba');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('reports remain reachable without changing public state', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Explicit mobile viewport runs once.');
  await page.setViewportSize({ width: 390, height: 844 });
  await openScenario(page);
  const more = page.locator('.secondary-actions');
  await more.locator('summary').click();
  const report = page.getByRole('button', { name: 'Enviar un reporte' });
  await expect(report).toBeVisible();
  await report.click();
  const dialog = page.locator('dialog.report-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Reportar una situación' })).toBeVisible();
  await expect(dialog).toContainText('no inicia un despacho de emergencia');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('hydrometric-situation')).toHaveAttribute('data-priority-mode', 'NORMAL');
});

test('source detail remains progressive, traceable and keyboard reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One keyboard pass is enough.');
  await openScenario(page);
  const sourceButton = page.getByRole('button', { name: 'Ver fuente y detalle' }).first();
  await sourceButton.focus();
  await expect(sourceButton).toBeFocused();
  await sourceButton.click();
  const dialog = page.locator('dialog.details-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Instituto Nacional del Agua');
  await expect(dialog).toContainText('Mediciones por estación');
  await expect(dialog).toContainText('Metodología de interpretación');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(sourceButton).toBeFocused();
});

test('021-D single priority keeps Salado first without hiding Paraná', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openScenario(page, single);
  const hydro = page.getByTestId('hydrometric-situation');
  await expect(hydro).toHaveAttribute('data-priority-mode', 'SINGLE_RIVER_PRIORITY');
  const priority = page.getByTestId('river-operational-priority');
  await expect(priority.locator('[data-river-system="salado-santo-tome"]')).toBeVisible();
  await expect(priority.locator('[data-river-system="parana-santa-fe"]')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Salado/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Paraná/ })).toBeVisible();
  await expect(page.getByTestId('hydro-current-level')).toContainText('4,80');
});

test('021-D dual risk gives Paraná and Salado equal visual weight', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openScenario(page, dual);
  const hydro = page.getByTestId('hydrometric-situation');
  await expect(hydro).toHaveAttribute('data-priority-mode', 'DUAL_EMERGENCY');
  const priority = page.getByTestId('river-operational-priority');
  await expect(priority).toContainText('prioridad equivalente 50/50');
  const parana = priority.locator('[data-river-system="parana-santa-fe"]');
  const salado = priority.locator('[data-river-system="salado-santo-tome"]');
  await expect(parana).toBeVisible();
  await expect(salado).toBeVisible();
  const [a, b] = await Promise.all([parana.boundingBox(), salado.boundingBox()]);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(Math.abs((a?.width ?? 0) - (b?.width ?? 0))).toBeLessThanOrEqual(2);
});

test('offline keeps the last valid reading but clearly removes currentness claims', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One offline cache pass is enough.');
  const cached = { ...normal, id: '023-offline-cache', messages: [publicMessage] };
  await page.addInitScript(({ key, snapshot, savedAt }) => {
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });
    localStorage.setItem(key, JSON.stringify({ snapshot, savedAt }));
  }, { key: STORAGE_KEY, snapshot: cached, savedAt: generatedAt });
  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-snapshot-id', cached.id);
  await expect(page.getByTestId('hydro-current-level')).toContainText('3,20');
  await expect(page.getByText('Sin conexión', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verificación no disponible', exact: true })).toBeVisible();
  await expect(page.getByText('Sin vigencia confirmada').first()).toBeVisible();
});

test('lite mode remains server-rendered, readable and JavaScript-independent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One lite pass is enough.');
  const response = await page.goto('/lite');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Información pública para emergencias' })).toBeVisible();
  await expect(page.getByText('Esta versión funciona sin JavaScript')).toBeVisible();
  await expect(page.getByRole('link', { name: /911/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('El Niño is an editorial guide, not an alarm surface', async ({ page }) => {
  await installFixture(page);
  await page.goto('/gestion-de-riesgo/fenomeno-el-nino');
  await expect(page.getByRole('heading', { level: 1, name: 'Qué significa El Niño para Santa Fe' })).toBeVisible();
  await expect(page.getByText(/no significa automáticamente inundación ni emergencia/i)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver Paraná y Salado' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('reduced motion preference disables nonessential transitions', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One reduced-motion pass is enough.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openScenario(page);
  const motion = await page.locator('.civic-quick-tile').first().evaluate((node) => ({
    transitionDuration: getComputedStyle(node).transitionDuration,
    animationName: getComputedStyle(node).animationName,
  }));
  expect(motion.transitionDuration).toBe('0s');
  expect(motion.animationName).toBe('none');
});

test('visual evidence is semantic and collision-safe', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One evidence pass is enough.');
  const cases = [
    { name: 'normal-390', width: 390, height: 844, snapshot: normal, semantic: 'NORMAL_WARM_MOBILE' },
    { name: 'normal-1440', width: 1440, height: 900, snapshot: { ...normal, id: '023-normal-desktop' }, semantic: 'NORMAL_WARM_DESKTOP' },
    { name: 'single-390', width: 390, height: 844, snapshot: single, semantic: 'SINGLE_SALADO_PRIORITY' },
    { name: 'dual-1440', width: 1440, height: 900, snapshot: dual, semantic: 'DUAL_50_50' },
  ] as const;
  const manifest: Record<string, { sha256: string; snapshotId: string; semantic: string; overflow: number }> = {};
  for (const item of cases) {
    await page.setViewportSize({ width: item.width, height: item.height });
    await openScenario(page, item.snapshot);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow, item.name).toBeLessThanOrEqual(1);
    const path = `${evidenceDir}/screenshots/${item.name}.png`;
    await page.screenshot({ path, fullPage: true });
    manifest[item.name] = { sha256: await sha256(path), snapshotId: item.snapshot.id, semantic: item.semantic, overflow };
    await page.unrouteAll({ behavior: 'wait' });
  }
  const hashes = Object.values(manifest).map((value) => value.sha256);
  expect(new Set(hashes).size).toBe(hashes.length);
  await writeFile(`${evidenceDir}/visual-manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
});
