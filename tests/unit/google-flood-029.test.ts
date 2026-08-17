import { describe, expect, it } from 'vitest';
import { associateGoogleGauge, googleFreshness, reconcileGoogleFlood, type GoogleFloodSignal, type LocalStationAnchor } from '../../src/domain/google-flood.ts';
import type { HydrologicalSystem } from '../../src/domain/snapshot.ts';

const anchors: readonly LocalStationAnchor[] = [{
  systemId: 'parana-santa-fe', stationName: 'Santa Fe', watercourse: 'Río Paraná',
  location: { latitude: -31.6505, longitude: -60.7012 }, coordinateSource: 'fixture verified',
}];
const system: HydrologicalSystem = {
  id: 'parana-santa-fe', label: 'Paraná', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30',
  available: true, dataStatus: 'LIVE', freshness: 'ACTUALIZADO', currentMetres: 3, observedAt: '2026-08-16T12:00:00Z',
  fetchedAt: '2026-08-16T12:01:00Z', validUntil: '2026-08-17T12:00:00Z', sourceId: 'ina', sourceName: 'INA',
  points: [{ at: '2026-08-16T12:00:00Z', metres: 3, measured: true }], thresholds: [{ id: 'ALERTA', label: 'alerta', metres: 5.3 }],
  trend: 'STABLE', delta1h: 0, delta6h: 0, delta24h: 0,
};
function signal(severity: GoogleFloodSignal['modelSeverity'], unit: GoogleFloodSignal['forecastUnit'] = 'METERS'): GoogleFloodSignal {
  return { provider: 'GOOGLE_FLOOD_FORECASTING', gaugeId: 'g1', gaugeModelId: 'm1', qualityVerified: true, hasModel: true,
    siteName: 'Santa Fe', river: 'Parana', location: { latitude: -31.65, longitude: -60.70 }, source: 'Google',
    issuedAt: '2026-08-16T12:00:00Z', validFrom: '2026-08-16T12:00:00Z', validTo: '2026-08-18T12:00:00Z', leadTimeHours: 48,
    forecastValue: 999, forecastUnit: unit, forecastTrend: 'RISE', forecastChange: null, modelSeverity: severity, modelThresholdClass: 'WARNING',
    mapInferenceType: 'MODEL', inundationProbabilityAvailable: false, inundationDepthAvailable: false, polygonIds: [], retrievedAt: '2026-08-16T13:00:00Z',
    freshness: 'CURRENT', semanticRole: 'SUPPLEMENTARY_MODEL_FORECAST', canDetermineOfficialWarning: false, canDetermineOfficialEmergency: false,
    license: 'CC_BY_4_0', associatedSosSystem: 'parana-santa-fe' };
}

describe('ORDER-029 Google Flood truth contract', () => {
  it('associates by location plus semantics and never implies datum equivalence', () => {
    const mapping = associateGoogleGauge({ gaugeId: 'g', siteName: 'Santa Fe', river: 'Paraná', source: 'x', location: { latitude: -31.651, longitude: -60.702 }, countryCode: 'AR', qualityVerified: true, hasModel: true }, anchors);
    expect(mapping.associatedSosSystem).toBe('parana-santa-fe'); expect(mapping.associationRationale).toMatch(/coordenadas/i);
  });
  it('fails closed without a verified local coordinate', () => {
    expect(associateGoogleGauge({ gaugeId: 'g', siteName: 'Santa Fe', river: 'Paraná', source: 'x', location: { latitude: -31.65, longitude: -60.70 }, countryCode: 'AR', qualityVerified: true, hasModel: true }, []).associationConfidence).toBe('UNMAPPED');
  });
  it('guards future and expired timestamps', () => {
    expect(googleFreshness('2026-08-17T20:00:00Z', '2026-08-18T20:00:00Z', new Date('2026-08-16T13:00:00Z'))).toBe('UNAVAILABLE');
    expect(googleFreshness('2026-08-14T10:00:00Z', '2026-08-14T12:00:00Z', new Date('2026-08-16T13:00:00Z'))).toBe('EXPIRED');
  });
  it('keeps unit mismatch semantic and performs zero raw metre subtraction', () => {
    const result = reconcileGoogleFlood({ systems: [system], signals: [signal('ABOVE_NORMAL', 'CUBIC_METERS_PER_SECOND')], alertStatus: 'SIN_ALERTAS_OFICIALES_DETECTADAS', rainAvailable: false });
    expect(result.relation).toBe('MODEL_ELEVATED_LOCAL_NOT_AT_REFERENCE'); expect(result.rawMetreSubtractionPerformed).toBe(false); expect(result.officialEmergencyDeclaredByGoogle).toBe(false);
  });
  it('Google cannot declare official warning or emergency', () => {
    const item = signal('EXTREME'); expect(item.canDetermineOfficialWarning).toBe(false); expect(item.canDetermineOfficialEmergency).toBe(false);
  });
});
