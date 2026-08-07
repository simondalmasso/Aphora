import { describe, expect, it } from 'vitest';
import { unavailableSnapshot } from '../../src/data/unavailable-snapshot.ts';
import type { HydrologicalSystem, Snapshot, Source } from '../../src/domain/snapshot.ts';
import { validateSnapshot } from '../../src/domain/validation.ts';

const at = '2026-08-03T12:00:00.000Z';
const source: Source = { id: 'ina-rest-30', name: 'INA REST · Río Paraná, Santa Fe', kind: 'OFFICIAL_OBSERVATION', status: 'FRESH', observedAt: at, fetchedAt: at, lastCheckedAt: at, validUntil: '2026-08-03T18:00:00.000Z', contribution: 'Lectura publicada.', official: true, connected: true, organizationId: 'ina', organizationName: 'Instituto Nacional del Agua', feedId: 'ina-rest-30', feedName: 'INA REST · Río Paraná, Santa Fe', classification: 'OPERATIONAL_FRESH', freshness: 'ACTUALIZADO', determinesPrimaryState: true };
const system: HydrologicalSystem = { id: 'parana-test', label: 'Río Paraná — Santa Fe', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30', available: true, dataStatus: 'LIVE', freshness: 'ACTUALIZADO', currentMetres: 3.2, observedAt: at, fetchedAt: at, validUntil: '2026-08-03T18:00:00.000Z', sourceId: source.id, sourceName: source.name, points: [{ at, metres: 3.2, measured: true, quality: 'PUBLISHED_OPERATIONAL' }], thresholds: [], trend: 'STABLE', delta1h: null, delta6h: null, delta24h: null };

function live(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    ...unavailableSnapshot,
    id: 'live-test',
    mode: 'LIVE',
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    generatedAt: at,
    previousSnapshotAt: '2026-08-03T11:45:00.000Z',
    validUntil: '2026-08-03T12:15:00.000Z',
    state: 'NORMAL',
    stateLabel: 'Nivel por debajo del umbral de alerta',
    summary: 'Lectura operativa.',
    dominantSourceId: source.id,
    systems: [system],
    sources: [source],
    river: { systemId: system.id, available: true, dataStatus: 'LIVE', stationName: system.stationName, currentMetres: 3.2, delta1h: 0, delta6h: 0, delta24h: 0, trend: 'STABLE', observedAt: at, fetchedAt: at, validUntil: '2026-08-03T18:00:00.000Z', sourceId: source.id, sourceName: source.name, points: system.points, forecastPoints: [], thresholds: [] },
    ...overrides,
  };
}

describe('snapshot validation', () => {
  it('accepts unavailable and structurally coherent live snapshots', () => {
    expect(validateSnapshot(unavailableSnapshot)).toBe(unavailableSnapshot);
    const value = live({ state: 'UMBRAL_EVACUACION_ALCANZADO', stateLabel: 'Umbral alcanzado; no equivale a orden oficial' });
    expect(validateSnapshot(value)).toBe(value);
  });

  it('rejects systems that disagree with their latest point', () => {
    const broken = live({ systems: [{ ...system, currentMetres: 4.1 }] });
    expect(() => validateSnapshot(broken)).toThrow('no coincide con su última lectura');
  });

  it('rejects duplicate timestamps, missing sources and invalid scalar fields', () => {
    const duplicate = { ...system, points: [...system.points, { ...system.points[0] }] };
    expect(() => validateSnapshot(live({ systems: [duplicate], river: { ...live().river, points: duplicate.points } }))).toThrow('ordenado sin duplicados');
    expect(() => validateSnapshot(live({ sources: [] }))).toThrow('fuente inexistente');
    expect(() => validateSnapshot(live({ river: { ...live().river, currentMetres: Number.NaN } }))).toThrow('finito');
  });

  it('rejects unsafe public URLs and fabricated available rain totals', () => {
    expect(() => validateSnapshot(live({ sources: [{ ...source, url: 'javascript:alert(1)' }] }))).toThrow('debe usar HTTPS');
    expect(() => validateSnapshot(live({ rain: { ...live().rain, available: true, accumulated1hMm: null, accumulated24hMm: null } }))).toThrow('disponible sin acumulados');
  });

});
