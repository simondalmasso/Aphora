import { describe, expect, it } from 'vitest';
import { deriveHydrometricTrend, strictTimeWindow, temporalDelta } from '../../src/domain/temporal-series.ts';
import type { RiverPoint } from '../../src/domain/snapshot.ts';

const now = new Date('2026-08-16T06:00:00.000Z');
const point = (hoursAgo: number, metres: number): RiverPoint => ({ at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(), metres, measured: true, quality: 'PUBLISHED_OPERATIONAL' });

describe('028 temporal truth primitive', () => {
  it('GAP_30H_DELTA24H=NULL', () => {
    const points = [point(30, 3), point(0, 3.2)];
    expect(temporalDelta(points, 24, now).value).toBeNull();
  });
  it('GAP_12H_TREND6H=UNKNOWN', () => {
    const points = [point(12, 3), point(0, 3.2)];
    expect(deriveHydrometricTrend(points, now)).toBe('UNKNOWN');
  });
  it('FUTURE_OBSERVATION_3H=DEGRADED_OR_REJECTED', () => {
    const future: RiverPoint = { at: new Date(now.getTime() + 3 * 3_600_000).toISOString(), metres: 9, measured: true };
    const result = temporalDelta([point(24, 3), point(0, 3.1), future], 24, now);
    expect(result.status).toBe('FUTURE_DATA_REJECTED');
    expect(result.value).toBeCloseTo(.1, 8);
  });
  it('24H_WITH_INSUFFICIENT_POINTS_NO_SILENT_FALLBACK=PASS', () => {
    const points = [point(60, 2.8), point(2, 3.1), point(0, 3.2)];
    const window = strictTimeWindow(points, 24, now);
    expect(window.sufficient).toBe(false);
    expect(window.points.map((item) => item.at)).not.toContain(points[0]!.at);
  });
  it('accepts hourly coverage for 72h and 7d', () => {
    const points = Array.from({ length: 169 }, (_, i) => point(168 - i, 3 + i * .001));
    expect(strictTimeWindow(points, 72, now).sufficient).toBe(true);
    expect(strictTimeWindow(points, 168, now).sufficient).toBe(true);
  });
});
