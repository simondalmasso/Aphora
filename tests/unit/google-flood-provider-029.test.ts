import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGoogleGaugeModel, normalizeGoogleFloodSignal, searchGoogleGaugesByArea, searchLatestGoogleFloodStatusByArea } from '../../src/worker/providers/google-flood.ts';
import { associateGoogleGauge } from '../../src/domain/google-flood.ts';

afterEach(() => vi.unstubAllGlobals());
const loop = { vertices: [{ latitude: -32, longitude: -61 }, { latitude: -32, longitude: -60 }, { latitude: -31, longitude: -60 }] };

describe('Google Flood provider security and contract', () => {
  it('keeps API key in the header and validates gauge schema', async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ gauges: [{ gaugeId: 'g1', siteName: 'Santa Fe', riverName: 'Paraná', source: 'X', countryCode: 'AR', location: { latitude: -31.65, longitude: -60.70 }, qualityVerified: true, hasModel: true }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const result = await searchGoogleGaugesByArea('secret-key', loop);
    expect(result.value?.[0]?.gaugeId).toBe('g1');
    expect(new Headers(seen?.headers).get('x-goog-api-key')).toBe('secret-key');
    expect(String(seen?.body)).not.toContain('secret-key');
    expect(seen?.redirect).toBe('manual');
  });
  it('rejects redirect outside the allowlist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 302, headers: { Location: 'https://evil.example/v1/gauges' } })));
    const result = await searchGoogleGaugesByArea('k', loop);
    expect(result.status).toBe('UNAVAILABLE'); expect(result.errorClass).toBe('ALLOWLIST');
  });
  it('preserves model id and never invents a forecast value', () => {
    const gauge = { gaugeId: 'g1', siteName: 'Santa Fe', river: 'Paraná', source: 'X', countryCode: 'AR', location: { latitude: -31.65, longitude: -60.70 }, qualityVerified: true, hasModel: true };
    const mapping = associateGoogleGauge(gauge, [{ systemId: 'parana-santa-fe', stationName: 'Santa Fe', watercourse: 'Río Paraná', location: gauge.location, coordinateSource: 'fixture' }]);
    const normalized = normalizeGoogleFloodSignal(gauge, { ...mapping, modelId: 'model-v2', modelUnit: 'METERS' }, { gaugeId: 'g1', gaugeModelId: 'model-v2', gaugeValueUnit: 'METERS', qualityVerified: true, thresholds: { warningLevel: 4, dangerLevel: 5 } }, { gaugeId: 'g1', qualityVerified: true, issuedTime: '2026-08-16T12:00:00Z', forecastTimeRange: { start: '2026-08-16T12:00:00Z', end: '2026-08-18T12:00:00Z' }, forecastTrend: 'RISE', severity: 'SEVERE', mapInferenceType: 'MODEL', inundationMapSet: { inundationMapType: 'PROBABILITY', inundationMaps: [{ level: 'HIGH', serializedPolygonId: 'p1' }] } }, '2026-08-16T13:00:00Z');
    expect(normalized?.gaugeModelId).toBe('model-v2'); expect(normalized?.forecastValue).toBeNull(); expect(normalized?.polygonIds).toEqual(['p1']);
  });
  it('accepts documented discharge unit and lower-confidence model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ gaugeId: 'g1', gaugeModelId: 'm2', gaugeValueUnit: 'CUBIC_METERS_PER_SECOND', qualityVerified: false }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const result = await getGoogleGaugeModel('k', 'g1'); expect(result.value?.gaugeModelId).toBe('m2'); expect(result.value?.qualityVerified).toBe(false);
  });
  it('uses issuedTime as provider observation time for status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ floodStatuses: [{ gaugeId: 'g1', qualityVerified: true, issuedTime: '2026-08-15T10:00:00Z', forecastTimeRange: { start: '2026-08-15T10:00:00Z', end: '2026-08-16T10:00:00Z' }, severity: 'NO_FLOODING' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const result = await searchLatestGoogleFloodStatusByArea('k', loop);
    expect(Date.parse(result.observedAt ?? '')).toBe(Date.parse('2026-08-15T10:00:00Z'));
  });
});
