import { describe, expect, it } from 'vitest';
import { ageMinutes, freshnessFor } from '../../src/domain/public-safety.ts';
describe('028 future timestamp guard', () => {
  const now=new Date('2026-08-16T06:00:00.000Z');
  it('FUTURE_POINT_NOT_FRESH=PASS',()=>expect(freshnessFor('2026-08-16T09:00:00.000Z',now,6*3600000,24*3600000)).toBe('NO_DISPONIBLE'));
  it('future human age is unavailable',()=>expect(ageMinutes('2026-08-16T09:00:00.000Z',now.toISOString())).toBeNull());
  it('small clock skew is tolerated',()=>expect(freshnessFor('2026-08-16T06:03:00.000Z',now,6*3600000,24*3600000)).toBe('ACTUALIZADO'));
});
