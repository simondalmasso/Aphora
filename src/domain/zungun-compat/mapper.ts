import type { PrivateMessage } from '../private-messaging/types';
import type { CriticalMessage, PrivateZungunEnvelopeSubset, ZungunEnvelopeSubset } from './types';
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

export function mapPrivateMessageToZungun(message: PrivateMessage): PrivateZungunEnvelopeSubset {
  const status: ZungunEnvelopeSubset['status'] = message.status === 'UNKNOWN'
    ? 'UNKNOWN'
    : message.status === 'FAILED'
      ? 'FAILED'
      : message.status === 'READ_BY_OPERATOR'
        ? 'ACKNOWLEDGED'
        : 'ACCEPTED';
  return Object.freeze({
    messageId: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    recipientIds: Object.freeze([message.recipientId]),
    createdAtMs: Date.parse(message.createdAt),
    expiresAtMs: Date.parse(message.expiresAt),
    priority: message.priority,
    contentType: 'application/vnd.sos-sf.critical-message+json',
    messageCommitment: message.commitment ?? `uncommitted:${message.id}`,
    status,
    idempotencyKey: message.idempotencyKey,
    failureReason: message.failureReason,
    provenance: message.provenance,
  });
}
