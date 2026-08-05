import { unavailableSnapshot } from '../data/unavailable-snapshot';
import {
  alertVerificationState,
  classificationForSource,
  dataStatusForFreshness,
  freshnessFor,
  highestFreshness,
  timelineFor,
} from '../domain/public-safety';
import type {
  ChangeItem,
  DataStatus,
  FeedClassification,
  FreshnessState,
  HydrologicalSystem,
  OfficialAlert,
  PublicState,
  RiverPoint,
  RiverThreshold,
  Snapshot,
  Source,
  SourceOrganization,
} from '../domain/snapshot';
import { providerHealth, publishProviderBlock, restoreProviderHealth, type ProviderHealth, type ProviderResult } from './providers/core';
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

const INA_BASE = 'https://alerta.ina.gob.ar/a5/getObservaciones';
const LIVE_DATA_CACHE_VERSION = 'public-safety-015-v1';
const SMN_CAP_URL = 'https://ssl.smn.gob.ar/feeds/CAP/rss_alertaCAP_nuevo_2026.xml';
const NASA_GPM_URL = 'https://gis.earthdata.nasa.gov/image/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer';
const PROVINCE_WARNING_URL = 'https://www.santafe.gov.ar/proteccioncivil/alertatemprana';
const COBEM_URL = 'https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/cobem/';
const FRESH_MEASUREMENT_MS = 6 * 60 * 60_000;
const DELAYED_MEASUREMENT_MS = 24 * 60 * 60_000;
const SNAPSHOT_CACHE_MS = 60_000;
const STATIONS = Object.freeze([
  Object.freeze({
    id: 'parana-santa-fe',
    label: 'Río Paraná — Santa Fe',
    watercourse: 'Río Paraná',
    stationName: 'Santa Fe',
    stationSubtitle: 'Estación hidrométrica Santa Fe',
    stationCode: '30',
    seriesId: '30',
    low: 2,
    alert: 5.3,
    evacuation: 5.7,
  }),
  Object.freeze({
    id: 'salado-santo-tome',
    label: 'Río Salado — Santo Tomé',
    watercourse: 'Río Salado',
    stationName: 'Santo Tomé',
    stationSubtitle: 'Estación hidrométrica Santo Tomé',
    stationCode: '1679',
    seriesId: '3044',
    low: 0,
    alert: 4.7,
    evacuation: null,
  }),
]);

const ORGANIZATIONS: readonly SourceOrganization[] = Object.freeze([
  Object.freeze({ id: 'ina', name: 'Instituto Nacional del Agua', official: true, url: 'https://www.argentina.gob.ar/ina' }),
  Object.freeze({ id: 'smn', name: 'Servicio Meteorológico Nacional', official: true, url: 'https://www.smn.gob.ar/' }),
  Object.freeze({ id: 'santa-fe-province', name: 'Gobierno de la Provincia de Santa Fe · Protección Civil', official: true, url: PROVINCE_WARNING_URL }),
  Object.freeze({ id: 'santa-fe-city', name: 'Municipalidad de Santa Fe · COBEM', official: true, url: COBEM_URL }),
  Object.freeze({ id: 'ports-agency', name: 'Agencia Nacional de Puertos y Navegación', official: true, url: 'https://www.argentina.gob.ar/economia/agencia-nacional-de-puertos-y-navegacion/hidrometros' }),
  Object.freeze({ id: 'nasa', name: 'NASA', official: true, url: 'https://gpm.nasa.gov/data/imerg' }),
]);

interface CachedSnapshot { readonly cachedAt: string; readonly snapshot: Snapshot; readonly providerHealth: readonly ProviderHealth[] }
interface CloudflareCacheStorage extends CacheStorage { readonly default: Cache }
const inFlight = new Map<string, Promise<Snapshot>>();

function cacheApi(): Cache | null {
  if (typeof caches === 'undefined') return null;
  return (caches as CloudflareCacheStorage).default ?? null;
}

async function configKey(env: LiveDataEnv): Promise<string> {
  const config = JSON.stringify({
    version: LIVE_DATA_CACHE_VERSION,
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
    if (now.getTime() - Date.parse(item.cachedAt) > SNAPSHOT_CACHE_MS) return null;
    if (Array.isArray(item.providerHealth)) restoreProviderHealth(item.providerHealth);
    return item.snapshot;
  } catch { return null; }
}

async function writeSnapshotCache(key: string, snapshot: Snapshot): Promise<void> {
  const cache = cacheApi();
  if (!cache) return;
  const item: CachedSnapshot = { cachedAt: new Date().toISOString(), snapshot, providerHealth: providerHealth() };
  await cache.put(
    new Request(`https://cache.sos-sf.invalid/snapshot/${key}`),
    new Response(JSON.stringify(item), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } }),
  );
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
    Object.freeze({ id: 'NORMAL' as const, label: 'Referencia inferior', metres: station.low }),
    Object.freeze({ id: 'ALERTA' as const, label: 'Nivel de alerta de referencia', metres: station.alert }),
    ...(station.evacuation === null ? [] : [Object.freeze({ id: 'EVACUACION' as const, label: 'Nivel de evacuación de referencia', metres: station.evacuation })]),
  ]);
}

function systemState(system: HydrologicalSystem): PublicState {
  if (!system.available || system.currentMetres === null || system.freshness === 'DESACTUALIZADO' || system.freshness === 'NO_DISPONIBLE') return 'UNKNOWN';
  const evacuation = system.thresholds.find((item) => item.id === 'EVACUACION');
  const alert = system.thresholds.find((item) => item.id === 'ALERTA');
  const watch = system.thresholds.find((item) => item.id === 'VIGILANCIA');
  if (evacuation && system.currentMetres >= evacuation.metres) return 'UMBRAL_EVACUACION_ALCANZADO';
  if (alert && system.currentMetres >= alert.metres) return 'ALERTA';
  if (watch && system.currentMetres >= watch.metres) return 'VIGILANCIA';
  return 'NORMAL';
}

function stateLabel(state: PublicState): string {
  if (state === 'EVACUACION_OFICIAL') return 'Existe una orden oficial vigente';
  if (state === 'UMBRAL_EVACUACION_ALCANZADO') return 'Nivel por encima del umbral de evacuación de referencia; no equivale a una orden oficial';
  if (state === 'ALERTA') return 'Nivel por encima del umbral de alerta de referencia';
  if (state === 'VIGILANCIA') return 'Nivel por encima del umbral de vigilancia de referencia';
  if (state === 'NORMAL') return 'Nivel por debajo del umbral de alerta';
  return 'No hay una medición vigente suficiente para clasificar el nivel';
}

function sourceStatus(result: ProviderResult<unknown>): Source['status'] {
  return result.status === 'FRESH' ? 'FRESH' : result.status === 'STALE' ? 'STALE' : 'UNAVAILABLE';
}

function sourceBase(input: {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  feedName: string;
  kind: Source['kind'];
  status: Source['status'];
  observedAt: string;
  fetchedAt: string;
  validUntil: string;
  contribution: string;
  url: string;
  connected: boolean;
  classification?: FeedClassification;
  freshness?: FreshnessState;
  limitations?: string;
  determinesPrimaryState: boolean;
  qualityNote?: string;
  latencyMinutes?: number;
  resolution?: string;
  uncertainty?: string;
}): Source {
  const preliminary: Source = {
    id: input.id,
    name: input.name,
    kind: input.kind,
    status: input.status,
    observedAt: input.observedAt,
    fetchedAt: input.fetchedAt,
    lastCheckedAt: input.fetchedAt,
    validUntil: input.validUntil,
    contribution: input.contribution,
    official: true,
    url: input.url,
    connected: input.connected,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    feedId: input.id,
    feedName: input.feedName,
    classification: input.classification,
    freshness: input.freshness,
    limitations: input.limitations,
    determinesPrimaryState: input.determinesPrimaryState,
    qualityNote: input.qualityNote,
    latencyMinutes: input.latencyMinutes,
    resolution: input.resolution,
    uncertainty: input.uncertainty,
  };
  return Object.freeze({ ...preliminary, classification: preliminary.classification ?? classificationForSource(preliminary) });
}

async function stationSystem(station: typeof STATIONS[number], now: Date): Promise<{ system: HydrologicalSystem; source: Source }> {
  const start = new Date(now.getTime() - 180 * 24 * 3_600_000).toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
  const endpoint = new URL(INA_BASE);
  endpoint.searchParams.set('tipo', 'puntual');
  endpoint.searchParams.set('series_id', station.seriesId);
  endpoint.searchParams.set('timestart', start);
  endpoint.searchParams.set('timeend', end);
  const sourceUrl = endpoint.toString();
  const result = await fetchInaSeries(sourceUrl, `ina-rest-${station.seriesId}`, station.seriesId);
  const points = result.value ?? Object.freeze([]);
  const latest = points.at(-1);
  const freshness = freshnessFor(latest?.at, now, FRESH_MEASUREMENT_MS, DELAYED_MEASUREMENT_MS);
  const status = dataStatusForFreshness(freshness);
  const validUntil = latest ? new Date(Date.parse(latest.at) + DELAYED_MEASUREMENT_MS).toISOString() : result.fetchedAt;
  const system: HydrologicalSystem = Object.freeze({
    id: station.id,
    label: station.label,
    watercourse: station.watercourse,
    stationName: station.stationName,
    stationCode: station.stationCode,
    available: Boolean(latest),
    dataStatus: status,
    freshness,
    currentMetres: latest?.metres ?? null,
    observedAt: latest?.at ?? null,
    fetchedAt: result.fetchedAt,
    validUntil,
    sourceId: `ina-rest-${station.seriesId}`,
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points,
    thresholds: thresholds(station),
    trend: trend(points),
    delta1h: deltaAt(points, 1),
    delta6h: deltaAt(points, 6),
    delta24h: deltaAt(points, 24),
  });
  const validated = latest?.quality === 'PROVIDER_VALIDATED';
  const source = sourceBase({
    id: system.sourceId,
    name: `INA REST · ${station.label}`,
    organizationId: 'ina',
    organizationName: 'Instituto Nacional del Agua',
    feedName: `INA REST · ${station.watercourse}, estación ${station.stationName}`,
    kind: 'OFFICIAL_OBSERVATION',
    status: status === 'LIVE' ? 'FRESH' : status === 'STALE' ? 'STALE' : 'UNAVAILABLE',
    observedAt: latest?.at ?? result.fetchedAt,
    fetchedAt: result.fetchedAt,
    validUntil,
    contribution: `${station.stationSubtitle}; serie ${station.seriesId}.`,
    url: sourceUrl,
    connected: Boolean(latest),
    freshness,
    determinesPrimaryState: true,
    limitations: 'INA REST e INA WaterML son dos transportes del mismo organismo y no cuentan como corroboraciones independientes.',
    qualityNote: validated ? 'La fuente marcó la lectura como validada.' : 'Lectura operativa publicada; puede estar sujeta a revisión del organismo.',
  });
  return { system, source };
}

function blockedSource(input: {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  feedName: string;
  kind: Source['kind'];
  classification: Extract<FeedClassification, 'BLOCKED_CREDENTIAL' | 'BLOCKED_NO_MACHINE_ENDPOINT' | 'REJECTED_UNSAFE'>;
  contribution: string;
  url: string;
  now: Date;
}): Source {
  return sourceBase({
    id: input.id,
    name: input.name,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    feedName: input.feedName,
    kind: input.kind,
    status: 'UNAVAILABLE',
    observedAt: new Date(0).toISOString(),
    fetchedAt: input.now.toISOString(),
    validUntil: new Date(0).toISOString(),
    contribution: input.contribution,
    url: input.url,
    connected: false,
    classification: input.classification,
    freshness: 'NO_DISPONIBLE',
    limitations: input.contribution,
    determinesPrimaryState: false,
  });
}

async function waterMlSource(url: string, id: string, feedName: string, now: Date): Promise<Source> {
  const result = await fetchInaWaterMl(url, id);
  const freshness = freshnessFor(result.observedAt, now, FRESH_MEASUREMENT_MS, DELAYED_MEASUREMENT_MS);
  const observedAt = result.observedAt ?? result.fetchedAt;
  return sourceBase({
    id,
    name: feedName,
    organizationId: 'ina',
    organizationName: 'Instituto Nacional del Agua',
    feedName,
    kind: 'OFFICIAL_OBSERVATION',
    status: sourceStatus(result),
    observedAt,
    fetchedAt: result.fetchedAt,
    validUntil: new Date(Date.parse(observedAt) + DELAYED_MEASUREMENT_MS).toISOString(),
    contribution: result.value ? `${result.value.length} lecturas WaterML interpretadas.` : 'WaterML no disponible o incompatible.',
    url,
    connected: result.value !== null,
    freshness,
    determinesPrimaryState: false,
    limitations: 'Transporte alternativo del INA. No se cuenta como corroboración independiente del feed REST del mismo organismo.',
    qualityNote: 'La interpretación respeta timestamps del proveedor y no reemplaza estaciones de forma silenciosa.',
  });
}

async function portsSource(url: string | undefined, now: Date): Promise<Source> {
  if (!url) return blockedSource({
    id: 'ports-hydrometers',
    name: 'Hidrómetros portuarios',
    organizationId: 'ports-agency',
    organizationName: 'Agencia Nacional de Puertos y Navegación',
    feedName: 'Hidrómetros portuarios',
    kind: 'OFFICIAL_OBSERVATION',
    classification: 'BLOCKED_NO_MACHINE_ENDPOINT',
    contribution: 'No se confirmó un endpoint oficial estable legible por máquina; se conserva el enlace humano de verificación.',
    url: 'https://www.argentina.gob.ar/economia/agencia-nacional-de-puertos-y-navegacion/hidrometros',
    now,
  });
  const result: ProviderResult<readonly PortsHydrometerReading[]> = await fetchPortsHydrometers(url);
  const observedAt = result.observedAt ?? result.fetchedAt;
  const freshness = freshnessFor(result.observedAt, now, FRESH_MEASUREMENT_MS, DELAYED_MEASUREMENT_MS);
  return sourceBase({
    id: 'ports-hydrometers',
    name: 'Hidrómetros portuarios',
    organizationId: 'ports-agency',
    organizationName: 'Agencia Nacional de Puertos y Navegación',
    feedName: 'Hidrómetros portuarios',
    kind: 'OFFICIAL_OBSERVATION',
    status: sourceStatus(result),
    observedAt,
    fetchedAt: result.fetchedAt,
    validUntil: new Date(Date.parse(observedAt) + DELAYED_MEASUREMENT_MS).toISOString(),
    contribution: result.value ? `${result.value.length} lecturas interpretadas.` : 'Fuente no disponible o esquema incompatible.',
    url,
    connected: result.value !== null,
    freshness,
    determinesPrimaryState: false,
    limitations: 'Sólo se utiliza cuando existe estación, nivel y timestamp verificables.',
    qualityNote: 'No se sustituyen estaciones de forma silenciosa.',
  });
}

async function smnObservationSource(url: string | undefined, now: Date): Promise<Source> {
  if (!url) return blockedSource({
    id: 'smn-observations',
    name: 'Observaciones meteorológicas SMN',
    organizationId: 'smn',
    organizationName: 'Servicio Meteorológico Nacional',
    feedName: 'Observaciones meteorológicas SMN',
    kind: 'OFFICIAL_OBSERVATION',
    classification: 'BLOCKED_CREDENTIAL',
    contribution: 'La integración requiere una credencial oficial no disponible. No se extraen tokens desde HTML ni se elude autenticación.',
    url: 'https://www.smn.gob.ar/descarga-de-datos',
    now,
  });
  try {
    const result: ProviderResult<SmnObservationSummary> = await fetchSmnObservations(url);
    const observedAt = result.observedAt ?? result.fetchedAt;
    const freshness = freshnessFor(result.observedAt, now, 60 * 60_000, 6 * 60 * 60_000);
    return sourceBase({
      id: 'smn-observations',
      name: 'Observaciones meteorológicas SMN',
      organizationId: 'smn',
      organizationName: 'Servicio Meteorológico Nacional',
      feedName: 'Observaciones meteorológicas SMN',
      kind: 'OFFICIAL_OBSERVATION',
      status: sourceStatus(result),
      observedAt,
      fetchedAt: result.fetchedAt,
      validUntil: new Date(Date.parse(observedAt) + 6 * 60 * 60_000).toISOString(),
      contribution: result.value ? 'Observación meteorológica interpretada.' : 'Fuente no disponible.',
      url,
      connected: Boolean(result.value),
      freshness,
      determinesPrimaryState: false,
      limitations: 'No determina por sí sola el estado principal de alertas o hidrometría.',
    });
  } catch {
    return blockedSource({
      id: 'smn-observations',
      name: 'Observaciones meteorológicas SMN',
      organizationId: 'smn',
      organizationName: 'Servicio Meteorológico Nacional',
      feedName: 'Observaciones meteorológicas SMN',
      kind: 'OFFICIAL_OBSERVATION',
      classification: 'BLOCKED_CREDENTIAL',
      contribution: 'La credencial configurada no permitió obtener un contrato de datos utilizable.',
      url,
      now,
    });
  }
}

async function smnAlertFeed(url: string, now: Date): Promise<{ source: Source; alerts: readonly OfficialAlert[] }> {
  const result: ProviderResult<readonly SmnAlertSummary[]> = await fetchSmnAlerts(url);
  const observedAt = result.observedAt ?? result.fetchedAt;
  const freshness = freshnessFor(result.observedAt, now, 30 * 60_000, 12 * 60 * 60_000);
  const source = sourceBase({
    id: 'smn-alerts',
    name: 'Alertas oficiales SMN · CAP',
    organizationId: 'smn',
    organizationName: 'Servicio Meteorológico Nacional',
    feedName: 'Alertas oficiales SMN · CAP',
    kind: 'OFFICIAL_ALERT',
    status: sourceStatus(result),
    observedAt,
    fetchedAt: result.fetchedAt,
    validUntil: new Date(Date.parse(observedAt) + 12 * 60 * 60_000).toISOString(),
    contribution: result.value ? `${result.value.length} avisos o alertas normalizados con semántica CAP.` : 'El canal de alertas no respondió con un contenido utilizable.',
    url,
    connected: result.value !== null,
    freshness,
    determinesPrimaryState: true,
    limitations: 'La ausencia de alertas sólo se comunica cuando este feed está vigente y utilizable.',
  });
  return { source, alerts: Object.freeze((result.value ?? []).map((alert) => Object.freeze({ ...alert }))) };
}

async function nasaSource(now: Date): Promise<Source> {
  const result: ProviderResult<NasaGpmReading> = await fetchNasaGpm(NASA_GPM_URL);
  const connected = result.value !== null && Number.isFinite(result.value.value) && Number.isFinite(Date.parse(result.value.observedAt));
  const observedAt = connected ? result.value!.observedAt : result.fetchedAt;
  const freshness = connected ? freshnessFor(observedAt, now, 3 * 60 * 60_000, 12 * 60 * 60_000) : 'NO_DISPONIBLE';
  return sourceBase({
    id: 'nasa-gpm-imerg-early',
    name: 'NASA GPM IMERG Early',
    organizationId: 'nasa',
    organizationName: 'NASA',
    feedName: 'GPM IMERG Early',
    kind: 'SATELLITE_OBSERVATION',
    status: connected ? sourceStatus(result) : 'UNAVAILABLE',
    observedAt,
    fetchedAt: result.fetchedAt,
    validUntil: new Date(Date.parse(observedAt) + 12 * 60 * 60_000).toISOString(),
    contribution: connected ? `Muestra satelital válida en Santa Fe: ${result.value!.value.toFixed(2)} mm/h.` : `No se obtuvo una muestra local numérica válida (${result.errorClass ?? 'SIN_MUESTRA'}).`,
    url: connected ? result.value!.sourceUrl : `${NASA_GPM_URL}/query`,
    connected,
    classification: 'SUPPLEMENTARY',
    freshness,
    determinesPrimaryState: false,
    limitations: 'Estimación satelital suplementaria; no reemplaza observaciones oficiales locales ni determina el estado principal.',
    latencyMinutes: connected ? result.value!.latencyMinutes : undefined,
    resolution: connected ? result.value!.resolution : '0,1° / 30 minutos',
    uncertainty: connected ? result.value!.uncertainty : 'Sin muestra válida; no aporta un dato local.',
  });
}

function humanVerificationSources(now: Date): readonly Source[] {
  return Object.freeze([
    blockedSource({
      id: 'province-early-warning-page',
      name: 'Sistema de Alerta Temprana provincial',
      organizationId: 'santa-fe-province',
      organizationName: 'Gobierno de la Provincia de Santa Fe · Protección Civil',
      feedName: 'Canal humano de verificación provincial',
      kind: 'OFFICIAL_ALERT',
      classification: 'BLOCKED_NO_MACHINE_ENDPOINT',
      contribution: 'Página oficial de consulta humana. No se encontró un feed público estable para automatizar sin scraping frágil.',
      url: PROVINCE_WARNING_URL,
      now,
    }),
    blockedSource({
      id: 'cobem-public-page',
      name: 'COBEM · Gestión de Riesgo',
      organizationId: 'santa-fe-city',
      organizationName: 'Municipalidad de Santa Fe · COBEM',
      feedName: 'Canal humano de verificación municipal',
      kind: 'OFFICIAL_ALERT',
      classification: 'BLOCKED_NO_MACHINE_ENDPOINT',
      contribution: 'Página oficial y teléfonos de emergencia. No se presenta como feed automático.',
      url: COBEM_URL,
      now,
    }),
  ]);
}

function highestState(systems: readonly HydrologicalSystem[]): PublicState {
  const order: PublicState[] = ['UNKNOWN', 'NORMAL', 'VIGILANCIA', 'ALERTA', 'UMBRAL_EVACUACION_ALCANZADO', 'EVACUACION_OFICIAL'];
  return systems.map(systemState).reduce((current, next) => order.indexOf(next) > order.indexOf(current) ? next : current, 'UNKNOWN');
}

function alertAction(status: Snapshot['alertStatus'], alerts: readonly OfficialAlert[]): string {
  if (status === 'ALERTA_OFICIAL_ACTIVA') {
    const active = alerts.find((alert) => alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'));
    return active?.instruction || 'Consultá el aviso oficial vigente y seguí las indicaciones del organismo emisor.';
  }
  if (status === 'SIN_ALERTAS_OFICIALES_DETECTADAS') return 'Revisá la vigencia y la fuente antes de tomar decisiones; la situación puede cambiar.';
  if (status === 'VERIFICACION_DE_ALERTAS_DEGRADADA') return 'Verificá directamente en el Servicio Meteorológico Nacional y en Protección Civil.';
  return 'Las fuentes automáticas de alertas no están disponibles; verificá los canales oficiales.';
}

async function buildUncached(env: LiveDataEnv, now: Date): Promise<Snapshot> {
  if (!env.PORTS_HYDROMETER_JSON_URL) publishProviderBlock('ports-hydrometers', 'OFFICIAL_MACHINE_ENDPOINT_NOT_AVAILABLE');
  if (!env.SMN_OBSERVATIONS_JSON_URL) publishProviderBlock('smn-observations', 'CREDENTIAL_REQUIRED');
  const from = new Date(now.getTime() - 180 * 24 * 3_600_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
  const defaultWaterMl = (series: string) => `https://alerta.ina.gob.ar/a5/obs/puntual/series/${series}?timestart=${from}&timeend=${to}&format=waterml2`;

  const stationPromise = Promise.all(STATIONS.map((station) => stationSystem(station, now)));
  const smnAlertPromise = smnAlertFeed(env.SMN_ALERTS_JSON_URL ?? SMN_CAP_URL, now);
  const optionalPromise = Promise.all([
    waterMlSource(env.INA_WATERML_PARANA_URL ?? defaultWaterMl('30'), 'ina-waterml-parana', 'INA WaterML · Río Paraná, Santa Fe', now),
    waterMlSource(env.INA_WATERML_SALADO_URL ?? defaultWaterMl('3044'), 'ina-waterml-salado', 'INA WaterML · Río Salado, Santo Tomé', now),
    portsSource(env.PORTS_HYDROMETER_JSON_URL, now),
    smnObservationSource(env.SMN_OBSERVATIONS_JSON_URL, now),
    nasaSource(now),
  ]);

  const [stationResults, smnAlerts, optionalSources] = await Promise.all([stationPromise, smnAlertPromise, optionalPromise]);
  const systems = Object.freeze(stationResults.map((item) => item.system));
  const sources = Object.freeze([
    ...stationResults.map((item) => item.source),
    ...optionalSources,
    smnAlerts.source,
    ...humanVerificationSources(now),
  ]);
  const alerts = Object.freeze(smnAlerts.alerts.filter((alert) => alert.appliesToSantaFe));
  const alertStatus = alertVerificationState(smnAlerts.source, alerts);
  const primary = systems.find((item) => item.id === 'parana-santa-fe' && item.available) ?? systems.find((item) => item.available);

  if (!primary) {
    return Object.freeze({
      ...unavailableSnapshot,
      id: `unavailable-${now.toISOString()}`,
      generatedAt: now.toISOString(),
      previousSnapshotAt: now.toISOString(),
      validUntil: new Date(now.getTime() + 15 * 60_000).toISOString(),
      alertStatus,
      alerts,
      sourceOrganizations: ORGANIZATIONS,
      sources,
      timeline: timelineFor(systems, alerts, sources, now),
      serviceStatus: { worker: 'OPERATIONAL' as const, api: 'OPERATIONAL' as const, checkedAt: now.toISOString(), note: 'El servicio técnico responde; esto no prueba vigencia ni ausencia de peligro.' },
      systems,
      recommendedAction: alertAction(alertStatus, alerts),
    });
  }

  const freshness = highestFreshness(systems);
  const status: DataStatus = dataStatusForFreshness(freshness);
  const state = highestState(systems);
  const delta24h = primary.delta24h ?? 0;
  const direction: ChangeItem['direction'] = primary.delta24h === null ? 'UNKNOWN' : delta24h > 0.01 ? 'UP' : delta24h < -0.01 ? 'DOWN' : 'SAME';
  const action = alertAction(alertStatus, alerts);
  const nasa = sources.find((source) => source.id === 'nasa-gpm-imerg-early');
  const contradictions = Object.freeze(systems
    .filter((system) => system.available && system.dataStatus === 'STALE')
    .map((system) => Object.freeze({
      id: `freshness:${system.id}`,
      title: `Medición con vigencia limitada: ${system.label}`,
      signals: Object.freeze([`Observado: ${system.observedAt ?? 'sin fecha'}`, `Estado: ${system.freshness ?? 'NO_DISPONIBLE'}`]),
      result: 'UNKNOWN' as const,
      explanation: 'La medición se conserva como último dato disponible, pero no permite inferir ausencia de riesgo.',
    })));

  return Object.freeze({
    schemaVersion: '1.0',
    id: `public-safety-${now.toISOString()}`,
    mode: 'LIVE',
    dataStatus: status,
    freshness,
    generatedAt: now.toISOString(),
    previousSnapshotAt: new Date(now.getTime() - 15 * 60_000).toISOString(),
    state,
    stateLabel: stateLabel(state),
    summary: `${primary.label}: ${primary.currentMetres?.toFixed(2)} m. Se muestran por separado la observación, su recepción, la vigencia y el estado de las fuentes.`,
    dominantSourceId: primary.sourceId,
    validUntil: new Date(now.getTime() + 15 * 60_000).toISOString(),
    recommendedAction: action,
    emergencyDisclaimer: 'SOS Santa Fe es un servicio independiente que organiza fuentes públicas oficiales. No reemplaza al 911, 103 ni a los organismos competentes. Un umbral numérico no constituye una orden de evacuación.',
    alertStatus,
    alerts,
    timeline: timelineFor(systems, alerts, sources, now),
    sourceOrganizations: ORGANIZATIONS,
    serviceStatus: Object.freeze({ worker: 'OPERATIONAL', api: 'OPERATIONAL', checkedAt: now.toISOString(), note: 'La API está operativa; este estado técnico no garantiza vigencia, cobertura ni ausencia de alertas.' }),
    changes: Object.freeze([{ id: 'primary-24h', label: primary.label, direction, detail: primary.delta24h === null ? 'Sin comparación de 24 horas' : `${delta24h >= 0 ? '+' : ''}${delta24h.toFixed(2)} m en 24 horas` }]),
    systems,
    river: Object.freeze({
      systemId: primary.id,
      available: true,
      dataStatus: primary.dataStatus,
      stationName: primary.stationName,
      currentMetres: primary.currentMetres ?? 0,
      delta1h: primary.delta1h ?? 0,
      delta6h: primary.delta6h ?? 0,
      delta24h,
      trend: primary.trend,
      observedAt: primary.observedAt ?? now.toISOString(),
      fetchedAt: primary.fetchedAt ?? now.toISOString(),
      validUntil: primary.validUntil ?? now.toISOString(),
      sourceId: primary.sourceId,
      sourceName: primary.sourceName,
      points: primary.points,
      forecastPoints: Object.freeze([]),
      thresholds: primary.thresholds,
    }),
    rain: Object.freeze({
      available: nasa?.connected === true,
      dataStatus: nasa?.freshness ? dataStatusForFreshness(nasa.freshness) : 'UNAVAILABLE',
      accumulated1hMm: 0,
      accumulated24hMm: 0,
      forecast: nasa?.connected ? 'Estimación satelital suplementaria disponible; no se presenta como acumulado local ni pronóstico.' : 'No hay una muestra satelital local válida disponible.',
      observedAt: nasa?.observedAt ?? now.toISOString(),
      fetchedAt: nasa?.fetchedAt ?? now.toISOString(),
      validUntil: nasa?.validUntil ?? now.toISOString(),
      sourceId: 'nasa-gpm-imerg-early',
      points: Object.freeze([]),
    }),
    sources,
    contradictions,
    shelters: Object.freeze([]),
    actions: Object.freeze(['Consultá la alerta oficial y su vigencia.', 'Llamá al servicio de emergencias correspondiente ante peligro inmediato.']),
    messages: Object.freeze([]),
  });
}

export async function buildLiveSnapshot(env: LiveDataEnv, now = new Date()): Promise<Snapshot> {
  const key = await configKey(env);
  const cached = await readSnapshotCache(key, now);
  if (cached) return cached;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const operation = buildUncached(env, now)
    .then(async (snapshot) => { await writeSnapshotCache(key, snapshot); return snapshot; })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, operation);
  return operation;
}

export function liveProviderHealth() { return providerHealth(); }
