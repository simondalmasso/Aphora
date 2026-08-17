import { fetchProvider, type ProviderPolicy, type ProviderResult } from './core.ts';
import { googleFreshness, type GoogleFloodSignal, type GoogleGaugeCandidate, type GoogleGaugeMapping, type GoogleGaugeValueUnit } from '../../domain/google-flood.ts';

const BASE = 'https://floodforecasting.googleapis.com';
const JSON_TYPES = Object.freeze(['application/json']);

function policy(id: string, refreshMs: number): ProviderPolicy {
  return {
    id,
    hosts: ['floodforecasting.googleapis.com'],
    paths: [/^\/v1\/(gauges|gaugeModels|floodStatus|serializedPolygons|flashFloods)(?:[:/]|$)/],
    contentTypes: JSON_TYPES,
    timeoutMs: 4_000,
    maxBytes: 1_500_000,
    refreshMs,
    freshMs: refreshMs,
    staleMs: 24 * 60 * 60_000,
  };
}

function auth(apiKey: string, method: 'GET' | 'POST' = 'GET', body?: string) {
  if (!apiKey.trim()) throw new Error('GOOGLE_FLOOD_CREDENTIAL_REQUIRED');
  return {
    method,
    ...(body === undefined ? {} : { body }),
    headers: { 'x-goog-api-key': apiKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  } as const;
}

function json(body: string): Record<string, unknown> {
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('GOOGLE_FLOOD_PARSE');
  return parsed as Record<string, unknown>;
}
function validIso(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
function newest(values: readonly (string | null)[], fallback: string): string {
  const items = values.filter((value): value is string => Boolean(value)).sort((a, b) => Date.parse(b) - Date.parse(a));
  return items[0] ?? fallback;
}
function location(value: unknown): { latitude: number; longitude: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return typeof row.latitude === 'number' && Number.isFinite(row.latitude) && typeof row.longitude === 'number' && Number.isFinite(row.longitude)
    ? { latitude: row.latitude, longitude: row.longitude }
    : null;
}

export interface GoogleGaugeModelRaw {
  readonly gaugeId: string;
  readonly gaugeModelId: string;
  readonly gaugeValueUnit: GoogleGaugeValueUnit;
  readonly qualityVerified: boolean;
  readonly thresholds?: { readonly warningLevel?: number; readonly dangerLevel?: number; readonly extremeDangerLevel?: number };
}
export interface GoogleFloodStatusRaw {
  readonly gaugeId: string;
  readonly qualityVerified: boolean;
  readonly issuedTime: string;
  readonly forecastTimeRange?: { readonly start?: string; readonly end?: string };
  readonly forecastChange?: { readonly valueChange?: { readonly lowerBound?: number; readonly upperBound?: number } };
  readonly forecastTrend?: string;
  readonly mapInferenceType?: string;
  readonly severity?: string;
  readonly inundationMapSet?: {
    readonly inundationMapType?: string;
    readonly inundationMaps?: readonly { readonly level?: string; readonly serializedPolygonId?: string }[];
  };
  readonly source?: string;
}

export async function searchGoogleGaugesByArea(
  apiKey: string,
  loop: { readonly vertices: readonly { readonly latitude: number; readonly longitude: number }[] },
): Promise<ProviderResult<readonly GoogleGaugeCandidate[]>> {
  const requestBody = JSON.stringify({ pageSize: 200, loop, includeNonQualityVerified: true, includeGaugesWithoutHydroModel: true });
  return fetchProvider(
    `${BASE}/v1/gauges:searchGaugesByArea`,
    policy('google-flood-gauges', 24 * 60 * 60_000),
    (body) => {
      const payload = json(body);
      const list = Array.isArray(payload.gauges) ? payload.gauges : [];
      const gauges = list.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        const gaugeLocation = location(row.location);
        if (!gaugeLocation || typeof row.gaugeId !== 'string') return [];
        return [Object.freeze({
          gaugeId: row.gaugeId,
          siteName: typeof row.siteName === 'string' ? row.siteName : '',
          river: typeof row.riverName === 'string' ? row.riverName : '',
          source: typeof row.source === 'string' ? row.source : 'Google Flood Forecasting',
          location: gaugeLocation,
          countryCode: typeof row.countryCode === 'string' ? row.countryCode : '',
          qualityVerified: row.qualityVerified === true,
          hasModel: row.hasModel === true,
        })];
      });
      return { value: Object.freeze(gauges), observedAt: new Date().toISOString() };
    },
    auth(apiKey, 'POST', requestBody),
  );
}

export async function getGoogleGaugeModel(apiKey: string, gaugeId: string): Promise<ProviderResult<GoogleGaugeModelRaw>> {
  const id = encodeURIComponent(gaugeId);
  return fetchProvider(
    `${BASE}/v1/gaugeModels/${id}`,
    policy(`google-flood-model-${id}`, 24 * 60 * 60_000),
    (body) => {
      const payload = json(body);
      if (typeof payload.gaugeId !== 'string' || typeof payload.gaugeModelId !== 'string') throw new Error('GOOGLE_MODEL_PARSE');
      return { value: payload as unknown as GoogleGaugeModelRaw, observedAt: new Date().toISOString() };
    },
    auth(apiKey),
  );
}

export async function queryGoogleGaugeForecasts(
  apiKey: string,
  gaugeIds: readonly string[],
  issuedTimeStart?: string,
  issuedTimeEnd?: string,
): Promise<ProviderResult<Record<string, unknown>>> {
  if (!gaugeIds.length || gaugeIds.length > 20) throw new Error('GOOGLE_GAUGE_BATCH_OUT_OF_RANGE');
  const url = new URL(`${BASE}/v1/gauges:queryGaugeForecasts`);
  for (const id of gaugeIds) url.searchParams.append('gaugeIds', id);
  if (issuedTimeStart) url.searchParams.set('issuedTimeStart', issuedTimeStart);
  if (issuedTimeEnd) url.searchParams.set('issuedTimeEnd', issuedTimeEnd);
  return fetchProvider(
    url.toString(),
    policy('google-flood-forecasts', 30 * 60_000),
    (body) => ({ value: json(body), observedAt: issuedTimeEnd ?? new Date().toISOString() }),
    auth(apiKey),
  );
}

export async function searchLatestGoogleFloodStatusByArea(
  apiKey: string,
  loop: { readonly vertices: readonly { readonly latitude: number; readonly longitude: number }[] },
): Promise<ProviderResult<readonly GoogleFloodStatusRaw[]>> {
  const requestBody = JSON.stringify({ pageSize: 200, loop, includeNonQualityVerified: true });
  return fetchProvider(
    `${BASE}/v1/floodStatus:searchLatestFloodStatusByArea`,
    policy('google-flood-status', 30 * 60_000),
    (body) => {
      const payload = json(body);
      const statuses = (Array.isArray(payload.floodStatuses) ? payload.floodStatuses : []).filter((item): item is GoogleFloodStatusRaw => (
        Boolean(item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).gaugeId === 'string' && validIso((item as Record<string, unknown>).issuedTime))
      ));
      return { value: Object.freeze(statuses), observedAt: newest(statuses.map((status) => validIso(status.issuedTime)), new Date().toISOString()) };
    },
    auth(apiKey, 'POST', requestBody),
  );
}

export async function fetchGoogleSerializedPolygon(apiKey: string, polygonId: string): Promise<ProviderResult<Record<string, unknown>>> {
  const id = encodeURIComponent(polygonId);
  return fetchProvider(
    `${BASE}/v1/serializedPolygons/${id}`,
    policy(`google-flood-polygon-${id}`, 60 * 60_000),
    (body) => ({ value: json(body), observedAt: new Date().toISOString() }),
    auth(apiKey),
  );
}

export async function searchGoogleFlashFloods(apiKey: string, countryCode = 'AR'): Promise<ProviderResult<readonly Record<string, unknown>[]>> {
  const requestBody = JSON.stringify({ countryCodes: [countryCode], pageSize: 200 });
  return fetchProvider(
    `${BASE}/v1/flashFloods:search`,
    policy('google-flash-floods', 30 * 60_000),
    (body) => {
      const payload = json(body);
      const values = (Array.isArray(payload.flashFloods) ? payload.flashFloods : Array.isArray(payload.events) ? payload.events : [])
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
      return { value: Object.freeze(values), observedAt: newest(values.map((value) => validIso(value.forecastIssueTime)), new Date().toISOString()) };
    },
    auth(apiKey, 'POST', requestBody),
  );
}

function unit(value: unknown): GoogleGaugeValueUnit | null {
  return value === 'METERS' || value === 'CUBIC_METERS_PER_SECOND' || value === 'GAUGE_VALUE_UNIT_UNSPECIFIED' ? value : null;
}

export function normalizeGoogleFloodSignal(
  gauge: GoogleGaugeCandidate,
  mapping: GoogleGaugeMapping,
  model: GoogleGaugeModelRaw | null,
  status: GoogleFloodStatusRaw,
  retrievedAt: string,
): GoogleFloodSignal | null {
  const issued = status.issuedTime;
  const validFrom = validIso(status.forecastTimeRange?.start) ?? issued;
  const validTo = validIso(status.forecastTimeRange?.end) ?? issued;
  if (!validIso(issued) || !validIso(validFrom) || !validIso(validTo)) return null;
  const maps = status.inundationMapSet?.inundationMaps ?? [];
  const polygonIds = Object.freeze(maps.map((item) => item.serializedPolygonId).filter((value): value is string => typeof value === 'string' && value.length > 0).slice(0, 6));
  const mapType = status.inundationMapSet?.inundationMapType;
  const change = status.forecastChange?.valueChange;
  const forecastChange = change && typeof change.lowerBound === 'number' && typeof change.upperBound === 'number'
    ? Object.freeze({ lowerBound: change.lowerBound, upperBound: change.upperBound })
    : null;
  const severity = (['EXTREME', 'SEVERE', 'ABOVE_NORMAL', 'NO_FLOODING', 'UNKNOWN', 'SEVERITY_UNSPECIFIED'].includes(String(status.severity)) ? status.severity : 'UNKNOWN') as GoogleFloodSignal['modelSeverity'];
  const thresholds = model?.thresholds;
  let modelThresholdClass: GoogleFloodSignal['modelThresholdClass'] = 'UNKNOWN';
  if (severity === 'NO_FLOODING') modelThresholdClass = 'NONE';
  else if (severity === 'ABOVE_NORMAL') modelThresholdClass = thresholds ? 'WARNING' : 'UNKNOWN';
  else if (severity === 'SEVERE') modelThresholdClass = thresholds ? 'DANGER' : 'UNKNOWN';
  else if (severity === 'EXTREME') modelThresholdClass = thresholds?.extremeDangerLevel !== undefined ? 'EXTREME_DANGER' : 'DANGER';
  return Object.freeze({
    provider: 'GOOGLE_FLOOD_FORECASTING', gaugeId: gauge.gaugeId, gaugeModelId: model?.gaugeModelId ?? null,
    qualityVerified: gauge.qualityVerified && status.qualityVerified && (!model || model.qualityVerified), hasModel: gauge.hasModel,
    siteName: gauge.siteName, river: gauge.river, location: gauge.location, source: status.source ?? gauge.source,
    issuedAt: issued, validFrom, validTo, leadTimeHours: (Date.parse(validTo) - Date.parse(issued)) / 3_600_000,
    forecastValue: null, forecastUnit: unit(model?.gaugeValueUnit),
    forecastTrend: (['RISE', 'FALL', 'NO_CHANGE', 'FORECAST_TREND_UNSPECIFIED'].includes(String(status.forecastTrend)) ? status.forecastTrend : 'FORECAST_TREND_UNSPECIFIED') as GoogleFloodSignal['forecastTrend'],
    forecastChange, modelSeverity: severity, modelThresholdClass,
    mapInferenceType: status.mapInferenceType === 'MODEL' || status.mapInferenceType === 'IMAGE_CLASSIFICATION' ? status.mapInferenceType : 'MAP_INFERENCE_TYPE_UNSPECIFIED',
    inundationProbabilityAvailable: mapType === 'PROBABILITY' && polygonIds.length > 0,
    inundationDepthAvailable: mapType === 'DEPTH' && polygonIds.length > 0,
    polygonIds, retrievedAt, freshness: googleFreshness(issued, validTo, new Date(retrievedAt)), semanticRole: 'SUPPLEMENTARY_MODEL_FORECAST',
    canDetermineOfficialWarning: false, canDetermineOfficialEmergency: false, license: 'CC_BY_4_0', associatedSosSystem: mapping.associatedSosSystem,
  });
}
