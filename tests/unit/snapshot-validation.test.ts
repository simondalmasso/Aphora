import { describe, expect, it } from 'vitest';
import { unavailableSnapshot } from '../../src/data/unavailable-snapshot';
import type { HydrologicalSystem, Snapshot, Source } from '../../src/domain/snapshot';
import { validateSnapshot } from '../../src/domain/validation';

const at = '2026-08-03T12:00:00.000Z';
const source: Source = { id: 'ina:test', name: 'INA test', kind: 'OFFICIAL_OBSERVATION', status: 'FRESH', observedAt: at, validUntil: '2026-08-03T18:00:00.000Z', contribution: 'Lectura publicada.', official: true, connected: true };
const system: HydrologicalSystem = { id: 'parana-test', label: 'Sistema Paraná', watercourse: 'Río Paraná', stationName: 'Santa Fe', stationCode: '30', available: true, dataStatus: 'LIVE', currentMetres: 3.2, observedAt: at, sourceId: source.id, sourceName: source.name, points: [{ at, metres: 3.2, measured: true, quality: 'PUBLISHED_OPERATIONAL' }], thresholds: [], trend: 'STABLE', delta1h: null, delta6h: null, delta24h: null };

function live(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    ...unavailableSnapshot,
    id: 'live-test',
    mode: 'LIVE',
    dataStatus: 'LIVE',
    generatedAt: at,
    previousSnapshotAt: '2026-08-03T11:45:00.000Z',
    validUntil: '2026-08-03T12:15:00.000Z',
    state: 'NORMAL',
    stateLabel: 'Sin umbral de alerta alcanzado',
    summary: 'Lectura operativa.',
    dominantSourceId: source.id,
    systems: [system],
    sources: [source],
    river: { systemId: system.id, available: true, dataStatus: 'LIVE', stationName: system.stationName, currentMetres: 3.2, delta1h: 0, delta6h: 0, delta24h: 0, trend: 'STABLE', observedAt: at, sourceId: source.id, sourceName: source.name, points: system.points, forecastPoints: [], thresholds: [] },
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
});
