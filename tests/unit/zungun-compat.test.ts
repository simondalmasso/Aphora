import { describe, expect, it } from 'vitest';
import { demoSnapshot } from '../../src/data/demo-snapshot.ts';
import { mapToZungunEnvelope } from '../../src/domain/zungun-compat/mapper.ts';
import { validateCriticalMessage } from '../../src/domain/zungun-compat/validation.ts';

describe('zungun-compatible boundary', () => {
  it('maps stable identity, TTL, priority and commitment', () => {
    const message = demoSnapshot.messages[0]!;
    const mapped = mapToZungunEnvelope(message, new Date(demoSnapshot.generatedAt));
    expect(mapped).toMatchObject({ messageId: message.id, priority: 2, status: 'ELIGIBLE', messageCommitment: message.commitment });
    expect(mapped.expiresAtMs).toBe(Date.parse(message.expiresAt));
  });

  it('maps expired and unknown outcomes explicitly', () => {
    const active = demoSnapshot.messages[0]!;
    expect(mapToZungunEnvelope(active, new Date(active.expiresAt)).status).toBe('EXPIRED');
    expect(mapToZungunEnvelope({ ...active, status: 'UNKNOWN' }, new Date(demoSnapshot.generatedAt)).status).toBe('UNKNOWN');
  });

  it('rejects invalid priorities and extra fields defensively', () => {
    const valid = demoSnapshot.messages[0]!;
    expect(() => validateCriticalMessage({ ...valid, priority: 4 })).toThrow(/priority/);
    expect(() => validateCriticalMessage({ ...valid, freeText: 'rumor' })).toThrow(/no admitido/);
  });

  it('rejects accessors without invoking them', () => {
    let invoked = false;
    const hostile = { ...demoSnapshot.messages[0] } as Record<string, unknown>;
    Object.defineProperty(hostile, 'title', { enumerable: true, get() { invoked = true; return 'rumor'; } });
    expect(() => validateCriticalMessage(hostile)).toThrow(/inseguro/);
    expect(invoked).toBe(false);
  });
});
