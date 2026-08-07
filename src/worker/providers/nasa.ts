import { fetchProvider, type ProviderPolicy, type ProviderResult } from './core.ts';

export interface NasaGpmReading {
  readonly observedAt: string;
  readonly value: number;
  readonly latencyMinutes: number;
  readonly resolution: string;
  readonly uncertainty: string;
  readonly sourceUrl: string;
  readonly objectId: number;
}

interface RasterReference {
  readonly objectId: number;
  readonly observedAt: string;
}

const HOST = 'gis.earthdata.nasa.gov';
const QUERY_PATH = /^\/image\/rest\/services\/GESDISC\/GPM_3IMERGHHE\/ImageServer\/query$/;
const SAMPLE_PATH = /^\/image\/rest\/services\/GESDISC\/GPM_3IMERGHHE\/ImageServer\/getSamples$/;
const QUERY_POLICY: ProviderPolicy = Object.freeze({
  id: 'nasa-gpm-imerg-early',
  hosts: Object.freeze([HOST]),
  paths: Object.freeze([QUERY_PATH]),
  contentTypes: Object.freeze(['application/json']),
  timeoutMs: 16_000,
  maxBytes: 500_000,
  refreshMs: 5 * 60_000,
  freshMs: 15 * 60_000,
  staleMs: 0,
});
const SAMPLE_POLICY: ProviderPolicy = Object.freeze({
  id: 'nasa-gpm-imerg-early',
  hosts: Object.freeze([HOST]),
  paths: Object.freeze([SAMPLE_PATH]),
  contentTypes: Object.freeze(['application/json']),
  timeoutMs: 12_000,
  maxBytes: 500_000,
  refreshMs: 5 * 60_000,
  freshMs: 15 * 60_000,
  staleMs: 0,
});

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  if (!normalized || /^(?:nodata|null|nan)$/i.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function unavailableFrom<T, U>(result: ProviderResult<T>): ProviderResult<U> {
  return Object.freeze({
    value: null,
    status: result.status,
    fetchedAt: result.fetchedAt,
    observedAt: result.observedAt,
    errorClass: result.errorClass,
    fromCache: result.fromCache,
  });
}

export async function fetchNasaGpm(baseUrl: string): Promise<ProviderResult<NasaGpmReading>> {
  const queryUrl = new URL(`${baseUrl.replace(/\/$/, '')}/query`);
  queryUrl.searchParams.set('where', '1=1');
  queryUrl.searchParams.set('outFields', 'OBJECTID,StdTime');
  queryUrl.searchParams.set('orderByFields', 'StdTime DESC');
  queryUrl.searchParams.set('resultRecordCount', '1');
  queryUrl.searchParams.set('returnGeometry', 'false');
  queryUrl.searchParams.set('f', 'json');

  const latest = await fetchProvider<RasterReference>(queryUrl.toString(), QUERY_POLICY, (body) => {
    const payload = JSON.parse(body) as unknown;
    if (!record(payload) || record(payload.error)) throw new Error('NASA_QUERY_ERROR');
    const feature = Array.isArray(payload.features) ? payload.features[0] : null;
    const attributes = record(feature) && record(feature.attributes) ? feature.attributes : null;
    const objectId = finite(attributes?.objectid ?? attributes?.OBJECTID);
    const stdTime = finite(attributes?.stdtime ?? attributes?.StdTime);
    if (objectId === null || !Number.isInteger(objectId) || objectId <= 0 || stdTime === null || stdTime < 1_000_000_000_000) {
      throw new Error('NASA_QUERY_SCHEMA');
    }
    const observedAt = new Date(stdTime).toISOString();
    return { value: Object.freeze({ objectId, observedAt }), observedAt };
  });
  if (!latest.value) return unavailableFrom<RasterReference, NasaGpmReading>(latest);

  const sampleUrl = new URL(`${baseUrl.replace(/\/$/, '')}/getSamples`);
  sampleUrl.searchParams.set('geometry', JSON.stringify({ x: -60.7, y: -31.63, spatialReference: { wkid: 4326 } }));
  sampleUrl.searchParams.set('geometryType', 'esriGeometryPoint');
  sampleUrl.searchParams.set('returnFirstValueOnly', 'true');
  sampleUrl.searchParams.set('outFields', 'OBJECTID,StdTime');
  sampleUrl.searchParams.set('mosaicRule', JSON.stringify({
    mosaicMethod: 'esriMosaicLockRaster',
    lockRasterIds: [latest.value.objectId],
  }));
  sampleUrl.searchParams.set('f', 'json');

  const raster = latest.value;
  return fetchProvider<NasaGpmReading>(sampleUrl.toString(), SAMPLE_POLICY, (body) => {
    const payload = JSON.parse(body) as unknown;
    if (!record(payload) || record(payload.error) || !Array.isArray(payload.samples) || payload.samples.length === 0) {
      throw new Error('NASA_SAMPLE_MISSING');
    }
    const sample = payload.samples.find(record);
    if (!sample) throw new Error('NASA_SAMPLE_SCHEMA');
    const rasterId = finite(sample.rasterId ?? sample.rasterID ?? (record(sample.attributes) ? sample.attributes.objectid ?? sample.attributes.OBJECTID : null));
    if (rasterId !== null && rasterId !== raster.objectId) throw new Error('NASA_SAMPLE_RASTER_MISMATCH');
    const value = finite(sample.value ?? sample.pixelValue ?? sample.values);
    if (value === null) throw new Error('NASA_SAMPLE_VALUE_MISSING');
    const latencyMinutes = Math.max(0, Math.round((Date.now() - Date.parse(raster.observedAt)) / 60_000));
    return {
      value: Object.freeze({
        observedAt: raster.observedAt,
        value,
        latencyMinutes,
        resolution: '0,1° / 30 minutos',
        uncertainty: 'IMERG Early V07 es una estimación satelital suplementaria; no reemplaza pluviómetros ni niveles hidrométricos locales.',
        sourceUrl: sampleUrl.toString(),
        objectId: raster.objectId,
      }),
      observedAt: raster.observedAt,
    };
  });
}
