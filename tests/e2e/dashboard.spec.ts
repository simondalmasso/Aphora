import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Snapshot } from '../../src/domain/snapshot';

const generatedAt = '2026-08-03T18:00:00.000Z';
const points = (base: number) => Array.from({ length: 13 }, (_, index) => ({ at: new Date(Date.parse(generatedAt) - (12 - index) * 2 * 3_600_000).toISOString(), metres: base + index * .01, measured: true }));
const systems = [
  { id: 'parana-santa-fe', label: 'Sistema Paraná', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30', available: true, dataStatus: 'LIVE' as const, currentMetres: 3.22, observedAt: generatedAt, sourceId: 'ina:30', sourceName: 'INA · Sistema de Información Hidrológica', points: points(3.1), thresholds: [{ id: 'NORMAL' as const, label: 'Referencia baja', metres: 2 }, { id: 'ALERTA' as const, label: 'Alerta', metres: 5.3 }, { id: 'EVACUACION' as const, label: 'Evacuación', metres: 5.7 }], trend: 'RISING_SLOWLY' as const, delta1h: .01, delta6h: .03, delta24h: .12 },
  { id: 'salado-santo-tome', label: 'Sistema Salado', watercourse: 'Río Salado', stationName: 'Santo Tomé', stationCode: '1679', available: true, dataStatus: 'LIVE' as const, currentMetres: 4.8, observedAt: generatedAt, sourceId: 'ina:3044', sourceName: 'INA · Sistema de Información Hidrológica', points: points(4.68), thresholds: [{ id: 'NORMAL' as const, label: 'Referencia baja', metres: 0 }, { id: 'ALERTA' as const, label: 'Alerta', metres: 4.7 }], trend: 'RISING' as const, delta1h: .02, delta6h: .06, delta24h: .12 },
] as const;
const liveSnapshot: Snapshot = {
  schemaVersion: '1.0', id: 'live-e2e', mode: 'LIVE', dataStatus: 'LIVE', generatedAt, previousSnapshotAt: '2026-08-03T17:45:00.000Z', state: 'ALERTA', stateLabel: 'Umbral de alerta alcanzado', summary: 'Dos estaciones oficiales se presentan en escalas separadas.', dominantSourceId: 'ina:3044', validUntil: '2026-08-03T18:15:00.000Z', recommendedAction: 'Seguí instrucciones oficiales y evitá zonas ribereñas o anegadas.', emergencyDisclaimer: 'SOS Santa Fe agrega fuentes públicas y no reemplaza a los servicios de emergencia.', changes: [{ id: 'change', label: 'Río Paraná · Santa Fe', direction: 'UP', detail: '+12 cm en 24 horas' }], systems, river: { systemId: 'parana-santa-fe', available: true, dataStatus: 'LIVE', stationName: 'Santa Fe', currentMetres: 3.22, delta1h: .01, delta6h: .03, delta24h: .12, trend: 'RISING_SLOWLY', observedAt: generatedAt, sourceId: 'ina:30', sourceName: systems[0].sourceName, points: systems[0].points, forecastPoints: [], thresholds: systems[0].thresholds }, rain: { available: false, dataStatus: 'UNAVAILABLE', accumulated1hMm: 0, accumulated24hMm: 0, forecast: 'Sin estimación local validada.', observedAt: generatedAt, sourceId: 'nasa-gpm-imerg-early', points: [] }, sources: systems.map((system) => ({ id: system.sourceId, name: system.sourceName, kind: 'OFFICIAL_OBSERVATION' as const, status: 'FRESH' as const, observedAt: generatedAt, validUntil: '2026-08-04T06:00:00.000Z', contribution: `${system.watercourse}, estación ${system.stationName}`, official: true })), contradictions: [], shelters: [], actions: ['Consultá alertas y recomendaciones oficiales.', 'Tené disponibles los teléfonos esenciales.'], messages: [],
};

async function mockPublicApi(page: Page, snapshot: Snapshot = liveSnapshot) {
  await page.route('**/api/snapshot', (route) => route.fulfill({ json: { ok: true, data: snapshot, meta: { schemaVersion: '1.0', generatedAt, mode: snapshot.mode, official: false } } }));
  await page.route('**/api/sources', (route) => route.fulfill({ json: { ok: true, data: { snapshotId: snapshot.id, systems: snapshot.systems ?? [], sources: snapshot.sources, contradictions: [] } } }));
  await page.route('**/api/messages', (route) => route.fulfill({ json: { ok: true, data: { snapshotId: snapshot.id, messages: [], deliveryClaims: 'NONE' } } }));
  await page.route('**/api/auth/config', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: false, googleClientId: null } } }));
  await page.route('**/api/session', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

test.beforeAll(async () => { await mkdir('artifacts/v1/screenshots', { recursive: true }); });

test('first viewport exposes live state and separate Paraná/Salado systems without demo claims', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const hero = page.getByTestId('hydro-hero');
  await expect(page.getByRole('heading', { name: 'Estado hídrico de Santa Fe' })).toBeVisible();
  await expect(hero.getByText('Datos en vivo', { exact: true })).toBeVisible();
  await expect(hero.getByRole('tab', { name: /Sistema Paraná/ })).toBeVisible();
  await expect(hero.getByRole('tab', { name: /Sistema Salado/ })).toBeVisible();
  await expect(hero.getByText('3.22', { exact: false })).toBeVisible();
  await expect(hero.getByText('+12 cm', { exact: true })).toBeVisible();
  await expect(hero.getByText('Subiendo lentamente', { exact: true })).toBeVisible();
  await expect(hero.getByText('Seguí instrucciones oficiales', { exact: false })).toBeVisible();
  await expect(page.getByText('DEMO / NO OFICIAL', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compartir' })).toHaveCount(0);
  const box = await hero.boundingBox();
  expect(box?.y).toBeLessThan(80);
});

test('three formal modules follow the hero and no unrelated station levels share one gauge', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  await expect(page.locator('[data-primary-section="true"]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Estado actual' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recomendaciones operativas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evolución prevista' })).toBeVisible();
  const gauges = page.getByRole('img', { name: /Sin umbral|alerta|Sin datos/i });
  await expect(gauges).toHaveCount(2);
  await expect(page.getByText('Río Paraná · Santa Fe', { exact: true })).toBeVisible();
  await expect(page.getByText('Río Salado · Santo Tomé', { exact: true })).toBeVisible();
});

test('main graph supports pointer and keyboard reading', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const chart = page.getByTestId('main-hydro-chart');
  const svg = chart.locator('svg');
  await svg.focus();
  await page.keyboard.press('Home');
  await expect(chart.locator('.hydro-chart__readout')).toContainText('observación INA');
  const first = await chart.locator('.hydro-chart__readout').textContent();
  await page.keyboard.press('ArrowRight');
  await expect(chart.locator('.hydro-chart__readout')).not.toHaveText(first ?? '');
  const box = await svg.boundingBox();
  if (box) await page.mouse.move(box.x + box.width * .8, box.y + box.height * .5);
  await expect(chart.locator('.hydro-chart__crosshair')).toBeVisible();
  await expect(chart.getByText('Sin proyección validada', { exact: true })).toBeVisible();
});

test('unavailable data renders safe empty charts and gauges', async ({ page }) => {
  const unavailable: Snapshot = { ...liveSnapshot, id: 'unavailable-e2e', mode: 'UNAVAILABLE', dataStatus: 'UNAVAILABLE', state: 'UNKNOWN', stateLabel: 'Sin datos en vivo', systems: liveSnapshot.systems?.map((system) => ({ ...system, available: false, dataStatus: 'UNAVAILABLE', currentMetres: null, observedAt: null, points: [], thresholds: [] })), river: { ...liveSnapshot.river, available: false, dataStatus: 'UNAVAILABLE', currentMetres: 0, points: [], thresholds: [] }, summary: 'No hay una lectura hídrica validada disponible.' };
  await mockPublicApi(page, unavailable);
  await page.goto('/');
  await expect(page.getByText('Sin datos en vivo', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.sparkline--empty')).toHaveCount(2);
  await expect(page.locator('.level-gauge--empty')).toHaveCount(2);
  await expect(page.locator('path[d=""]')).toHaveCount(0);
});

test('evidence returns focus to the exact mobile dock opener', async ({ page }) => {
  await mockPublicApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const dock = page.locator('.mobile-action-dock');
  const opener = dock.getByRole('button', { name: 'Evidencia' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Evidencia y vigencia' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('INA · Sistema de Información Hidrológica').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Informar does not request location on load and exposes manual, consented and essential-contact paths', async ({ page }) => {
  await mockPublicApi(page);
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => { calls += 1; error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError); } } });
    Object.defineProperty(window, '__geoCalls', { get: () => calls });
  });
  await page.goto('/');
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
  await page.getByRole('button', { name: 'Informar', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Informar una situación' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: /911/ })).toHaveAttribute('href', 'tel:911');
  await expect(dialog.getByRole('link', { name: /0800-777-5000/ })).toHaveAttribute('href', 'tel:08007775000');
  await dialog.getByRole('button', { name: 'Usar mi ubicación' }).click();
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);
  await expect(dialog.getByText('Permiso denegado', { exact: false })).toBeVisible();
  await expect(dialog.getByLabel('Barrio, calle o referencia')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('messages remain closed by default and private features fail closed without protected config', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Abrir mensajes' });
  await expect(page.getByRole('dialog', { name: 'Comunicaciones y reportes' })).toBeHidden();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Comunicaciones y reportes' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Funciones privadas no activadas.', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('required widths have no horizontal overflow and produce screenshots', async ({ page }) => {
  const sizes = [{ width: 360, height: 800, name: '360' }, { width: 390, height: 844, name: '390' }, { width: 768, height: 1024, name: '768' }, { width: 1024, height: 900, name: '1024' }, { width: 1440, height: 1000, name: '1440' }];
  for (const size of sizes) {
    await mockPublicApi(page);
    await page.setViewportSize(size);
    await page.goto('/');
    const widths = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(widths.scrollWidth, `${size.width}px overflow`).toBeLessThanOrEqual(widths.clientWidth);
    await page.screenshot({ path: `artifacts/v1/screenshots/dashboard-${size.name}.png`, fullPage: true });
  }
});

test('reduced motion remains complete and stable', async ({ page }) => {
  await mockPublicApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const duration = await page.locator('.ui-button').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(duration).toBeLessThan(.02);
});

test('page makes no provider or external font requests from the browser', async ({ page }) => {
  const thirdParty: string[] = [];
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) thirdParty.push(url.href);
    if (request.resourceType() === 'font') fontRequests.push(url.href);
  });
  await mockPublicApi(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(thirdParty).toEqual([]);
  expect(fontRequests).toEqual([]);
});

test('lite stays textual, script-free and contains essential contacts', async ({ page }) => {
  await page.goto('/lite');
  await expect(page.getByRole('heading', { name: 'Estado hídrico de Santa Fe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Teléfonos esenciales' })).toBeVisible();
  await expect(page.getByRole('link', { name: /103/ })).toHaveAttribute('href', 'tel:103');
  await expect(page.locator('script, textarea, form, canvas')).toHaveCount(0);
});

test('PWA opens the cached dashboard offline and labels prior data as not current', async ({ page, context }) => {
  await mockPublicApi(page);
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Modo sin conexión', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No es información actual.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Informar', exact: true }).last().click();
  const dialog = page.getByRole('dialog', { name: 'Informar una situación' });
  await dialog.getByLabel('Descripción').fill('Agua acumulada en una esquina.');
  await dialog.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(dialog.getByText('Borrador guardado', { exact: false })).toBeVisible();
  await context.setOffline(false);
});
