import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLiveSnapshot } from '../../src/worker/live-data';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }); }

function points(values: readonly [string, number][]) { return { data: values.map(([timestart, valor]) => ({ timestart, valor })) }; }

describe('live hydrological aggregation', () => {
  it('keeps Paraná and Salado on separate station scales and derives the highest state', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('seriesId=30&')) return json(points([['2026-08-02T18:00:00.000Z', 3.1], ['2026-08-03T12:00:00.000Z', 3.18], ['2026-08-03T18:00:00.000Z', 3.2]]));
      if (url.includes('seriesId=3044&')) return json(points([['2026-08-02T18:00:00.000Z', 4.5], ['2026-08-03T12:00:00.000Z', 4.7], ['2026-08-03T18:00:00.000Z', 4.8]]));
      if (url.includes('/identify')) return json({ value: 0 });
      throw new Error(`unexpected URL ${url}`);
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
  });

  it('returns an explicit unavailable snapshot when validated station data cannot be obtained', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('provider unavailable'); }) as typeof fetch;
    const snapshot = await buildLiveSnapshot({}, new Date('2026-08-03T18:00:00.000Z'));
    expect(snapshot.mode).toBe('UNAVAILABLE');
    expect(snapshot.dataStatus).toBe('UNAVAILABLE');
    expect(snapshot.state).toBe('UNKNOWN');
    expect(snapshot.river.available).toBe(false);
    expect(snapshot.id).not.toMatch(/^demo-/);
    expect(snapshot.summary).toContain('No hay una lectura hídrica validada');
  });
});
