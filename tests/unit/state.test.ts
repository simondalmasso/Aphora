import { describe, expect, it } from 'vitest';
import { derivePublicState } from '../../src/domain/state.ts';

describe('derivePublicState', () => {
  it('preserves contradictory demo signals as surveillance', () => {
    const decision = derivePublicState({ modelRisk: 'ELEVATED', riverTrend: 'RISING_SLOWLY', officialAlert: 'NONE', observationAvailable: true });
    expect(decision.state).toBe('VIGILANCIA');
    expect(decision.contradictions).toHaveLength(2);
  });

  it('never derives evacuation from a model alone', () => {
    expect(derivePublicState({ modelRisk: 'HIGH', riverTrend: 'RISING', officialAlert: 'NONE', observationAvailable: true }).state).toBe('VIGILANCIA');
  });

  it('uses UNKNOWN when critical observations are absent', () => {
    expect(derivePublicState({ modelRisk: 'ELEVATED', riverTrend: 'UNKNOWN', officialAlert: 'NONE', observationAvailable: false }).state).toBe('UNKNOWN');
  });

  it('requires an official evacuation signal for that state', () => {
    expect(derivePublicState({ modelRisk: 'NORMAL', riverTrend: 'STABLE', officialAlert: 'EVACUATION', observationAvailable: true }).state).toBe('EVACUACION_OFICIAL');
  });
});
