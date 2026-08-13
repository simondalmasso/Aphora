import { describe, expect, it } from 'vitest';
import { deriveHydroPriority } from '../../src/domain/hydro-priority.ts';
import type { HydrologicalSystem, Snapshot, Source } from '../../src/domain/snapshot.ts';

const generatedAt = '2026-08-12T23:00:00.000Z';

function expiredSystem(): HydrologicalSystem {
  return {
    id: 'salado-santo-tome',
    label: 'Río Salado — Santo Tomé',
    watercourse: 'Río Salado',
    stationName: 'Santo Tomé',
    stationCode: '1679',
    available: true,
    dataStatus: 'STALE',
    freshness: 'ACTUALIZACION_DEMORADA',
    currentMetres: 4.8,
    observedAt: '2026-08-11T18:00:00.000Z',
    fetchedAt: '2026-08-12T22:59:00.000Z',
    validUntil: '2026-08-12T18:00:00.000Z',
    sourceId: 'ina-rest-3044',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: [],
    thresholds: [{ id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: 4.7 }],
    trend: 'RISING',
    delta1h: .01,
    delta6h: .06,
    delta24h: .23,
  };
}

function snapshot(system: HydrologicalSystem, source: Source): Snapshot {
  return {
    schemaVersion: '1.0',
    id: 'expired-priority-test',
    mode: 'LIVE',
    generatedAt,
    previousSnapshotAt: '2026-08-12T22:45:00.000Z',
    state: 'UNKNOWN',
    stateLabel: 'Vigencia insuficiente',
    summary: 'Última medición vencida.',
    dominantSourceId: source.id,
    validUntil: '2026-08-12T23:15:00.000Z',
    recommendedAction: 'Verificar fuente.',
    emergencyDisclaimer: 'Prueba.',
    alertStatus: 'SIN_ALERTAS_OFICIALES_DETECTADAS',
    alerts: [],
    changes: [],
    systems: [system],
    river: {
      systemId: system.id,
      stationName: system.stationName,
      currentMetres: system.currentMetres ?? 0,
      delta1h: system.delta1h ?? 0,
      delta6h: system.delta6h ?? 0,
      delta24h: system.delta24h ?? 0,
      trend: system.trend,
      observedAt: system.observedAt ?? generatedAt,
      fetchedAt: system.fetchedAt ?? generatedAt,
      validUntil: system.validUntil ?? generatedAt,
      sourceId: system.sourceId,
      points: [],
      forecastPoints: [],
      thresholds: system.thresholds,
    },
    rain: {
      accumulated1hMm: null,
      accumulated24hMm: null,
      forecast: 'No disponible',
      observedAt: generatedAt,
      fetchedAt: generatedAt,
      validUntil: generatedAt,
      sourceId: 'rain',
      points: [],
    },
    sources: [source],
    contradictions: [],
    shelters: [],
    actions: [],
    messages: [],
  };
}

describe('hydro priority validity', () => {
  it('does not promote an expired hydrometric reading even if its numeric level crosses a reference threshold', () => {
    const system = expiredSystem();
    const source: Source = {
      id: system.sourceId,
      name: 'INA REST · Salado',
      kind: 'OFFICIAL_OBSERVATION',
      status: 'STALE',
      observedAt: system.observedAt ?? generatedAt,
      validUntil: '2026-08-13T00:00:00.000Z',
      contribution: 'Lectura oficial.',
      official: true,
      determinesPrimaryState: true,
      classification: 'OPERATIONAL_STALE',
    };
    const decision = deriveHydroPriority(snapshot(system, source));
    expect(decision.mode).toBe('NORMAL');
    expect(decision.signals).toHaveLength(0);
  });
});
