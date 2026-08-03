import type { CriticalMessage, ZungunEnvelopeSubset } from './types';
import { validateCriticalMessage } from './validation';

export function mapToZungunEnvelope(message: CriticalMessage, now: Date): ZungunEnvelopeSubset {
  validateCriticalMessage(message);
  const expiresAtMs = Date.parse(message.expiresAt);
  const status: ZungunEnvelopeSubset['status'] = message.status === 'UNKNOWN'
    ? 'UNKNOWN'
    : expiresAtMs <= now.getTime() || message.status === 'EXPIRED'
      ? 'EXPIRED'
      : message.status === 'RETRACTED'
        ? 'FAILED'
        : 'ELIGIBLE';
  return Object.freeze({
    messageId: message.id,
    createdAtMs: Date.parse(message.createdAt),
    expiresAtMs,
    priority: message.priority,
    contentType: 'application/vnd.sos-sf.critical-message+json',
    messageCommitment: message.commitment ?? `uncommitted:${message.id}`,
    status,
  });
}
