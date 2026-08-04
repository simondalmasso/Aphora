import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLiveSnapshot } from '../../src/worker/live-data';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }); }
function points(series: number, values: readonly [string, number][]) { return values.map(([timestart, valor]) => ({ tipo: 'puntual', series_id: series, timestart, valor })); }
function seriesId(input: RequestInfo | URL): string | null { return new URL(String(input)).searchParams.get('series_id'); }

describe('live hydrological aggregation', () => {
  it('keeps Paraná and Salado on separate scales with operational provenance', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const id = seriesId(input);
      if (id === '30') return json(points(Number(id), [['2026-08-02T18:00:00.000Z', 3.1], ['2026-08-03T12:00:00.000Z', 3.18], ['2026-08-03T18:00:00.000Z', 3.2]]));
      if (id === '3044') return json(points(Number(id), [['2026-08-02T18:00:00.000Z', 4.5], ['2026-08-03T12:00:00.000Z', 4.7], ['2026-08-03T18:00:00.000Z', 4.8]]));
      if (String(input).includes('/identify')) return json({ observedAt: '2026-08-03T17:30:00.000Z', value: 0 });
      throw new Error(`unexpected URL ${String(input)}`);
    }) as typeof fetch;
    const snapshot = await buildLiveSnapshot({}, new Date('2026-08-03T18:00:00.000Z'));
    expect(snapshot.mode).toBe('LIVE');
    expect(snapshot.dataStatus).toBe('LIVE');
    expect(snapshot.systems).toHaveLength(2);
    expect(snapshot.systems?.map((system) => [system.id, system.stationCode, system.currentMetres])).toEqual([
      ['parana-santa-fe', '30', 3.2],
      ['salado-santo-tome', '1679', 4.8],
    ]);
    expect(snapshot.state).toBe('ALERTA');
    expect(snapshot.stateLabel).not.toContain('demostrativa');
    expect(snapshot.river.systemId).toBe('parana-santa-fe');
    expect(snapshot.sources.every((source) => source.kind !== 'DEMO_FIXTURE')).toBe(true);
    expect(snapshot.sources.find((source) => source.id === 'ina:30')).toMatchObject({ connected: true, qualityNote: expect.stringContaining('operativo') });
    expect(snapshot.summary).toContain('sin validación definitiva');
  });

  it('does not convert an evacuation threshold into an official evacuation order', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const id = seriesId(input);
      if (id === '30') return json(points(Number(id), [['2026-08-03T12:00:00.000Z', 5.6], ['2026-08-03T18:00:00.000Z', 5.8]]));
      if (id === '3044') return json(points(Number(id), [['2026-08-03T12:00:00.000Z', 3.1], ['2026-08-03T18:00:00.000Z', 3.2]]));
      if (String(input).includes('/identify')) return json({ observedAt: '2026-08-03T17:30:00.000Z', value: 0 });
      throw new Error(`unexpected URL ${String(input)}`);
    }) as typeof fetch;
    const snapshot = await buildLiveSnapshot({}, new Date('2026-08-03T18:00:00.000Z'));
    expect(snapshot.state).toBe('UMBRAL_EVACUACION_ALCANZADO');
    expect(snapshot.stateLabel).toContain('no equivale a una orden oficial');
    expect(snapshot.state).not.toBe('EVACUACION_OFICIAL');
  });

  it('returns explicit unavailable state when station data cannot be obtained', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('provider unavailable'); }) as typeof fetch;
    const snapshot = await buildLiveSnapshot({}, new Date('2026-08-03T18:00:00.000Z'));
    expect(snapshot.mode).toBe('UNAVAILABLE');
    expect(snapshot.dataStatus).toBe('UNAVAILABLE');
    expect(snapshot.state).toBe('UNKNOWN');
    expect(snapshot.river.available).toBe(false);
    expect(snapshot.id).not.toMatch(/^demo-/);
    expect(snapshot.summary).toContain('No hay una lectura hídrica publicada');
  });
});
