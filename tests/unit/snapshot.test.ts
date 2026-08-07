import { describe, expect, it } from 'vitest';
import { demoSnapshot } from '../../src/data/demo-snapshot.ts';
import { compactSnapshot } from '../../src/domain/snapshot.ts';
import { validateSnapshot } from '../../src/domain/validation.ts';

describe('snapshot contract', () => {
  it('validates and serializes the fixture without losing uncertainty', () => {
    expect(() => validateSnapshot(demoSnapshot)).not.toThrow();
    const roundTrip = JSON.parse(JSON.stringify(compactSnapshot(demoSnapshot))) as ReturnType<typeof compactSnapshot>;
    expect(roundTrip.state).toBe('VIGILANCIA');
    expect(roundTrip.contradictions).toHaveLength(1);
    expect(roundTrip.mode).toBe('DEMO');
    expect(roundTrip.river.points).toHaveLength(13);
    expect(roundTrip.river.forecastPoints).toHaveLength(7);
    expect(roundTrip.river.thresholds.map((threshold) => threshold.id)).toEqual(['NORMAL', 'VIGILANCIA', 'ALERTA', 'EVACUACION']);
  });

  it('rejects a snapshot that is not explicitly demo', () => {
    expect(() => validateSnapshot({ ...demoSnapshot, mode: 'LIVE' })).toThrow(/modo/);
  });

  it('rejects inverted uncertainty and projection windows beyond 24 hours', () => {
    const forecastPoints = demoSnapshot.river.forecastPoints.map((point, index) => index === 1 ? { ...point, lowMetres: point.metres + 1 } : point);
    expect(() => validateSnapshot({ ...demoSnapshot, river: { ...demoSnapshot.river, forecastPoints } })).toThrow(/incertidumbre/);
    const tooLong = demoSnapshot.river.forecastPoints.map((point, index) => index === demoSnapshot.river.forecastPoints.length - 1 ? { ...point, at: '2026-08-04T05:20:00.000Z' } : point);
    expect(() => validateSnapshot({ ...demoSnapshot, river: { ...demoSnapshot.river, forecastPoints: tooLong } })).toThrow(/24 horas/);
  });
});
