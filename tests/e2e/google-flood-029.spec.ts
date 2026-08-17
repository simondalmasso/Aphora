import { expect, test, type Page } from '@playwright/test';
import type { Snapshot } from '../../src/domain/snapshot.ts';
import { stableHydrometricSnapshot } from './fixtures/stable-hydrometric.ts';

async function routes(page: Page, snapshot: Snapshot) {
  await page.route('**/api/snapshot*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: snapshot }) }));
  await page.route('**/api/auth/config*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, reportingEnabled: true, googleClientId: null } } }));
  await page.route('**/api/session*', (route) => route.fulfill({ json: { ok: true, data: { enabled: false, authenticated: false, principal: null } } }));
}

function googleSnapshot(): Snapshot {
  const at = stableHydrometricSnapshot.generatedAt;
  const validTo = new Date(Date.parse(at) + 3_600_000).toISOString();
  return {
    ...stableHydrometricSnapshot,
    googleFlood: {
      schemaVersion: '029.1', accessMode: 'APPROVED_LIVE_API', retrievedAt: at, license: 'CC_BY_4_0',
      floodHubUrl: 'https://sites.research.google/floods/l/-31.64296019320365/-60.716129887666185/5', mappings: [],
      reconciliation: {
        localObservationState: 'AVAILABLE', googleModelState: 'ELEVATED', officialWarningState: 'NONE_CONFIRMED', territorialContext: 'IDESF_STATIC_CONTEXT', rainContext: 'UNAVAILABLE',
        relation: 'MODEL_ELEVATED_LOCAL_NOT_AT_REFERENCE', explanation: 'Google proyecta una condición elevada, mientras la medición oficial local no alcanzó una referencia local de protección verificada.',
        rawMetreSubtractionPerformed: false, officialEmergencyDeclaredByGoogle: false,
      },
      signals: [{
        provider: 'GOOGLE_FLOOD_FORECASTING', gaugeId: 'fixture-gauge', gaugeModelId: 'fixture-model', qualityVerified: false, hasModel: true,
        siteName: 'Santa Fe', river: 'Paraná', location: { latitude: -31.65, longitude: -60.70 }, source: 'Google', issuedAt: at,
        validFrom: at, validTo, leadTimeHours: 1, forecastValue: null, forecastUnit: 'METERS', forecastTrend: 'RISE', forecastChange: null,
        modelSeverity: 'ABOVE_NORMAL', modelThresholdClass: 'WARNING', mapInferenceType: 'MODEL', inundationProbabilityAvailable: true,
        inundationDepthAvailable: false, polygonIds: ['fixture-polygon'], retrievedAt: at, freshness: 'CURRENT', semanticRole: 'SUPPLEMENTARY_MODEL_FORECAST',
        canDetermineOfficialWarning: false, canDetermineOfficialEmergency: false, license: 'CC_BY_4_0', associatedSosSystem: 'parana-santa-fe',
      }],
    },
  };
}

test('Google Flood stays supplementary and never calls Google API from the browser', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await routes(page, googleSnapshot());
  await page.goto('/');
  const module = page.getByTestId('google-flood-fusion');
  await expect(module).toContainText('No es alerta oficial');
  await expect(module).toContainText('Confianza reducida');
  await expect(module).toContainText('no representa extensión observada actual');
  expect(requests.some((url) => url.includes('floodforecasting.googleapis.com'))).toBe(false);
});

test('no Google module is rendered when no live model data exists', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await routes(page, stableHydrometricSnapshot);
  await page.goto('/');
  await expect(page.getByTestId('google-flood-fusion')).toHaveCount(0);
});
