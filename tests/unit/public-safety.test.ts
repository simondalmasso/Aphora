import { describe, expect, it } from 'vitest';
import { alertVerificationState, classificationForSource, dataStatusForFreshness, formatHumanAge, formatLocalDateTime, freshnessFor, highestFreshness, isPublicTimestamp, timelineFor } from '../../src/domain/public-safety';
import type { HydrologicalSystem, OfficialAlert, Source } from '../../src/domain/snapshot';

const now = new Date('2026-08-05T12:00:00.000Z');
const source = (overrides: Partial<Source> = {}): Source => ({
  id: 'smn-alerts', name: 'SMN CAP', kind: 'OFFICIAL_ALERT', status: 'FRESH', observedAt: now.toISOString(), validUntil: '2026-08-05T13:00:00.000Z', contribution: 'Alertas.', official: true, connected: true, classification: 'OPERATIONAL_FRESH', freshness: 'ACTUALIZADO', ...overrides,
});
const alert: OfficialAlert = { identifier: 'a', sender: 'SMN', sent: now.toISOString(), status: 'Actual', messageType: 'Alert', scope: 'Public', category: 'Met', event: 'Tormenta', urgency: 'Immediate', severity: 'Severe', certainty: 'Likely', effective: now.toISOString(), onset: now.toISOString(), expires: '2026-08-05T14:00:00.000Z', headline: 'Alerta', description: 'Descripción', instruction: 'Resguardate.', area: 'Santa Fe', sourceUrl: 'https://example.test', lifecycle: 'ACTIVE', appliesToSantaFe: true };
const system = (freshness: HydrologicalSystem['freshness']): HydrologicalSystem => ({ id: `s-${freshness}`, label: 'Río Paraná — Santa Fe', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30', available: true, dataStatus: dataStatusForFreshness(freshness ?? 'NO_DISPONIBLE'), freshness, currentMetres: 3, observedAt: now.toISOString(), fetchedAt: now.toISOString(), validUntil: '2026-08-06T12:00:00.000Z', sourceId: 'ina-rest-30', sourceName: 'INA', points: [{ at: now.toISOString(), metres: 3, measured: true }], thresholds: [], trend: 'STABLE', delta1h: 0, delta6h: 0, delta24h: 0 });

describe('public safety semantics', () => {
  it('classifies freshness without using generatedAt', () => {
    expect(freshnessFor('2026-08-05T11:00:00.000Z', now, 2 * 60 * 60_000, 6 * 60 * 60_000)).toBe('ACTUALIZADO');
    expect(freshnessFor('2026-08-05T08:00:00.000Z', now, 2 * 60 * 60_000, 6 * 60 * 60_000)).toBe('ACTUALIZACION_DEMORADA');
    expect(freshnessFor('2026-08-04T12:00:00.000Z', now, 2 * 60 * 60_000, 6 * 60 * 60_000)).toBe('DESACTUALIZADO');
    expect(freshnessFor(null, now, 1, 2)).toBe('NO_DISPONIBLE');
  });

  it('never claims no alerts when the automatic alert source is unavailable or stale', () => {
    expect(alertVerificationState(source({ status: 'UNAVAILABLE', connected: false, classification: 'DEGRADED' }), [])).toBe('FUENTES_DE_ALERTAS_NO_DISPONIBLES');
    expect(alertVerificationState(source({ status: 'STALE', freshness: 'ACTUALIZACION_DEMORADA', classification: 'OPERATIONAL_STALE' }), [])).toBe('VERIFICACION_DE_ALERTAS_DEGRADADA');
    expect(alertVerificationState(source(), [])).toBe('SIN_ALERTAS_OFICIALES_DETECTADAS');
    expect(alertVerificationState(source(), [alert])).toBe('ALERTA_OFICIAL_ACTIVA');
  });

  it('keeps blocked and supplementary feeds out of operational corroboration', () => {
    expect(classificationForSource({ connected: false, status: 'UNAVAILABLE', kind: 'OFFICIAL_OBSERVATION' }, 'BLOCKED_CREDENTIAL')).toBe('BLOCKED_CREDENTIAL');
    expect(classificationForSource({ connected: true, status: 'FRESH', kind: 'SATELLITE_OBSERVATION' })).toBe('SUPPLEMENTARY');
    expect(highestFreshness([system('ACTUALIZADO'), system('DESACTUALIZADO')])).toBe('DESACTUALIZADO');
  });

  it('builds a bounded 72-hour timeline and marks degraded sources', () => {
    const events = timelineFor([system('ACTUALIZADO')], [alert], [source({ id: 'blocked', classification: 'BLOCKED_CREDENTIAL', connected: false, status: 'UNAVAILABLE', limitations: 'Requiere credencial.' })], now);
    expect(events.some((event) => event.type === 'ALERT_ISSUED')).toBe(true);
    expect(events.some((event) => event.type === 'MEASUREMENT')).toBe(true);
    expect(events.some((event) => event.type === 'SOURCE_DEGRADED')).toBe(true);
    expect(events).toHaveLength(3);
  });
  it('never exposes Unix epoch dates and renders age in public language', () => {
    expect(isPublicTimestamp('1970-01-01T00:00:00.000Z')).toBe(false);
    expect(formatLocalDateTime('1970-01-01T00:00:00.000Z')).toBe('Sin fecha disponible');
    expect(formatLocalDateTime(null)).toBe('Sin fecha disponible');
    expect(formatHumanAge('2026-08-05T11:59:30.000Z', now.toISOString())).toBe('hace menos de un minuto');
    expect(formatHumanAge('2026-08-05T11:15:00.000Z', now.toISOString())).toBe('hace 45 min');
    expect(formatHumanAge('2026-08-05T09:00:00.000Z', now.toISOString())).toBe('hace 3 horas');
    expect(formatHumanAge('2026-08-02T12:00:00.000Z', now.toISOString())).toBe('hace 3 días');
  });

});
