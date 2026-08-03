import { unavailableSnapshot } from '../data/unavailable-snapshot';
import type { DataStatus, HydrologicalSystem, PublicState, RiverPoint, RiverThreshold, Snapshot, Source } from '../domain/snapshot';

export interface LiveDataEnv {
  readonly INA_WATERML_PARANA_URL?: string;
  readonly INA_WATERML_SALADO_URL?: string;
  readonly PORTS_HYDROMETER_JSON_URL?: string;
  readonly SMN_OBSERVATIONS_JSON_URL?: string;
  readonly SMN_ALERTS_JSON_URL?: string;
}

interface CachedPayload { readonly fetchedAt: string; readonly payload: unknown }
interface ProviderResult<T> { readonly value: T | null; readonly status: 'FRESH' | 'STALE' | 'UNAVAILABLE'; readonly fetchedAt: string; readonly error?: string }

const ALLOWED_HOSTS = new Set(['alerta.ina.gob.ar', 'ws2.smn.gob.ar', 'maps.disasters.nasa.gov', 'www.argentina.gob.ar']);
const INA_BASE = 'https://alerta.ina.gob.ar/pub/datos/datos';
const FRESH_SECONDS = 15 * 60;
const STALE_SECONDS = 48 * 60 * 60;
const TIMEOUT_MS = 5_000;

const STATIONS = Object.freeze([
  Object.freeze({ id: 'parana-santa-fe', label: 'Sistema Paraná', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30', seriesId: '30', low: 2, alert: 5.3, evacuation: 5.7 }),
  Object.freeze({ id: 'salado-santo-tome', label: 'Sistema Salado', watercourse: 'Río Salado', stationName: 'Santo Tomé', stationCode: '1679', seriesId: '3044', low: 0, alert: 4.7, evacuation: null }),
]);

function allowedUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error('PROVIDER_URL_NOT_ALLOWED');
  return url;
}

function cacheApi(): Cache | null {
  return typeof caches === 'undefined' ? null : caches.default;
}

async function readCached(key: URL): Promise<CachedPayload | null> {
  const cache = cacheApi();
  if (!cache) return null;
  const response = await cache.match(new Request(key));
  if (!response) return null;
  try { return await response.json() as CachedPayload; } catch { return null; }
}

async function writeCached(key: URL, value: CachedPayload): Promise<void> {
  const cache = cacheApi();
  if (!cache) return;
  await cache.put(new Request(key), new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${STALE_SECONDS}` } }));
}

async function fetchJson(rawUrl: string, cacheNamespace: string): Promise<ProviderResult<unknown>> {
  const url = allowedUrl(rawUrl);
  const cacheKey = new URL(`https://cache.sos-sf.invalid/${encodeURIComponent(cacheNamespace)}`);
  const cached = await readCached(cacheKey);
  const cachedAge = cached ? Date.now() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
  if (cached && cachedAge <= FRESH_SECONDS * 1000) return { value: cached.payload, status: 'FRESH', fetchedAt: cached.fetchedAt };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json, application/geo+json, application/xml;q=0.5' }, cf: { cacheTtl: 0, cacheEverything: false } });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? '';
    if (!contentType.includes('json') && !contentType.includes('geo+json')) throw new Error('PROVIDER_NOT_MACHINE_READABLE_JSON');
    const payload = await response.json() as unknown;
    const fetchedAt = new Date().toISOString();
    await writeCached(cacheKey, { fetchedAt, payload });
    return { value: payload, status: 'FRESH', fetchedAt };
  } catch (error) {
    if (cached && cachedAge <= STALE_SECONDS * 1000) return { value: cached.payload, status: 'STALE', fetchedAt: cached.fetchedAt, error: error instanceof Error ? error.message : 'PROVIDER_FAILED' };
    return { value: null, status: 'UNAVAILABLE', fetchedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'PROVIDER_FAILED' };
  } finally {
    clearTimeout(timer);
  }
}

function recordsFrom(value: unknown): readonly Record<string, unknown>[] {
  const seen = new Set<unknown>();
  const visit = (node: unknown): readonly Record<string, unknown>[] => {
    if (seen.has(node)) return [];
    if (typeof node === 'object' && node !== null) seen.add(node);
    if (Array.isArray(node)) {
      const records = node.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item));
      if (records.some((item) => ['valor', 'value', 'metres'].some((key) => key in item))) return records;
      for (const item of node) { const nested = visit(item); if (nested.length) return nested; }
    } else if (typeof node === 'object' && node !== null) {
      for (const nested of Object.values(node as Record<string, unknown>)) { const records = visit(nested); if (records.length) return records; }
    }
    return [];
  };
  return visit(value);
}

function numberValue(record: Record<string, unknown>): number | null {
  for (const key of ['valor', 'value', 'metres', 'valor_num']) {
    const raw = record[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number.NaN;
    if (Number.isFinite(value) && Math.abs(value) < 100) return value;
  }
  return null;
}

function timeValue(record: Record<string, unknown>): string | null {
  for (const key of ['timestart', 'timeStart', 'fecha', 'timestamp', 'at']) {
    const raw = record[key];
    if (typeof raw === 'string' && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  }
  return null;
}

function normalizePoints(payload: unknown): readonly RiverPoint[] {
  const unique = new Map<string, RiverPoint>();
  for (const record of recordsFrom(payload)) {
    const metres = numberValue(record);
    const at = timeValue(record);
    if (metres === null || at === null) continue;
    unique.set(at, Object.freeze({ at, metres, measured: true }));
  }
  return Object.freeze([...unique.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-96));
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
    ...(station.evacuation === null ? [] : [Object.freeze({ id: 'EVACUACION' as const, label: 'Evacuación', metres: station.evacuation })]),
  ]);
}

function systemState(system: HydrologicalSystem): PublicState {
  if (!system.available || system.currentMetres === null) return 'UNKNOWN';
  const evacuation = system.thresholds.find((item) => item.id === 'EVACUACION');
  const alert = system.thresholds.find((item) => item.id === 'ALERTA');
  const watch = system.thresholds.find((item) => item.id === 'VIGILANCIA');
  if (evacuation && system.currentMetres >= evacuation.metres) return 'EVACUACION_OFICIAL';
  if (alert && system.currentMetres >= alert.metres) return 'ALERTA';
  if (watch && system.currentMetres >= watch.metres) return 'VIGILANCIA';
  return 'NORMAL';
}

function stateLabel(state: PublicState): string {
  if (state === 'EVACUACION_OFICIAL') return 'Umbral de evacuación alcanzado';
  if (state === 'ALERTA') return 'Umbral de alerta alcanzado';
  if (state === 'VIGILANCIA') return 'Vigilancia';
  if (state === 'NORMAL') return 'Sin umbral de alerta alcanzado';
  return 'Sin datos en vivo';
}

async function stationSystem(station: typeof STATIONS[number], now: Date): Promise<{ system: HydrologicalSystem; source: Source }> {
  const start = new Date(now.getTime() - 72 * 3_600_000).toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
  const url = `${INA_BASE}&timeStart=${start}&timeEnd=${end}&seriesId=${station.seriesId}&format=json`;
  const result = await fetchJson(url, `ina-series-${station.seriesId}`);
  const points = result.value === null ? [] : normalizePoints(result.value);
  const latest = points.at(-1);
  const age = latest ? now.getTime() - Date.parse(latest.at) : Number.POSITIVE_INFINITY;
  const status: DataStatus = !latest ? 'UNAVAILABLE' : result.status === 'STALE' || age > 12 * 3_600_000 ? 'STALE' : 'LIVE';
  const sourceStatus = status === 'LIVE' ? 'FRESH' : status === 'STALE' ? 'STALE' : 'UNAVAILABLE';
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
  const source: Source = Object.freeze({
    id: system.sourceId,
    name: system.sourceName,
    kind: 'OFFICIAL_OBSERVATION',
    status: sourceStatus,
    observedAt: latest?.at ?? result.fetchedAt,
    validUntil: new Date(Date.parse(latest?.at ?? result.fetchedAt) + 12 * 3_600_000).toISOString(),
    contribution: `${station.watercourse}, estación ${station.stationName}, serie ${station.seriesId}.`,
    official: true,
    url: 'https://alerta.ina.gob.ar/pub/datos/',
  });
  return { system, source };
}

async function optionalJsonSource(url: string | undefined, id: string, name: string, kind: Source['kind']): Promise<Source> {
  if (!url) return Object.freeze({ id, name, kind, status: 'UNAVAILABLE', observedAt: new Date(0).toISOString(), validUntil: new Date(0).toISOString(), contribution: 'Endpoint machine-readable no configurado; no se usa HTML como reemplazo.', official: true });
  const result = await fetchJson(url, id);
  return Object.freeze({ id, name, kind, status: result.status === 'FRESH' ? 'FRESH' : result.status === 'STALE' ? 'STALE' : 'UNAVAILABLE', observedAt: result.fetchedAt, validUntil: new Date(Date.parse(result.fetchedAt) + 60 * 60_000).toISOString(), contribution: result.value === null ? 'Fuente temporalmente no disponible.' : 'Fuente machine-readable consultada y validada como JSON.', official: true, url: allowedUrl(url).origin });
}

async function nasaRainSource(): Promise<Source> {
  const query = new URL('https://maps.disasters.nasa.gov/ags03/rest/services/NRT_Latest/GPM_NRT_30min_Latest/ImageServer/identify');
  query.searchParams.set('geometry', JSON.stringify({ x: -60.7, y: -31.63, spatialReference: { wkid: 4326 } }));
  query.searchParams.set('geometryType', 'esriGeometryPoint');
  query.searchParams.set('returnGeometry', 'false');
  query.searchParams.set('f', 'json');
  const result = await fetchJson(query.toString(), 'nasa-gpm-santa-fe');
  return Object.freeze({ id: 'nasa-gpm-imerg-early', name: 'NASA GPM IMERG Early', kind: 'SATELLITE_OBSERVATION', status: result.status === 'FRESH' ? 'FRESH' : result.status === 'STALE' ? 'STALE' : 'UNAVAILABLE', observedAt: result.fetchedAt, validUntil: new Date(Date.parse(result.fetchedAt) + 3 * 3_600_000).toISOString(), contribution: result.value === null ? 'Estimación satelital suplementaria no disponible.' : 'Estimación satelital suplementaria; no reemplaza pluviómetros de superficie.', official: true, url: 'https://maps.disasters.nasa.gov/', latencyMinutes: 240, resolution: 'aprox. 0,1° / 30 minutos' });
}

function highestState(systems: readonly HydrologicalSystem[]): PublicState {
  const order: PublicState[] = ['UNKNOWN', 'NORMAL', 'VIGILANCIA', 'ALERTA', 'EVACUACION_OFICIAL'];
  return systems.map(systemState).reduce((current, next) => order.indexOf(next) > order.indexOf(current) ? next : current, 'UNKNOWN');
}

export async function buildLiveSnapshot(env: LiveDataEnv, now = new Date()): Promise<Snapshot> {
  const stationResults = await Promise.all(STATIONS.map((station) => stationSystem(station, now)));
  const systems = Object.freeze(stationResults.map((item) => item.system));
  const sources = [
    ...stationResults.map((item) => item.source),
    await optionalJsonSource(env.INA_WATERML_PARANA_URL, 'ina-waterml-parana', 'INA WaterOneFlow · Paraná', 'OFFICIAL_OBSERVATION'),
    await optionalJsonSource(env.INA_WATERML_SALADO_URL, 'ina-waterml-salado', 'INA WaterOneFlow · Salado', 'OFFICIAL_OBSERVATION'),
    await optionalJsonSource(env.PORTS_HYDROMETER_JSON_URL, 'ports-hydrometers', 'Agencia Nacional de Puertos y Navegación', 'OFFICIAL_OBSERVATION'),
    await optionalJsonSource(env.SMN_OBSERVATIONS_JSON_URL, 'smn-observations', 'Servicio Meteorológico Nacional · observaciones', 'OFFICIAL_OBSERVATION'),
    await optionalJsonSource(env.SMN_ALERTS_JSON_URL, 'smn-alerts', 'Servicio Meteorológico Nacional · alertas', 'OFFICIAL_ALERT'),
    await nasaRainSource(),
  ] as const;
  const primary = systems.find((item) => item.id === 'parana-santa-fe' && item.available) ?? systems.find((item) => item.available);
  if (!primary) return Object.freeze({ ...unavailableSnapshot, generatedAt: now.toISOString(), previousSnapshotAt: now.toISOString(), validUntil: new Date(now.getTime() + 15 * 60_000).toISOString(), systems, sources: Object.freeze(sources) });
  const status: DataStatus = systems.some((item) => item.dataStatus === 'STALE') ? 'STALE' : 'LIVE';
  const state = highestState(systems);
  const delta24h = primary.delta24h ?? 0;
  const action = state === 'EVACUACION_OFICIAL' || state === 'ALERTA' ? 'Seguí instrucciones oficiales y evitá zonas ribereñas o anegadas.' : 'Mantenete informado mediante fuentes oficiales y revisá tu plan familiar.';
  return Object.freeze({
    schemaVersion: '1.0',
    id: `live-${now.toISOString()}`,
    mode: 'LIVE',
    dataStatus: status,
    generatedAt: now.toISOString(),
    previousSnapshotAt: new Date(now.getTime() - 15 * 60_000).toISOString(),
    state,
    stateLabel: stateLabel(state),
    summary: `${primary.watercourse}, estación ${primary.stationName}: ${primary.currentMetres?.toFixed(2)} m. Cada sistema se presenta en su propia escala.`,
    dominantSourceId: primary.sourceId,
    validUntil: new Date(now.getTime() + 15 * 60_000).toISOString(),
    recommendedAction: action,
    emergencyDisclaimer: 'SOS Santa Fe agrega fuentes públicas y no reemplaza al 911, 103 ni a los organismos oficiales.',
    changes: Object.freeze([{ id: 'primary-24h', label: `${primary.watercourse} · ${primary.stationName}`, direction: delta24h > 0.01 ? 'UP' : delta24h < -0.01 ? 'DOWN' : 'SAME', detail: primary.delta24h === null ? 'Sin comparación de 24 horas' : `${delta24h >= 0 ? '+' : ''}${Math.round(delta24h * 100)} cm en 24 horas` }]),
    systems,
    river: Object.freeze({ systemId: primary.id, available: true, dataStatus: primary.dataStatus, stationName: primary.stationName, currentMetres: primary.currentMetres ?? 0, delta1h: primary.delta1h ?? 0, delta6h: primary.delta6h ?? 0, delta24h, trend: primary.trend, observedAt: primary.observedAt ?? now.toISOString(), sourceId: primary.sourceId, sourceName: primary.sourceName, points: primary.points, forecastPoints: Object.freeze([]), thresholds: primary.thresholds }),
    rain: Object.freeze({ available: false, dataStatus: 'UNAVAILABLE', accumulated1hMm: 0, accumulated24hMm: 0, forecast: 'La estimación NASA GPM se conserva como fuente suplementaria y no se convierte en acumulado local sin validación.', observedAt: sources.at(-1)?.observedAt ?? now.toISOString(), sourceId: 'nasa-gpm-imerg-early', points: Object.freeze([]) }),
    sources: Object.freeze(sources),
    contradictions: Object.freeze([]),
    shelters: Object.freeze([]),
    actions: Object.freeze(['Consultá alertas y recomendaciones oficiales.', 'Tené disponibles los teléfonos esenciales.']),
    messages: Object.freeze([]),
  });
}
