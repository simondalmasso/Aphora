import { describe, expect, it } from 'vitest';
import {
  changeCopy,
  changeForSystem,
  meaningForSystem,
  referencesForSystem,
  safeStationThresholds,
  stationDatumExplanation,
} from '../../src/domain/hydrometric-context.ts';
import type { HydrologicalSystem, RiverPoint } from '../../src/domain/snapshot.ts';

const END = '2026-08-16T03:00:00.000Z';

function points(hours: number, startMetres: number, step: number): readonly RiverPoint[] {
  return Array.from({ length: hours + 1 }, (_, index) => ({
    at: new Date(Date.parse(END) - (hours - index) * 3_600_000).toISOString(),
    metres: startMetres + step * index,
    measured: true,
    quality: 'PUBLISHED_OPERATIONAL' as const,
  }));
}

function system(id: 'parana-santa-fe' | 'salado-santo-tome', overrides: Partial<HydrologicalSystem> = {}): HydrologicalSystem {
  const parana = id === 'parana-santa-fe';
  const series = points(180, parana ? 2.9 : 3.0, .003);
  return {
    id,
    label: parana ? 'Río Paraná — Santa Fe' : 'Río Salado — Santo Tomé',
    watercourse: parana ? 'Río Paraná' : 'Río Salado',
    stationName: parana ? 'Santa Fe' : 'Santo Tomé',
    stationCode: parana ? '30' : '1679',
    available: true,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    currentMetres: series.at(-1)!.metres,
    observedAt: END,
    fetchedAt: END,
    validUntil: '2026-08-16T09:00:00.000Z',
    sourceId: parana ? 'ina-rest-30' : 'ina-rest-3044',
    sourceName: 'Instituto Nacional del Agua · INA REST',
    points: series,
    thresholds: parana
      ? [
        { id: 'NORMAL', label: 'Referencia inferior', metres: 2 },
        { id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: 5.3 },
        { id: 'EVACUACION', label: 'Nivel de evacuación de referencia', metres: 5.7 },
      ]
      : [
        { id: 'NORMAL', label: 'Referencia inferior', metres: 0 },
        { id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: 4.7 },
        { id: 'EVACUACION', label: 'Nivel de evacuación de referencia', metres: 0 },
      ],
    trend: 'RISING_SLOWLY',
    delta1h: .003,
    delta6h: .018,
    delta24h: .072,
    ...overrides,
  };
}

describe('context-first hydrometric truth model', () => {
  it('treats unverified Salado zeros as absent references, never physical zero thresholds', () => {
    const salado = system('salado-santo-tome', { currentMetres: 3.42 });
    const thresholds = safeStationThresholds(salado);
    expect(thresholds).toEqual([{ id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: 4.7 }]);
    expect(thresholds.some((threshold) => threshold.metres === 0)).toBe(false);
    const refs = referencesForSystem(salado);
    expect(refs.map((reference) => [reference.kind, reference.metres])).toEqual([
      ['OFFICIAL_PROTECTION_THRESHOLD', 4.7],
    ]);
    expect(JSON.stringify(refs)).not.toContain('0.00');
  });

  it('keeps Paraná references station-specific and provenance-typed', () => {
    const refs = referencesForSystem(system('parana-santa-fe'));
    expect(refs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'OFFICIAL_STATISTICAL_REFERENCE', metres: 2, stationId: 'parana-santa-fe', seriesId: '30', period: '1991–2020' }),
      expect.objectContaining({ kind: 'OFFICIAL_PROTECTION_THRESHOLD', metres: 5.3, stationId: 'parana-santa-fe', seriesId: '30' }),
      expect.objectContaining({ kind: 'OFFICIAL_PROTECTION_THRESHOLD', metres: 5.7, stationId: 'parana-santa-fe', seriesId: '30' }),
    ]));
    expect(refs.every((reference) => reference.sourceUrl.startsWith('https://alerta.ina.gob.ar/'))).toBe(true);
  });

  it('turns a raw Salado level into a factual station-specific meaning', () => {
    const meaning = meaningForSystem(system('salado-santo-tome', { currentMetres: 3.42 }));
    expect(meaning.headline).toBe('1,28 m por debajo del nivel de alerta de referencia · 4,70 m');
    expect(meaning.headline).not.toMatch(/seguro|tranquilo|sin riesgo|profundidad/i);
  });

  it('never equates gauge height with river depth and exposes datum uncertainty', () => {
    expect(stationDatumExplanation(system('parana-santa-fe'))).toContain('no como profundidad total del río');
    expect(stationDatumExplanation(system('salado-santo-tome'))).toContain('no publica un cero IGN utilizable');
  });

  it('derives 72 h and 7 d changes only with sufficient historical coverage', () => {
    const full = system('parana-santa-fe');
    expect(changeForSystem(full, 72)).not.toBeNull();
    expect(changeForSystem(full, 168)).not.toBeNull();
    const shortSeries = points(30, 3.1, .002);
    const short = system('parana-santa-fe', { points: shortSeries, currentMetres: shortSeries.at(-1)!.metres, observedAt: shortSeries.at(-1)!.at });
    expect(changeForSystem(short, 72)).toBeNull();
    expect(changeForSystem(short, 168)).toBeNull();
    expect(changeCopy(changeForSystem(short, 72), 72)).toBe('Sin datos suficientes para comparar 72 h');
    expect(changeCopy(changeForSystem(short, 168), 168)).toBe('Sin datos suficientes para comparar 7 días');
  });
});
