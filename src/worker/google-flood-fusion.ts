import { associateGoogleGauge, reconcileGoogleFlood, type GoogleFloodFusion, type GoogleGaugeMapping, type LocalStationAnchor } from '../domain/google-flood.ts';
import type { HydrologicalSystem, Snapshot, Source } from '../domain/snapshot.ts';
import {
  getGoogleGaugeModel,
  normalizeGoogleFloodSignal,
  queryGoogleGaugeForecasts,
  searchGoogleFlashFloods,
  searchGoogleGaugesByArea,
  searchLatestGoogleFloodStatusByArea,
  type GoogleGaugeModelRaw,
} from './providers/google-flood.ts';

const GOOGLE_AREA = Object.freeze({
  vertices: Object.freeze([
    Object.freeze({ latitude: -32.25, longitude: -61.45 }),
    Object.freeze({ latitude: -32.25, longitude: -59.85 }),
    Object.freeze({ latitude: -31.15, longitude: -59.85 }),
    Object.freeze({ latitude: -31.15, longitude: -61.45 }),
  ]),
});
const GOOGLE_ANCHORS: readonly LocalStationAnchor[] = Object.freeze([
  Object.freeze({
    systemId: 'parana-santa-fe', stationName: 'Santa Fe', watercourse: 'Río Paraná',
    location: { latitude: -31.6505, longitude: -60.7012 },
    coordinateSource: 'Referencia cartográfica aproximada ya usada por SOS-SF/Argenmap; sólo asociación, no datum hidrométrico.',
  }),
  Object.freeze({
    systemId: 'salado-santo-tome', stationName: 'Santo Tomé', watercourse: 'Río Salado',
    location: { latitude: -31.6688, longitude: -60.7654 },
    coordinateSource: 'Referencia cartográfica aproximada ya usada por SOS-SF/Argenmap; sólo asociación, no datum hidrométrico.',
  }),
]);

function sourceBase(now: Date, input: {
  status: Source['status']; observedAt: string; validUntil: string; connected: boolean; freshness: Source['freshness'];
  classification: Source['classification']; contribution: string; limitations: string;
}): Source {
  return Object.freeze({
    id: 'google-flood-forecasting', name: 'Google Flood Forecasting', kind: 'FORECAST_MODEL', status: input.status,
    observedAt: input.observedAt, validUntil: input.validUntil, contribution: input.contribution, official: false,
    url: 'https://developers.google.com/flood-forecasting', connected: input.connected, organizationId: 'google-flood',
    organizationName: 'Google Flood Forecasting', feedId: 'google-flood-forecasting', feedName: 'Flood Forecasting API',
    classification: input.classification, freshness: input.freshness, fetchedAt: now.toISOString(), lastCheckedAt: now.toISOString(),
    limitations: input.limitations, determinesPrimaryState: false,
  });
}
function blocked(now: Date): { source: Source; fusion?: GoogleFloodFusion } {
  return { source: sourceBase(now, {
    status: 'UNAVAILABLE', observedAt: new Date(0).toISOString(), validUntil: new Date(0).toISOString(), connected: false,
    freshness: 'NO_DISPONIBLE', classification: 'BLOCKED_CREDENTIAL',
    contribution: 'Integración preparada; requiere aprobación/credencial externa del API.',
    limitations: 'Modelo global suplementario; nunca reemplaza INA/SMN/IDESF ni determina emergencia oficial.',
  }) };
}
function degraded(now: Date, reason: string): { source: Source; fusion?: GoogleFloodFusion } {
  return { source: sourceBase(now, {
    status: 'UNAVAILABLE', observedAt: new Date(0).toISOString(), validUntil: new Date(0).toISOString(), connected: false,
    freshness: 'NO_DISPONIBLE', classification: 'DEGRADED', contribution: reason,
    limitations: 'Falla cerrada del modelo suplementario. La hidrometría INA y las alertas oficiales siguen siendo independientes.',
  }) };
}

async function build(
  apiKey: string,
  systems: readonly HydrologicalSystem[],
  alertStatus: Snapshot['alertStatus'],
  rainAvailable: boolean,
  now: Date,
): Promise<{ source: Source; fusion?: GoogleFloodFusion }> {
  const gaugesResult = await searchGoogleGaugesByArea(apiKey, GOOGLE_AREA);
  if (!gaugesResult.value) return degraded(now, 'No se pudo obtener un contrato de gauges utilizable.');
  const mappings = gaugesResult.value
    .map((gauge) => associateGoogleGauge(gauge, GOOGLE_ANCHORS))
    .filter((mapping) => mapping.associationConfidence !== 'UNMAPPED')
    .sort((a, b) => (a.distanceToLocalStationKm ?? 999) - (b.distanceToLocalStationKm ?? 999))
    .slice(0, 4);
  const candidates = mappings.map((mapping) => gaugesResult.value!.find((gauge) => gauge.gaugeId === mapping.googleGaugeId)).filter(Boolean);
  if (!candidates.length) return degraded(now, 'No se encontró un gauge Google que pueda asociarse de forma segura a los corredores locales.');

  const modelCandidates = candidates.filter((gauge) => gauge!.hasModel).map((gauge) => gauge!.gaugeId).slice(0, 20);
  const [statusResult] = await Promise.all([
    searchLatestGoogleFloodStatusByArea(apiKey, GOOGLE_AREA),
    modelCandidates.length
      ? queryGoogleGaugeForecasts(apiKey, modelCandidates, new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString(), now.toISOString()).catch(() => null)
      : Promise.resolve(null),
    searchGoogleFlashFloods(apiKey, 'AR').catch(() => null),
  ]);
  const statuses = statusResult.value ?? [];
  const modelPairs = await Promise.all(candidates.map(async (candidate) => {
    const gauge = candidate!;
    const model = gauge.hasModel ? (await getGoogleGaugeModel(apiKey, gauge.gaugeId)).value : null;
    return [gauge.gaugeId, model] as const;
  }));
  const models = new Map<string, GoogleGaugeModelRaw | null>(modelPairs);
  const enriched: GoogleGaugeMapping[] = mappings.map((mapping) => {
    const model = models.get(mapping.googleGaugeId);
    return Object.freeze({ ...mapping, modelId: model?.gaugeModelId ?? null, modelUnit: model?.gaugeValueUnit ?? null });
  });
  const signals = candidates.flatMap((candidate) => {
    const gauge = candidate!;
    const mapping = enriched.find((item) => item.googleGaugeId === gauge.gaugeId)!;
    const status = statuses.find((item) => item.gaugeId === gauge.gaugeId);
    if (!status) return [];
    const signal = normalizeGoogleFloodSignal(gauge, mapping, models.get(gauge.gaugeId) ?? null, status, now.toISOString());
    return signal ? [signal] : [];
  });
  const reconciliation = reconcileGoogleFlood({ systems, signals, alertStatus, rainAvailable });
  const current = signals.some((signal) => signal.freshness === 'CURRENT');
  const source = sourceBase(now, {
    status: current ? 'FRESH' : signals.length ? 'STALE' : 'UNAVAILABLE',
    observedAt: signals[0]?.issuedAt ?? gaugesResult.fetchedAt,
    validUntil: signals[0]?.validTo ?? now.toISOString(), connected: signals.length > 0,
    freshness: current ? 'ACTUALIZADO' : signals.length ? 'ACTUALIZACION_DEMORADA' : 'NO_DISPONIBLE', classification: 'SUPPLEMENTARY',
    contribution: signals.length ? `${signals.length} señal(es) de modelo reconciliadas con la hidrometría local.` : 'Sin señal temporal utilizable para los gauges asociados.',
    limitations: 'Modelo Google suplementario e informativo; no constituye alerta ni emergencia oficial y no se restan metros contra INA sin prueba de datum.',
  });
  return {
    source,
    fusion: Object.freeze({
      schemaVersion: '029.1', accessMode: 'APPROVED_LIVE_API', retrievedAt: now.toISOString(), mappings: Object.freeze(enriched),
      signals: Object.freeze(signals), reconciliation,
      floodHubUrl: 'https://sites.research.google/floods/l/-31.64296019320365/-60.716129887666185/5', license: 'CC_BY_4_0',
    }),
  };
}

export async function buildGoogleFloodFusion(
  apiKey: string | undefined,
  systems: readonly HydrologicalSystem[],
  alertStatus: Snapshot['alertStatus'],
  rainAvailable: boolean,
  now: Date,
): Promise<{ source: Source; fusion?: GoogleFloodFusion }> {
  if (!apiKey?.trim()) return blocked(now);
  const timeout = new Promise<{ source: Source; fusion?: GoogleFloodFusion }>((resolve) => {
    setTimeout(() => resolve(degraded(now, 'Google Flood excedió el presupuesto de latencia y fue aislado del camino crítico INA.')), 2_500);
  });
  try { return await Promise.race([build(apiKey, systems, alertStatus, rainAvailable, now), timeout]); }
  catch { return degraded(now, 'Google Flood falló de forma cerrada sin afectar la observación hidrométrica primaria.'); }
}
