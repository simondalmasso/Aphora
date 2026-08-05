import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Snapshot, Source } from '../../src/domain/snapshot';

const evidenceDir = process.env.EVIDENCE_DIR ?? 'artifacts/current-run';
const generatedAt = '2026-08-05T10:00:00.000Z';
const storageKey = 'sos-sf:last-public-safety-snapshot:v4';
const points = (base: number, endAt = generatedAt) => Array.from({ length: 24 }, (_, index) => ({
  at: new Date(Date.parse(endAt) - ((23 - index) + (index < 12 ? 8 : 0)) * 60 * 60_000).toISOString(),
  metres: base + index * .01,
  measured: true,
  quality: 'PUBLISHED_OPERATIONAL' as const,
}));

const systems = [
  {
    id: 'parana-santa-fe', label: 'Río Paraná — Santa Fe', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30', available: true, dataStatus: 'LIVE' as const, freshness: 'ACTUALIZADO' as const, currentMetres: 3.22, observedAt: generatedAt, fetchedAt: generatedAt, validUntil: '2026-08-06T10:00:00.000Z', sourceId: 'ina-rest-30', sourceName: 'Instituto Nacional del Agua · INA REST', points: points(2.99), thresholds: [{ id: 'NORMAL' as const, label: 'Referencia inferior', metres: 2 }, { id: 'ALERTA' as const, label: 'Nivel de alerta de referencia', metres: 5.3 }, { id: 'EVACUACION' as const, label: 'Nivel de evacuación de referencia', metres: 5.7 }], trend: 'RISING_SLOWLY' as const, delta1h: .01, delta6h: .06, delta24h: .23,
  },
  {
    id: 'salado-santo-tome', label: 'Río Salado — Santo Tomé', watercourse: 'Río Salado', stationName: 'Santo Tomé', stationCode: '1679', available: true, dataStatus: 'STALE' as const, freshness: 'ACTUALIZACION_DEMORADA' as const, currentMetres: 4.8, observedAt: '2026-08-05T00:00:00.000Z', fetchedAt: '2026-08-05T09:55:00.000Z', validUntil: '2026-08-06T00:00:00.000Z', sourceId: 'ina-rest-3044', sourceName: 'Instituto Nacional del Agua · INA REST', points: points(4.57, '2026-08-05T00:00:00.000Z'), thresholds: [{ id: 'NORMAL' as const, label: 'Referencia inferior', metres: 0 }, { id: 'ALERTA' as const, label: 'Nivel de alerta de referencia', metres: 4.7 }], trend: 'RISING' as const, delta1h: .01, delta6h: .06, delta24h: .23,
  },
] as const;

type SourceInput = Partial<Source> & { id: string; name: string; organizationId: string; organizationName: string; feedName: string; classification: NonNullable<Source['classification']> };

function source(input: SourceInput): Source {
  return {
    kind: 'OFFICIAL_OBSERVATION', status: input.classification === 'OPERATIONAL_FRESH' ? 'FRESH' : input.classification === 'OPERATIONAL_STALE' ? 'STALE' : 'UNAVAILABLE', observedAt: generatedAt, fetchedAt: generatedAt, lastCheckedAt: generatedAt, validUntil: '2026-08-06T10:00:00.000Z', contribution: 'Fuente pública inventariada.', official: true, connected: ['OPERATIONAL_FRESH','OPERATIONAL_STALE','SUPPLEMENTARY'].includes(input.classification), feedId: input.id, freshness: input.classification === 'OPERATIONAL_FRESH' ? 'ACTUALIZADO' : input.classification === 'OPERATIONAL_STALE' ? 'ACTUALIZACION_DEMORADA' : 'NO_DISPONIBLE', determinesPrimaryState: false, url: 'https://example.test/official', ...input,
  };
}

const sources: Source[] = [
  source({ id: 'ina-rest-30', name: 'INA REST Paraná', organizationId: 'ina', organizationName: 'Instituto Nacional del Agua', feedName: 'INA REST · Río Paraná, Santa Fe', classification: 'OPERATIONAL_FRESH', determinesPrimaryState: true }),
  source({ id: 'ina-rest-3044', name: 'INA REST Salado', organizationId: 'ina', organizationName: 'Instituto Nacional del Agua', feedName: 'INA REST · Río Salado, Santo Tomé', classification: 'OPERATIONAL_STALE', determinesPrimaryState: true }),
  source({ id: 'ina-waterml-parana', name: 'INA WaterML Paraná', organizationId: 'ina', organizationName: 'Instituto Nacional del Agua', feedName: 'INA WaterML · Paraná', classification: 'OPERATIONAL_FRESH' }),
  source({ id: 'ina-waterml-salado', name: 'INA WaterML Salado', organizationId: 'ina', organizationName: 'Instituto Nacional del Agua', feedName: 'INA WaterML · Salado', classification: 'OPERATIONAL_STALE' }),
  source({ id: 'smn-alerts', name: 'Alertas SMN CAP', organizationId: 'smn', organizationName: 'Servicio Meteorológico Nacional', feedName: 'Alertas oficiales SMN · CAP', classification: 'OPERATIONAL_FRESH', kind: 'OFFICIAL_ALERT', determinesPrimaryState: true }),
  source({ id: 'smn-observations', name: 'Observaciones SMN', organizationId: 'smn', organizationName: 'Servicio Meteorológico Nacional', feedName: 'Observaciones meteorológicas', classification: 'BLOCKED_CREDENTIAL', connected: false, observedAt: '1970-01-01T00:00:00.000Z', validUntil: '1970-01-01T00:00:00.000Z' }),
  source({ id: 'nasa-gpm-imerg-early', name: 'NASA GPM', organizationId: 'nasa', organizationName: 'NASA', feedName: 'GPM IMERG Early', classification: 'SUPPLEMENTARY', kind: 'SATELLITE_OBSERVATION' }),
  source({ id: 'ports-hydrometers', name: 'Puertos', organizationId: 'ports', organizationName: 'Agencia Nacional de Puertos y Navegación', feedName: 'Hidrómetros portuarios', classification: 'BLOCKED_NO_MACHINE_ENDPOINT', connected: false, observedAt: '1970-01-01T00:00:00.000Z', validUntil: '1970-01-01T00:00:00.000Z' }),
  source({ id: 'province-early-warning-page', name: 'Protección Civil', organizationId: 'province', organizationName: 'Gobierno de la Provincia de Santa Fe · Protección Civil', feedName: 'Canal humano provincial', classification: 'BLOCKED_NO_MACHINE_ENDPOINT', kind: 'OFFICIAL_ALERT', connected: false, observedAt: '1970-01-01T00:00:00.000Z', validUntil: '1970-01-01T00:00:00.000Z' }),
  source({ id: 'cobem-public-page', name: 'COBEM', organizationId: 'city', organizationName: 'Municipalidad de Santa Fe · COBEM', feedName: 'Canal humano municipal', classification: 'BLOCKED_NO_MACHINE_ENDPOINT', kind: 'OFFICIAL_ALERT', connected: false, observedAt: '1970-01-01T00:00:00.000Z', validUntil: '1970-01-01T00:00:00.000Z' }),
];

const activeAlert = {
  identifier: 'smn-test-1', sender: 'Servicio Meteorológico Nacional', sent: '2026-08-05T09:30:00.000Z', status: 'Actual', messageType: 'Alert', scope: 'Public', category: 'Met', event: 'Tormentas fuertes', urgency: 'Immediate', severity: 'Severe', certainty: 'Likely', effective: '2026-08-05T09:30:00.000Z', onset: '2026-08-05T10:00:00.000Z', expires: '2026-08-05T16:00:00.000Z', headline: 'Alerta por tormentas fuertes', description: 'Se esperan tormentas fuertes.', instruction: 'Permanecé en un lugar seguro y evitá circular.', area: 'Departamento La Capital, Santa Fe', sourceUrl: 'https://example.test/alert', lifecycle: 'ACTIVE' as const, appliesToSantaFe: true,
};

const liveSnapshot: Snapshot = {
  schemaVersion: '1.0', id: 'public-safety-e2e', mode: 'LIVE', dataStatus: 'STALE', freshness: 'ACTUALIZACION_DEMORADA', generatedAt, previousSnapshotAt: '2026-08-05T09:45:00.000Z', state: 'ALERTA', stateLabel: 'Nivel por encima del umbral de alerta de referencia', summary: 'Río Paraná — Santa Fe: 3,22 m. Río Salado — Santo Tomé conserva una medición con actualización demorada.', dominantSourceId: 'ina-rest-30', validUntil: '2026-08-05T10:15:00.000Z', recommendedAction: activeAlert.instruction, emergencyDisclaimer: 'SOS Santa Fe es un servicio independiente y no reemplaza a los organismos competentes.', alertStatus: 'ALERTA_OFICIAL_ACTIVA', alerts: [activeAlert], timeline: [{ id: 'a', at: activeAlert.sent, type: 'ALERT_ISSUED', title: activeAlert.headline, detail: activeAlert.area, sourceId: 'smn-alerts', official: true }, { id: 'm', at: generatedAt, type: 'MEASUREMENT', title: 'Nueva medición: Río Paraná — Santa Fe', detail: '3,22 m', sourceId: 'ina-rest-30', official: true }], sourceOrganizations: [{ id: 'ina', name: 'Instituto Nacional del Agua', official: true, url: 'https://example.test/ina' }, { id: 'smn', name: 'Servicio Meteorológico Nacional', official: true, url: 'https://example.test/smn' }, { id: 'province', name: 'Gobierno de la Provincia de Santa Fe · Protección Civil', official: true, url: 'https://example.test/province' }, { id: 'city', name: 'Municipalidad de Santa Fe · COBEM', official: true, url: 'https://example.test/city' }, { id: 'ports', name: 'Agencia Nacional de Puertos y Navegación', official: true, url: 'https://example.test/ports' }, { id: 'nasa', name: 'NASA', official: true, url: 'https://example.test/nasa' }], serviceStatus: { worker: 'OPERATIONAL', api: 'OPERATIONAL', checkedAt: generatedAt, note: 'El estado técnico no garantiza vigencia ni ausencia de peligro.' }, changes: [{ id: 'change', label: 'Río Paraná — Santa Fe', direction: 'UP', detail: '+0,23 m en 24 horas' }], systems, river: { systemId: systems[0].id, available: true, dataStatus: 'LIVE', stationName: 'Santa Fe', currentMetres: 3.22, delta1h: .01, delta6h: .06, delta24h: .23, trend: 'RISING_SLOWLY', observedAt: generatedAt, fetchedAt: generatedAt, validUntil: '2026-08-05T10:15:00.000Z', sourceId: 'ina-rest-30', sourceName: systems[0].sourceName, points: systems[0].points, forecastPoints: [], thresholds: systems[0].thresholds }, rain: { available: false, dataStatus: 'UNAVAILABLE', accumulated1hMm: 0, accumulated24hMm: 0, forecast: 'Sin muestra válida.', observedAt: generatedAt, fetchedAt: generatedAt, validUntil: '2026-08-05T10:15:00.000Z', sourceId: 'nasa-gpm-imerg-early', points: [] }, sources, contradictions: [{ id: 'stale', title: 'Medición demorada', signals: ['Salado'], result: 'UNKNOWN', explanation: 'La medición del Río Salado tiene actualización demorada y no permite inferir ausencia de riesgo.' }], shelters: [], actions: ['Consultá la alerta oficial.', 'Llamá ante peligro inmediato.'], messages: [],
};

async function mockPublicApi(page: Page, snapshot: Snapshot = liveSnapshot) {
  await page.route('**/api/snapshot*', (route) => route.fulfill({ headers: { 'Cache-Control': 'no-store' }, json: { ok: true, data: snapshot, meta: { schemaVersion: '1.0', generatedAt, mode: snapshot.mode, official: false } } }));
  await page.route('**/api/sources*', (route) => route.fulfill({ headers: { 'Cache-Control': 'no-store' }, json: { ok: true, data: { snapshotId: snapshot.id, systems: snapshot.systems ?? [], sources: snapshot.sources, sourceOrganizations: snapshot.sourceOrganizations ?? [], alertStatus: snapshot.alertStatus, alerts: snapshot.alerts ?? [], timeline: snapshot.timeline ?? [], contradictions: snapshot.contradictions } } }));
  await page.route('**/api/messages*', (route) => route.fulfill({ headers: { 'Cache-Control': 'no-store' }, json: { ok: true, data: { snapshotId: snapshot.id, messages: [], deliveryClaims: 'NONE' } } }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ headers: { 'Cache-Control': 'private, no-store' }, json: { ok: true, data: { enabled: false, reportingEnabled: false, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ headers: { 'Cache-Control': 'private, no-store' }, json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

async function removePublicApiMocks(page: Page) {
  await Promise.all(['snapshot','sources','messages','auth/config','session'].map((path) => page.unroute(`**/api/${path}*`)));
}

test.beforeAll(async () => {
  await mkdir(`${evidenceDir}/screenshots`, { recursive: true });
  await writeFile(`${evidenceDir}/public-safety-scenario.json`, `${JSON.stringify({ schemaVersion: '1.0', orderId: 'SOS-SF-015-VISUAL-PRODUCT-RESTORE-A', snapshotId: liveSnapshot.id, generatedAt, widths: ['360x800','390x844','768x1024','1024x768','1440x900'] }, null, 2)}\n`);
});

test('first viewport answers the five critical public-safety questions', async ({ page }) => {
  await mockPublicApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Alerta por tormentas fuertes' })).toBeVisible();
  await expect(page.getByText('Departamento La Capital, Santa Fe')).toBeVisible();
  await expect(page.getByText(/Emitida/)).toBeVisible();
  await expect(page.getByText('Permanecé en un lugar seguro y evitá circular.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver alerta oficial' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'SOS Santa Fe, inicio' })).toBeVisible();
  await expect(page.getByText('Con conexión', { exact: true })).toHaveCount(0);
  const alertBox = await page.locator('.official-alert').boundingBox();
  expect(alertBox?.y).toBeLessThan(110);
  const chartBox = await page.getByTestId('main-hydro-chart').boundingBox();
  expect(chartBox?.y, 'el gráfico principal debe aparecer dentro de aproximadamente dos pantallas móviles').toBeLessThan(1688);
});

test('restores the main interactive hydrometric chart without gauges or fictional projections', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Situación hidrométrica' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Río Paraná — Santa Fe' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Río Paraná — Santa Fe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Río Salado — Santo Tomé' })).toBeVisible();
  await expect(page.locator('.level-ruler')).toHaveCount(0);
  await expect(page.locator('.level-gauge')).toHaveCount(0);
  const chart = page.getByRole('img', { name: /Evolución observada de Río Paraná/ });
  await expect(chart).toBeVisible();
  await expect(page.getByText('Nivel de alerta de referencia · 5,30 m')).toBeVisible();
  await expect(page.locator('.hydro-chart__gap')).toHaveCount(1);
  await chart.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.hydro-chart__readout')).toContainText('metros');
  await page.getByText('Ver tabla de mediciones').click();
  await expect(page.getByRole('table', { name: /Mediciones de Río Paraná/ })).toBeVisible();
  await expect(page.getByText('Evolución prevista')).toHaveCount(0);
  await expect(page.getByText('Sin proyección operativa')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Río Salado — Santo Tomé' }).click();
  await expect(page.getByTestId('hydro-current-level')).toContainText('4,80');
});

test('separates emergency calls, citizen report and grouped source transparency', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const actions = page.locator('section[aria-labelledby="actions-title"]');
  await expect(actions.getByRole('link', { name: /911/ })).toHaveAttribute('href', 'tel:911');
  await expect(actions.getByRole('button', { name: 'Reportar una situación' })).toHaveCount(1);
  await actions.getByRole('button', { name: 'Reportar una situación' }).click();
  const reportDialog = page.getByRole('dialog', { name: 'Reportar una situación' });
  await expect(reportDialog).toContainText('no inicia un despacho de emergencia');
  await expect(reportDialog.getByRole('link', { name: /103/ })).toHaveAttribute('href', 'tel:103');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Datos y fuentes' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir Datos y fuentes' }).click();
  const sourcesDialog = page.getByRole('dialog', { name: 'Datos y fuentes' });
  await expect(sourcesDialog.getByRole('heading', { name: 'Hidrometría' })).toBeVisible();
  await expect(sourcesDialog.getByRole('heading', { name: 'Alertas oficiales' })).toBeVisible();
  await expect(sourcesDialog.getByText('Requiere acceso oficial')).toBeVisible();
  await expect(sourcesDialog.getByText('Consulta manual').first()).toBeVisible();
  await expect(sourcesDialog).not.toContainText('BLOCKED_CREDENTIAL');
  await expect(sourcesDialog).not.toContainText('BLOCKED_NO_MACHINE_ENDPOINT');
  await expect(sourcesDialog).not.toContainText(/31\/12\/69|01\/01\/70/);
});

test('home remains a public product rather than technical documentation', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mapa y timeline de 72 horas' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Estado del servicio' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fuentes, vigencia y metodología' })).toHaveCount(0);
  await expect(page.getByText(/2 de 10 fuentes operativas/i)).toHaveCount(0);
  await expect(page.getByText(/Estado del integrador/)).toHaveCount(0);
  await expect(page.locator('main > section')).toHaveCount(5);
});

test('location is never requested before explicit consent', async ({ page }) => {
  await mockPublicApi(page);
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => { calls += 1; error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError); } } });
    Object.defineProperty(window, '__geoCalls', { get: () => calls });
  });
  await page.goto('/');
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(0);
  await page.getByRole('button', { name: 'Reportar una situación' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Reportar una situación' });
  await dialog.getByRole('button', { name: 'Usar mi ubicación' }).click();
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(1);
  await expect(dialog.getByText(/Permiso denegado/)).toBeVisible();
});

test('free KV quota exhaustion fails closed without upgrade language', async ({ page }) => {
  await mockPublicApi(page);
  await page.route('**/api/private/reports', (route) => route.fulfill({ status: 503, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json' }, json: { ok: false, error: { code: 'REPORT_STORAGE_UNAVAILABLE', message: 'El almacenamiento privado alcanzó temporalmente su límite gratuito.' } } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Reportar una situación' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Reportar una situación' });
  await dialog.getByLabel('Descripción').fill('Agua acumulada en una esquina.');
  await dialog.getByRole('button', { name: 'Enviar informe' }).click();
  await expect(dialog.getByRole('status')).toContainText('quedó pendiente');
  await expect(dialog.getByRole('status')).not.toContainText(/upgrade|pago|tarjeta|factur/i);
});

test('automated accessibility structure has no serious semantic failures', async ({ page }) => {
  await mockPublicApi(page);
  await page.goto('/');
  const audit = await page.evaluate(() => {
    const violations: Array<{ rule: string; target: string }> = [];
    const selector = (element: Element) => {
      const id = element.getAttribute('id');
      return id ? `#${id}` : element.tagName.toLowerCase();
    };
    const accessibleName = (element: Element) => {
      const labelledBy = element.getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
      const labels = 'labels' in element
        ? [...((element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).labels ?? [])]
            .map((label) => label.textContent?.trim() ?? '')
            .filter(Boolean)
            .join(' ')
        : '';
      return element.getAttribute('aria-label')?.trim()
        || labelledBy
        || labels
        || element.textContent?.trim()
        || element.getAttribute('title')?.trim()
        || '';
    };
    for (const element of document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')) {
      if (!accessibleName(element)) violations.push({ rule: 'accessible-name', target: selector(element) });
    }
    for (const element of document.querySelectorAll('img')) {
      if (!element.hasAttribute('alt')) violations.push({ rule: 'image-alt', target: selector(element) });
    }
    for (const element of document.querySelectorAll('[tabindex]')) {
      if (Number(element.getAttribute('tabindex')) > 0) violations.push({ rule: 'positive-tabindex', target: selector(element) });
    }
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((element) => Number(element.tagName.slice(1)));
    for (let index = 1; index < headings.length; index += 1) {
      if (headings[index]! - headings[index - 1]! > 1) violations.push({ rule: 'heading-order', target: `h${headings[index]}` });
    }
    return {
      violations,
      landmarks: {
        main: document.querySelectorAll('main').length,
        header: document.querySelectorAll('body > #root > .site-shell > header').length,
        footer: document.querySelectorAll('footer').length,
      },
      language: document.documentElement.lang,
    };
  });
  expect(audit.violations).toEqual([]);
  expect(audit.landmarks.main).toBe(1);
  expect(audit.landmarks.header).toBe(1);
  expect(audit.language).toBe('es-AR');
  await writeFile(`${evidenceDir}/accessibility-automated.json`, `${JSON.stringify(audit, null, 2)}\n`);
});

test('keyboard, reduced motion and focus return remain complete', async ({ page }) => {
  await mockPublicApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Abrir Datos y fuentes' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Datos y fuentes' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  const duration = await page.locator('.button').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(duration).toBeLessThan(.02);
});

test('required viewports have no clipping, overlap or horizontal page scroll', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Las capturas canónicas se generan una sola vez con DPR 1.');
  const sizes = [
    { width: 320, height: 800, name: '320x800' },
    { width: 360, height: 800, name: '360x800' },
    { width: 390, height: 844, name: '390x844' },
    { width: 768, height: 1024, name: '768x1024' },
    { width: 1024, height: 768, name: '1024x768' },
    { width: 1440, height: 900, name: '1440x900' },
  ];
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, serviceWorkers: 'block' });
    const page = await context.newPage();
    await mockPublicApi(page);
    await page.goto('/');
    const geometry = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, fixed: [...document.querySelectorAll('*')].filter((node) => getComputedStyle(node).position === 'fixed').length }));
    expect(geometry.scrollWidth, `${size.name} horizontal overflow`).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.fixed, `${size.name} fixed overlays`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${evidenceDir}/screenshots/public-safety-${size.name}.png`, fullPage: true });
    await context.close();
  }
});

test('200 percent zoom equivalent and 320px reflow preserve access to critical actions', async ({ page }) => {
  await mockPublicApi(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole('heading', { name: 'Alerta por tormentas fuertes' })).toBeVisible();
  await expect(page.getByRole('link', { name: /911/ })).toBeVisible();
});

test('browser makes no third-party or font requests', async ({ page }) => {
  const thirdParty: string[] = [];
  const fonts: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1','localhost'].includes(url.hostname)) thirdParty.push(url.href);
    if (request.resourceType() === 'font') fonts.push(url.href);
  });
  await mockPublicApi(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(thirdParty).toEqual([]);
  expect(fonts).toEqual([]);
});

test('offline state never claims updated data or absence of alerts', async ({ page, context }) => {
  await mockPublicApi(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey)).not.toBeNull();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await removePublicApiMocks(page);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Sin conexión', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No se pudieron verificar alertas')).toBeVisible();
  await expect(page.getByText('Sin alertas oficiales detectadas')).toHaveCount(0);
  await expect(page.getByText('Actualizado', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reportar una situación' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Reportar una situación' });
  await dialog.getByLabel('Descripción').fill('Agua acumulada.');
  await dialog.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(dialog.getByRole('status')).toContainText('Borrador guardado');
  await context.setOffline(false);
});

test('lite is script-free and preserves alert, freshness and emergency semantics', async ({ page }) => {
  await page.goto('/lite');
  await expect(page.getByRole('heading', { name: 'Información pública para emergencias' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /alerta|alertas|Fuentes/i }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Situación hidrométrica' })).toBeVisible();
  await expect(page.getByText('Reportar una situación no inicia un despacho', { exact: false })).toBeVisible();
  await expect(page.locator('script, canvas, video')).toHaveCount(0);
});
