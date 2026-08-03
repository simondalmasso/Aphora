import { unavailableSnapshot } from '../data/unavailable-snapshot';
import type { DataStatus, HydrologicalSystem, PublicState, RiverPoint, RiverThreshold, Snapshot, Source } from '../domain/snapshot';
import { providerHealth, type ProviderResult } from './providers/core';
import { fetchInaSeries, fetchInaWaterMl } from './providers/ina';
import { fetchNasaGpm, type NasaGpmReading } from './providers/nasa';
import { fetchPortsHydrometers, type PortsHydrometerReading } from './providers/ports';
import { fetchSmnAlerts, fetchSmnObservations, type SmnAlertSummary, type SmnObservationSummary } from './providers/smn';

export interface LiveDataEnv {
  readonly INA_WATERML_PARANA_URL?: string;
  readonly INA_WATERML_SALADO_URL?: string;
  readonly PORTS_HYDROMETER_JSON_URL?: string;
  readonly SMN_OBSERVATIONS_JSON_URL?: string;
  readonly SMN_ALERTS_JSON_URL?: string;
}

const INA_BASE = 'https://alerta.ina.gob.ar/pub/datos/datos';
const SNAPSHOT_CACHE_MS = 60_000;
const STATIONS = Object.freeze([
  Object.freeze({ id: 'parana-santa-fe', label: 'Sistema Paraná', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30', seriesId: '30', low: 2, alert: 5.3, evacuation: 5.7 }),
  Object.freeze({ id: 'salado-santo-tome', label: 'Sistema Salado', watercourse: 'Río Salado', stationName: 'Santo Tomé', stationCode: '1679', seriesId: '3044', low: 0, alert: 4.7, evacuation: null }),
]);

interface CachedSnapshot { readonly cachedAt: string; readonly snapshot: Snapshot }
const inFlight = new Map<string, Promise<Snapshot>>();

function cacheApi(): Cache | null { return typeof caches === 'undefined' ? null : caches.default; }

async function configKey(env: LiveDataEnv): Promise<string> {
  const config = JSON.stringify({
    waterMlParana: env.INA_WATERML_PARANA_URL ?? null,
    waterMlSalado: env.INA_WATERML_SALADO_URL ?? null,
    ports: env.PORTS_HYDROMETER_JSON_URL ?? null,
    smnObservations: env.SMN_OBSERVATIONS_JSON_URL ?? null,
    smnAlerts: env.SMN_ALERTS_JSON_URL ?? null,
  });
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(config)));
  return Array.from(bytes.slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readSnapshotCache(key: string, now: Date): Promise<Snapshot | null> {
  const cache = cacheApi();
  if (!cache) return null;
  const response = await cache.match(new Request(`https://cache.sos-sf.invalid/snapshot/${key}`));
  if (!response) return null;
  try {
    const item = await response.json() as CachedSnapshot;
    return now.getTime() - Date.parse(item.cachedAt) <= SNAPSHOT_CACHE_MS ? item.snapshot : null;
  } catch { return null; }
}

async function writeSnapshotCache(key: string, snapshot: Snapshot): Promise<void> {
  const cache = cacheApi();
  if (!cache) return;
  const item: CachedSnapshot = { cachedAt: new Date().toISOString(), snapshot };
  await cache.put(new Request(`https://cache.sos-sf.invalid/snapshot/${key}`), new Response(JSON.stringify(item), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } }));
}

function deltaAt(points: readonly RiverPoint[], hours: number): number | null {
  const latest = points.at(-1);
  if (!latest) return null;
  const target = Date.parse(latest.at) - hours * 3_600_000;
  const previous = [...points].reverse().find((point) => Date.parse(point.at) <= target);
  return previous ? latest.metres - previous.metres : null;
}

function trend(points: readonly RiverPoint[]): HydrologicalSystem['trend'] {
  const delta = deltaAt(points, 6);
  if (delta === null) return 'UNKNOWN';
  if (delta >= 0.12) return 'RISING';
  if (delta >= 0.02) return 'RISING_SLOWLY';
  if (delta <= -0.02) return 'FALLING';
  return 'STABLE';
}

function thresholds(station: typeof STATIONS[number]): readonly RiverThreshold[] {
  return Object.freeze([
    Object.freeze({ id: 'NORMAL' as const, label: 'Referencia baja', metres: station.low }),
    Object.freeze({ id: 'ALERTA' as const, label: 'Alerta', metres: station.alert }),
    ...(station.evacuation === null ? [] : [Object.freeze({ id: 'EVACUACION' as const, label: 'Umbral de evacuación', metres: station.evacuation })]),
  ]);
}

function systemState(system: HydrologicalSystem): PublicState {
  if (!system.available || system.currentMetres === null) return 'UNKNOWN';
  const evacuation = system.thresholds.find((item) => item.id === 'EVACUACION');
  const alert = system.thresholds.find((item) => item.id === 'ALERTA');
  const watch = system.thresholds.find((item) => item.id === 'VIGILANCIA');
  if (evacuation && system.currentMetres >= evacuation.metres) return 'UMBRAL_EVACUACION_ALCANZADO';
  if (alert && system.currentMetres >= alert.metres) return 'ALERTA';
  if (watch && system.currentMetres >= watch.metres) return 'VIGILANCIA';
  return 'NORMAL';
}

function stateLabel(state: PublicState): string {
  if (state === 'EVACUACION_OFICIAL') return 'Evacuación oficial informada por una fuente oficial';
  if (state === 'UMBRAL_EVACUACION_ALCANZADO') return 'Umbral de evacuación alcanzado; no equivale a una orden oficial';
  if (state === 'ALERTA') return 'Umbral de alerta alcanzado';
  if (state === 'VIGILANCIA') return 'Vigilancia';
  if (state === 'NORMAL') return 'Sin umbral de alerta alcanzado';
  return 'Sin datos en vivo';
}

function sourceStatus(result: ProviderResult<unknown>): Source['status'] {
  return result.status === 'FRESH' ? 'FRESH' : result.status === 'STALE' ? 'STALE' : 'UNAVAILABLE';
}

async function stationSystem(station: typeof STATIONS[number], now: Date): Promise<{ system: HydrologicalSystem; source: Source }> {
  const start = new Date(now.getTime() - 72 * 3_600_000).toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
  const url = `${INA_BASE}&timeStart=${start}&timeEnd=${end}&seriesId=${station.seriesId}&format=json`;
  const result = await fetchInaSeries(url, `ina-rest-${station.seriesId}`);
  const points = result.value ?? Object.freeze([]);
  const latest = points.at(-1);
  const age = latest ? now.getTime() - Date.parse(latest.at) : Number.POSITIVE_INFINITY;
  const status: DataStatus = !latest ? 'UNAVAILABLE' : result.status === 'STALE' || age > 12 * 3_600_000 ? 'STALE' : 'LIVE';
  const system: HydrologicalSystem = Object.freeze({
    id: station.id,
    label: station.label,
    watercourse: station.watercourse,
    stationName: station.stationName,
    stationCode: station.stationCode,
    available: Boolean(latest),
    dataStatus: status,
    currentMetres: latest?.metres ?? null,
    observedAt: latest?.at ?? null,
    sourceId: `ina:${station.seriesId}`,
    sourceName: 'INA · Sistema de Información Hidrológica',
    points,
    thresholds: thresholds(station),
    trend: trend(points),
    delta1h: deltaAt(points, 1),
    delta6h: deltaAt(points, 6),
    delta24h: deltaAt(points, 24),
  });
  const validated = latest?.quality === 'PROVIDER_VALIDATED';
  const source: Source = Object.freeze({
    id: system.sourceId,
    name: system.sourceName,
    kind: 'OFFICIAL_OBSERVATION',
    status: status === 'LIVE' ? 'FRESH' : status === 'STALE' ? 'STALE' : 'UNAVAILABLE',
    observedAt: latest?.at ?? result.fetchedAt,
    validUntil: new Date(Date.parse(latest?.at ?? result.fetchedAt) + 12 * 3_600_000).toISOString(),
    contribution: `${station.watercourse}, estación ${station.stationName}, serie ${station.seriesId}; lectura publicada por la fuente.`,
    official: true,
    connected: Boolean(latest),
    url: 'https://alerta.ina.gob.ar/pub/datos/',
    qualityNote: validated ? 'La fuente marcó explícitamente esta lectura como validada.' : 'Dato operativo en tiempo real sin garantía de control de calidad o validación definitiva por INA.',
  });
  return { system, source };
}

function unavailableSource(id: string, name: string, kind: Source['kind'], contribution: string): Source {
  return Object.freeze({ id, name, kind, status: 'UNAVAILABLE', observedAt: new Date(0).toISOString(), validUntil: new Date(0).toISOString(), contribution, official: true, connected: false });
}

async function waterMlSource(url: string | undefined, id: string, name: string): Promise<Source> {
  if (!url) return unavailableSource(id, name, 'OFFICIAL_OBSERVATION', 'Endpoint WaterML no configurado; no se usa HTML como reemplazo.');
  const result = await fetchInaWaterMl(url, id);
  return Object.freeze({
    id, name, kind: 'OFFICIAL_OBSERVATION', status: sourceStatus(result),
    observedAt: result.observedAt ?? result.fetchedAt,
    validUntil: new Date(Date.parse(result.observedAt ?? result.fetchedAt) + 12 * 3_600_000).toISOString(),
    contribution: result.value ? `WaterML interpretado: ${result.value.length} lecturas publicadas.` : 'WaterML no disponible o incompatible.',
    official: true, connected: Boolean(result.value), qualityNote: 'Formato verificado; la calidad hidrológica depende de la marca explícita del proveedor.',
  });
}

async function portsSource(url: string | undefined): Promise<Source> {
  if (!url) return unavailableSource('ports-hydrometers', 'Agencia Nacional de Puertos y Navegación', 'OFFICIAL_OBSERVATION', 'No se encontró un endpoint machine-readable estable configurado.');
  const result: ProviderResult<readonly PortsHydrometerReading[]> = await fetchPortsHydrometers(url);
  return Object.freeze({
    id: 'ports-hydrometers', name: 'Agencia Nacional de Puertos y Navegación', kind: 'OFFICIAL_OBSERVATION', status: sourceStatus(result),
    observedAt: result.observedAt ?? result.fetchedAt, validUntil: new Date(Date.parse(result.observedAt ?? result.fetchedAt) + 12 * 3_600_000).toISOString(),
    contribution: result.value ? `${result.value.length} lecturas de hidrómetros con estación, nivel y timestamp interpretados.` : 'Fuente no disponible o esquema incompatible.',
    official: true, connected: Boolean(result.value), qualityNote: 'Lecturas publicadas por la fuente; no se sustituyen estaciones de forma silenciosa.',
  });
}

async function smnObservationSource(url: string | undefined): Promise<Source> {
  if (!url) return unavailableSource('smn-observations', 'Servicio Meteorológico Nacional · observaciones', 'OFFICIAL_OBSERVATION', 'Endpoint de observaciones no configurado.');
  const result: ProviderResult<SmnObservationSummary> = await fetchSmnObservations(url);
  return Object.freeze({
    id: 'smn-observations', name: 'Servicio Meteorológico Nacional · observaciones', kind: 'OFFICIAL_OBSERVATION', status: sourceStatus(result),
    observedAt: result.observedAt ?? result.fetchedAt, validUntil: new Date(Date.parse(result.observedAt ?? result.fetchedAt) + 2 * 3_600_000).toISOString(),
    contribution: result.value ? `Observación interpretada${result.value.station ? ` en ${result.value.station}` : ''}${result.value.precipitationMm === null ? '' : `; precipitación ${result.value.precipitationMm} mm`}.` : 'Fuente no disponible o esquema incompatible.',
    official: true, connected: Boolean(result.value),
  });
}

async function smnAlertSource(url: string | undefined): Promise<Source> {
  if (!url) return unavailableSource('smn-alerts', 'Servicio Meteorológico Nacional · alertas', 'OFFICIAL_ALERT', 'Endpoint de alertas no configurado.');
  const result: ProviderResult<readonly SmnAlertSummary[]> = await fetchSmnAlerts(url);
  return Object.freeze({
    id: 'smn-alerts', name: 'Servicio Meteorológico Nacional · alertas', kind: 'OFFICIAL_ALERT', status: sourceStatus(result),
    observedAt: result.observedAt ?? result.fetchedAt, validUntil: new Date(Date.parse(result.observedAt ?? result.fetchedAt) + 6 * 3_600_000).toISOString(),
    contribution: result.value ? `${result.value.length} alertas con título y timestamp interpretados.` : 'Fuente no disponible o esquema incompatible.',
    official: true, connected: Boolean(result.value),
  });
}

async function nasaSource(): Promise<Source> {
  const query = new URL('https://maps.disasters.nasa.gov/ags03/rest/services/NRT_Latest/GPM_NRT_30min_Latest/ImageServer/identify');
  query.searchParams.set('geometry', JSON.stringify({ x: -60.7, y: -31.63, spatialReference: { wkid: 4326 } }));
  query.searchParams.set('geometryType', 'esriGeometryPoint');
  query.searchParams.set('returnGeometry', 'false');
  query.searchParams.set('f', 'json');
  const result: ProviderResult<NasaGpmReading> = await fetchNasaGpm(query.toString());
  return Object.freeze({
    id: 'nasa-gpm-imerg-early', name: 'NASA GPM IMERG Early', kind: 'SATELLITE_OBSERVATION', status: sourceStatus(result),
    observedAt: result.observedAt ?? result.fetchedAt, validUntil: new Date(Date.parse(result.observedAt ?? result.fetchedAt) + 6 * 3_600_000).toISOString(),
    contribution: result.value ? 'Estimación satelital suplementaria disponible; no se transforma en un nivel o pluviómetro local.' : 'Estimación satelital suplementaria no disponible.',
    official: true, connected: Boolean(result.value), latencyMinutes: result.value?.latencyMinutes ?? 240,
    resolution: result.value?.resolution ?? 'aprox. 0,1° / 30 minutos', uncertainty: result.value?.uncertainty ?? 'Estimación temprana con incertidumbre espacial y temporal.',
  });
}

function highestState(systems: readonly HydrologicalSystem[]): PublicState {
  const order: PublicState[] = ['UNKNOWN', 'NORMAL', 'VIGILANCIA', 'ALERTA', 'UMBRAL_EVACUACION_ALCANZADO', 'EVACUACION_OFICIAL'];
  return systems.map(systemState).reduce((current, next) => order.indexOf(next) > order.indexOf(current) ? next : current, 'UNKNOWN');
}

async function buildUncached(env: LiveDataEnv, now: Date): Promise<Snapshot> {
  const stationPromise = Promise.all(STATIONS.map((station) => stationSystem(station, now)));
  const optionalPromise = Promise.all([
    waterMlSource(env.INA_WATERML_PARANA_URL, 'ina-waterml-parana', 'INA WaterOneFlow · Paraná'),
    waterMlSource(env.INA_WATERML_SALADO_URL, 'ina-waterml-salado', 'INA WaterOneFlow · Salado'),
    portsSource(env.PORTS_HYDROMETER_JSON_URL),
    smnObservationSource(env.SMN_OBSERVATIONS_JSON_URL),
    smnAlertSource(env.SMN_ALERTS_JSON_URL),
    nasaSource(),
  ]);
  const [stationResults, optionalSources] = await Promise.all([stationPromise, optionalPromise]);
  const systems = Object.freeze(stationResults.map((item) => item.system));
  const sources = Object.freeze([...stationResults.map((item) => item.source), ...optionalSources]);
  const primary = systems.find((item) => item.id === 'parana-santa-fe' && item.available) ?? systems.find((item) => item.available);
  if (!primary) return Object.freeze({ ...unavailableSnapshot, generatedAt: now.toISOString(), previousSnapshotAt: now.toISOString(), validUntil: new Date(now.getTime() + 15 * 60_000).toISOString(), systems, sources });
  const status: DataStatus = primary.dataStatus === 'STALE' || systems.some((item) => item.available && item.dataStatus === 'STALE') ? 'STALE' : 'LIVE';
  const state = highestState(systems);
  const delta24h = primary.delta24h ?? 0;
  const action = ['EVACUACION_OFICIAL', 'UMBRAL_EVACUACION_ALCANZADO', 'ALERTA'].includes(state) ? 'Seguí únicamente instrucciones oficiales y evitá zonas ribereñas o anegadas.' : 'Mantenete informado mediante fuentes oficiales y revisá tu plan familiar.';
  const nasa = sources.find((source) => source.id === 'nasa-gpm-imerg-early');
  return Object.freeze({
    schemaVersion: '1.0', id: `live-${now.toISOString()}`, mode: 'LIVE', dataStatus: status,
    generatedAt: now.toISOString(), previousSnapshotAt: new Date(now.getTime() - 15 * 60_000).toISOString(), state, stateLabel: stateLabel(state),
    summary: `${primary.watercourse}, estación ${primary.stationName}: ${primary.currentMetres?.toFixed(2)} m. Cada sistema se presenta en su propia escala; son datos operativos sin validación definitiva salvo marca expresa.`,
    dominantSourceId: primary.sourceId, validUntil: new Date(now.getTime() + 15 * 60_000).toISOString(), recommendedAction: action,
    emergencyDisclaimer: 'SOS Santa Fe agrega fuentes públicas y no reemplaza al 911, 103 ni a los organismos oficiales. Un umbral numérico no constituye una orden de evacuación.',
    changes: Object.freeze([{ id: 'primary-24h', label: `${primary.watercourse} · ${primary.stationName}`, direction: delta24h > 0.01 ? 'UP' : delta24h < -0.01 ? 'DOWN' : 'SAME', detail: primary.delta24h === null ? 'Sin comparación de 24 horas' : `${delta24h >= 0 ? '+' : ''}${Math.round(delta24h * 100)} cm en 24 horas` }]),
    systems,
    river: Object.freeze({ systemId: primary.id, available: true, dataStatus: primary.dataStatus, stationName: primary.stationName, currentMetres: primary.currentMetres ?? 0, delta1h: primary.delta1h ?? 0, delta6h: primary.delta6h ?? 0, delta24h, trend: primary.trend, observedAt: primary.observedAt ?? now.toISOString(), sourceId: primary.sourceId, sourceName: primary.sourceName, points: primary.points, forecastPoints: Object.freeze([]), thresholds: primary.thresholds }),
    rain: Object.freeze({ available: false, dataStatus: nasa?.status === 'STALE' ? 'STALE' : 'UNAVAILABLE', accumulated1hMm: 0, accumulated24hMm: 0, forecast: nasa?.connected ? 'NASA GPM IMERG Early está disponible sólo como estimación satelital suplementaria; no se convierte en acumulado local.' : 'Sin estimación suplementaria disponible.', observedAt: nasa?.observedAt ?? now.toISOString(), sourceId: 'nasa-gpm-imerg-early', points: Object.freeze([]) }),
    sources, contradictions: Object.freeze([]), shelters: Object.freeze([]),
    actions: Object.freeze(['Consultá alertas y recomendaciones oficiales.', 'Tené disponibles los teléfonos esenciales.']), messages: Object.freeze([]),
  });
}

export async function buildLiveSnapshot(env: LiveDataEnv, now = new Date()): Promise<Snapshot> {
  const key = await configKey(env);
  const cached = await readSnapshotCache(key, now);
  if (cached) return cached;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const operation = buildUncached(env, now).then(async (snapshot) => { await writeSnapshotCache(key, snapshot); return snapshot; }).finally(() => inFlight.delete(key));
  inFlight.set(key, operation);
  return operation;
}

export function liveProviderHealth() { return providerHealth(); }
