import { describe, expect, it } from 'vitest';
import { demoSnapshot } from '../../src/data/demo-snapshot';
import { compactSnapshot } from '../../src/domain/snapshot';
import { validateSnapshot } from '../../src/domain/validation';

describe('snapshot contract', () => {
  it('validates and serializes the fixture without losing uncertainty', () => {
    expect(() => validateSnapshot(demoSnapshot)).not.toThrow();
    const roundTrip = JSON.parse(JSON.stringify(compactSnapshot(demoSnapshot))) as ReturnType<typeof compactSnapshot>;
    expect(roundTrip.state).toBe('VIGILANCIA');
    expect(roundTrip.contradictions).toHaveLength(1);
    expect(roundTrip.mode).toBe('DEMO');
  });

  it('rejects a snapshot that is not explicitly demo', () => {
    expect(() => validateSnapshot({ ...demoSnapshot, mode: 'LIVE' })).toThrow(/modo/);
  });
});
