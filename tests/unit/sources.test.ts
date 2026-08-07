import { describe, expect, it } from 'vitest';
import { sourceAgeLabel, sourceFreshness } from '../../src/domain/sources.ts';

describe('source freshness', () => {
  it('marks a source fresh only inside its validity interval', () => {
    const source = { observedAt: '2026-08-03T01:00:00Z', validUntil: '2026-08-03T02:00:00Z' };
    expect(sourceFreshness(source, new Date('2026-08-03T01:30:00Z'))).toBe('FRESH');
    expect(sourceFreshness(source, new Date('2026-08-03T02:00:01Z'))).toBe('STALE');
  });

  it('rejects future and malformed observations as unknown', () => {
    expect(sourceFreshness({ observedAt: 'bad', validUntil: 'bad' }, new Date())).toBe('UNKNOWN');
    expect(sourceFreshness({ observedAt: '2026-08-03T02:02:00Z', validUntil: '2026-08-03T03:00:00Z' }, new Date('2026-08-03T02:00:00Z'))).toBe('UNKNOWN');
  });

  it('uses deterministic age labels', () => {
    expect(sourceAgeLabel('2026-08-03T01:10:00Z', '2026-08-03T01:30:00Z')).toBe('hace 20 min');
  });
});
